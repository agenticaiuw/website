import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var store: Store
    @State private var confirmSignOut = false
    @Environment(\.scenePhase) private var phase
    /// Redraws the permission notes after a trip to the Settings app.
    @State private var tick = 0

    var body: some View {
        NavigationStack {
            Form {
                if let m = store.feed?.member {
                    Section("Signed in as") {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(m.name).font(.body.weight(.semibold)).foregroundStyle(Theme.fg)
                            Text(m.email).font(.footnote).foregroundStyle(Theme.muted)
                        }
                        .padding(.vertical, 2)
                        if API.shared.server != API.defaultServer {
                            LabeledContent("Server", value: API.shared.server).font(.footnote)
                        }
                    }
                    .listRowBackground(Theme.surface)
                }

                Section {
                    Toggle(isOn: Binding(get: { store.remindersOn }, set: { v in Task { await store.setReminders(v) } })) {
                        Label("Tasks in Reminders", systemImage: "checklist")
                    }
                    if store.remindersOn && !store.apple.remindersAllowed { blocked("Reminders") }

                    Toggle(isOn: Binding(get: { store.calendarOn }, set: { v in Task { await store.setCalendar(v) } })) {
                        Label("Meetings in Calendar", systemImage: "calendar")
                    }
                    if store.calendarOn && !store.apple.calendarAllowed { blocked("Calendar") }

                    Toggle(isOn: Binding(get: { store.alertsOn }, set: { v in store.alertsOn = v; Task { await store.sync() } })) {
                        Label("Alert 30 minutes before", systemImage: "bell")
                    }
                    .disabled(!store.calendarOn)
                } header: {
                    Text("Apple apps")
                } footer: {
                    Text("Your tasks go in a Reminders list called “The Hub”, and your meetings and the club’s events go in a calendar called “The Hub”. Check a task off in Reminders and it’s marked done in the hub the next time the app syncs: right away if the app is open, otherwise when you open it or iOS refreshes it in the background.")
                }
                .listRowBackground(Theme.surface)
                .id(tick)

                Section {
                    Button {
                        Task { await store.sync(announce: true) }
                    } label: {
                        HStack {
                            Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
                            Spacer()
                            if store.syncing { ProgressView() }
                        }
                    }
                    .disabled(store.syncing)
                } footer: {
                    if !store.lastSync.isEmpty { Text("Last synced \(store.lastSync).") }
                }
                .listRowBackground(Theme.surface)

                Section {
                    Button("Sign out", role: .destructive) { confirmSignOut = true }
                } footer: {
                    VStack(spacing: 10) {
                        LogoTile(size: 40)
                        Text("The Hub \(version) · Agentic AI UW")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 24)
                }
                .listRowBackground(Theme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("Settings")
            .confirmationDialog("Sign out of The Hub?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await store.signOut() } }
            } message: {
                Text("This removes the “The Hub” list and calendar from this phone. Nothing changes in the hub.")
            }
            .onChange(of: phase) { _, p in if p == .active { tick += 1 } }
        }
    }

    private func blocked(_ app: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("The Hub can’t reach \(app). Turn on full access in Settings.")
                .font(.footnote).foregroundStyle(Theme.accent)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
            .font(.footnote.weight(.semibold))
        }
    }

    private var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }
}
