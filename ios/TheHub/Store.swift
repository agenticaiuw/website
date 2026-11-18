import BackgroundTasks
import EventKit
import SwiftUI

@MainActor
final class Store: ObservableObject {
    @Published var feed: Feed?
    @Published var signedIn = API.shared.token != nil
    @Published var syncing = false
    @Published var error: String?
    @Published var toast: String?

    @AppStorage("reminders") var remindersOn = true
    @AppStorage("calendar") var calendarOn = true
    @AppStorage("alerts") var alertsOn = true
    @AppStorage("lastSync") var lastSync = ""

    let apple = AppleSync()
    /// EventKit writes must never overlap.
    private var busy = false
    private var changeTask: Task<Void, Never>?

    init() {
        // Checking a task off in Reminders while the app is open sends it to the hub right away.
        NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: apple.store, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.remindersChanged() }
        }
    }

    // MARK: sign-in

    func sendCode(email: String) async throws -> String? { try await API.shared.sendCode(email: email) }

    func signIn(email: String, code: String) async throws {
        _ = try await API.shared.signIn(email: email, code: code)
        signedIn = true
        await askPermissions()
        await sync()
    }

    func signOut() async {
        apple.removeAll()
        await API.shared.signOut()
        WebSession.clear()
        feed = nil
        lastSync = ""
        signedIn = false
    }

    private func signedOutByServer() {
        API.shared.token = nil
        feed = nil
        signedIn = false
        error = "You were signed out. Sign in again to keep your tasks and meetings up to date."
    }

    // MARK: Apple permissions

    func askPermissions() async {
        if remindersOn && !apple.remindersAsked { remindersOn = await apple.askReminders() }
        if calendarOn && !apple.calendarAsked { calendarOn = await apple.askCalendar() }
    }

    /// Turning a switch on asks for access the first time.
    func setReminders(_ on: Bool) async {
        if on && !apple.remindersAllowed && !apple.remindersAsked { remindersOn = await apple.askReminders() } else { remindersOn = on }
        await sync()
    }

    func setCalendar(_ on: Bool) async {
        if on && !apple.calendarAllowed && !apple.calendarAsked { calendarOn = await apple.askCalendar() } else { calendarOn = on }
        await sync()
    }

    // MARK: sync

    /// Hub → app, check-offs made in Reminders → hub, then the app → Reminders and Calendar.
    func sync(announce: Bool = false) async {
        guard signedIn, !busy else { return }
        busy = true; syncing = true
        defer { busy = false; syncing = false }
        do {
            var next = try await API.shared.feed()
            let checks = remindersOn ? apple.checkedInReminders(next.tasks) : []
            for c in checks { _ = try? await API.shared.setStatus(task: c.id, done: c.done) }
            if !checks.isEmpty { next = try await API.shared.feed() }
            feed = next
            let summary = try apple.apply(next, reminders: remindersOn, calendar: calendarOn, alerts: alertsOn)
            lastSync = Date().formatted(date: .abbreviated, time: .shortened)
            if announce { toast = summary }
            error = nil
        } catch APIError.signedOut {
            signedOutByServer()
        } catch {
            if announce || feed == nil { self.error = error.localizedDescription }
        }
    }

    /// Checks the task off (or back on) in the hub, then syncs so Reminders matches.
    func toggle(_ task: HubTask) async {
        guard let i = feed?.tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let done = !task.isDone
        do {
            if let fresh = try await API.shared.setStatus(task: task.id, done: done) { feed?.tasks[i] = fresh }
            await sync()
        } catch APIError.signedOut {
            signedOutByServer()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func remindersChanged() {
        guard signedIn, remindersOn, let feed, !busy else { return }
        changeTask?.cancel()
        changeTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard let self, !Task.isCancelled else { return }
            if !self.apple.checkedInReminders(feed.tasks).isEmpty { await self.sync() }
        }
    }

    // MARK: background refresh

    nonisolated static let refreshId = "com.evanliu.thehub.refresh"

    nonisolated static func scheduleRefresh() {
        let req = BGAppRefreshTaskRequest(identifier: refreshId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(req)
    }

    nonisolated static func registerRefresh(_ store: Store) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshId, using: nil) { task in
            scheduleRefresh()
            let work = Task { @MainActor in
                await store.sync()
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
    }
}
