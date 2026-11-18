import EventKit
import UIKit

/// Writes the hub's tasks into a Reminders list and its meetings into a calendar, both called
/// "The Hub", in the phone's default account (iCloud when signed in, so they reach the Mac too).
/// Each item is keyed by hub id, so a sync updates it in place instead of adding a copy.
/// A task checked off (or back on) in Reminders goes back to the hub on the next sync.
final class AppleSync {
    let store = EKEventStore()
    static let name = "The Hub"
    private let red = UIColor(red: 0xD1 / 255, green: 0x12 / 255, blue: 0x1B / 255, alpha: 1)

    /// hub key ("task:12", "meeting:40") → EventKit identifier.
    private var ids: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: "ek.ids") as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "ek.ids") }
    }
    /// Whether each task's reminder was checked off when we last wrote it, to spot checks made in Reminders.
    private var wroteDone: [String: Bool] {
        get { UserDefaults.standard.dictionary(forKey: "ek.done") as? [String: Bool] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "ek.done") }
    }

    var remindersAllowed: Bool { EKEventStore.authorizationStatus(for: .reminder) == .fullAccess }
    var calendarAllowed: Bool { EKEventStore.authorizationStatus(for: .event) == .fullAccess }
    var remindersAsked: Bool { EKEventStore.authorizationStatus(for: .reminder) != .notDetermined }
    var calendarAsked: Bool { EKEventStore.authorizationStatus(for: .event) != .notDetermined }

    func askReminders() async -> Bool { (try? await store.requestFullAccessToReminders()) ?? false }
    func askCalendar() async -> Bool { (try? await store.requestFullAccessToEvents()) ?? false }

    /// Our own list or calendar: the one made before, or a new one in the default account.
    private func own(_ type: EKEntityType) throws -> EKCalendar {
        let saved = "ek.cal.\(type == .event ? "event" : "reminder")"
        if let id = UserDefaults.standard.string(forKey: saved), let c = store.calendar(withIdentifier: id) { return c }
        if let c = store.calendars(for: type).first(where: { $0.title == AppleSync.name && $0.allowsContentModifications }) {
            UserDefaults.standard.set(c.calendarIdentifier, forKey: saved)
            return c
        }
        let c = EKCalendar(for: type, eventStore: store)
        c.title = AppleSync.name
        c.cgColor = red.cgColor
        let source = (type == .event ? store.defaultCalendarForNewEvents?.source : store.defaultCalendarForNewReminders()?.source)
            ?? store.sources.first(where: { $0.sourceType == .calDAV })
            ?? store.sources.first(where: { $0.sourceType == .local })
        guard let source else {
            throw NSError(domain: "AppleSync", code: 1, userInfo: [NSLocalizedDescriptionKey: "This iPhone has no account for \(type == .event ? "calendars" : "reminders")."])
        }
        c.source = source
        try store.saveCalendar(c, commit: true)
        UserDefaults.standard.set(c.calendarIdentifier, forKey: saved)
        return c
    }

    /// Tasks checked off (true) or back on (false) in Reminders since the last sync, when the hub still says otherwise.
    func checkedInReminders(_ tasks: [HubTask]) -> [(id: String, done: Bool)] {
        guard remindersAllowed else { return [] }
        let ids = self.ids, wrote = wroteDone
        return tasks.compactMap { t in
            let key = "task:\(t.id)"
            guard let id = ids[key], let was = wrote[key], let r = store.calendarItem(withIdentifier: id) as? EKReminder else { return nil }
            return r.isCompleted != was && r.isCompleted != t.isDone ? (t.id, r.isCompleted) : nil
        }
    }

    /// Puts the feed into Reminders and Calendar. Returns a short summary like "3 added, 1 updated".
    @discardableResult
    func apply(_ feed: Feed, reminders: Bool, calendar: Bool, alerts: Bool) throws -> String {
        var ids = self.ids, wrote = wroteDone
        var seen = Set<String>()
        var added = 0, updated = 0, removed = 0
        let club = ClubTime(feed.timezone)
        let doReminders = reminders && remindersAllowed
        let doCalendar = calendar && calendarAllowed

        if doReminders {
            let list = try own(.reminder)
            for t in feed.tasks {
                let key = "task:\(t.id)"
                seen.insert(key)
                let existing = ids[key].flatMap { store.calendarItem(withIdentifier: $0) as? EKReminder }
                let r = existing ?? EKReminder(eventStore: store)
                if existing == nil { r.calendar = list }
                r.title = t.title
                r.notes = notes(t)
                r.url = URL(string: t.url)
                r.dueDateComponents = club.dayComponents(t.due_date)
                r.priority = t.urgent ? 1 : 0
                if r.isCompleted != t.isDone { r.isCompleted = t.isDone }
                try store.save(r, commit: false)
                ids[key] = r.calendarItemIdentifier
                wrote[key] = t.isDone
                if existing == nil { added += 1 } else { updated += 1 }
            }
        }

        if doCalendar {
            let cal = try own(.event)
            for m in feed.meetings {
                guard let day = club.date(m.date) else { continue }
                let key = "meeting:\(m.id)"
                seen.insert(key)
                let existing = ids[key].flatMap { store.calendarItem(withIdentifier: $0) as? EKEvent }
                let e = existing ?? EKEvent(eventStore: store)
                if existing == nil { e.calendar = cal }
                e.title = m.title
                e.location = m.location.isEmpty ? nil : m.location
                e.notes = notes(m)
                e.url = URL(string: m.url)
                if let start = club.date(m.date, m.time), !m.time.isEmpty {
                    let end = m.end_time.isEmpty ? nil : club.date(m.date, m.end_time)
                    e.isAllDay = false
                    e.timeZone = club.zone
                    e.startDate = start
                    e.endDate = (end ?? start) > start ? end! : start.addingTimeInterval(3600)
                } else {
                    e.isAllDay = true
                    e.startDate = day
                    e.endDate = club.calendar.date(byAdding: .day, value: 1, to: day) ?? day
                }
                e.alarms = nil
                if alerts && !m.time.isEmpty { e.addAlarm(EKAlarm(relativeOffset: -30 * 60)) }
                try store.save(e, span: .thisEvent, commit: false)
                ids[key] = e.calendarItemIdentifier
                if existing == nil { added += 1 } else { updated += 1 }
            }
        }

        // What's no longer in the feed. Only touch a kind we may read; turned off, its items come out.
        let weekAgo = Date().addingTimeInterval(-7 * 86400)
        for (key, id) in ids where !seen.contains(key) {
            let isTask = key.hasPrefix("task:")
            guard isTask ? remindersAllowed : calendarAllowed else { continue }
            let on = isTask ? doReminders : doCalendar
            guard let item = store.calendarItem(withIdentifier: id) else {
                ids[key] = nil; wrote[key] = nil; continue
            }
            if let r = item as? EKReminder {
                // A finished task that aged out of the feed stays checked off; a dropped or reassigned one goes.
                if on && r.isCompleted { ids[key] = nil; wrote[key] = nil; continue }
                try? store.remove(r, commit: false)
            } else if let e = item as? EKEvent {
                // Past meetings stay on the calendar as history; upcoming ones that were canceled go.
                if on && e.startDate < weekAgo { ids[key] = nil; continue }
                try? store.remove(e, span: .thisEvent, commit: false)
            }
            removed += 1
            ids[key] = nil; wrote[key] = nil
        }

        try store.commit()
        self.ids = ids
        wroteDone = wrote
        let parts = [added > 0 ? "\(added) added" : nil, removed > 0 ? "\(removed) removed" : nil].compactMap { $0 }
        return parts.isEmpty ? "Up to date" : parts.joined(separator: ", ")
    }

    /// Takes everything the app added out of Reminders and Calendar (on sign-out).
    func removeAll() {
        for (_, id) in ids {
            guard let item = store.calendarItem(withIdentifier: id) else { continue }
            if let r = item as? EKReminder { try? store.remove(r, commit: false) }
            else if let e = item as? EKEvent { try? store.remove(e, span: .thisEvent, commit: false) }
        }
        try? store.commit()
        ids = [:]
        wroteDone = [:]
    }

    private func notes(_ t: HubTask) -> String {
        let from = [t.team, t.meeting.map { "From \($0)" }, t.assigned_by.map { "Assigned by \($0)" }].compactMap { $0 }.joined(separator: " · ")
        return [from, t.details.trimmingCharacters(in: .whitespacesAndNewlines), t.url].filter { !$0.isEmpty }.joined(separator: "\n\n")
    }

    private func notes(_ m: HubMeeting) -> String {
        let who = [m.teams.joined(separator: ", "), m.host.map { "Hosted by \($0)" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let doc = m.doc_url.isEmpty ? "" : "Meeting doc: \(m.doc_url)"
        let agenda = m.agenda.trimmingCharacters(in: .whitespacesAndNewlines)
        return [who, agenda.isEmpty ? "" : "Agenda\n\(agenda)", doc, m.url].filter { !$0.isEmpty }.joined(separator: "\n\n")
    }
}
