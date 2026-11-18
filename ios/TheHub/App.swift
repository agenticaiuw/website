import SwiftUI

@main
struct TheHubApp: App {
    @StateObject private var store: Store
    @Environment(\.scenePhase) private var phase

    init() {
        let s = Store()
        _store = StateObject(wrappedValue: s)
        Store.registerRefresh(s)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
        .onChange(of: phase) { _, p in
            if p == .active { Task { await store.sync() } }
            if p == .background { Store.scheduleRefresh() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        Group {
            if store.signedIn { MainTabView() } else { LoginView() }
        }
        .background(Theme.bg.ignoresSafeArea())
        .alert("Something went wrong", isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK") { store.error = nil }
        } message: {
            Text(store.error ?? "")
        }
        .overlay(alignment: .bottom) {
            if let t = store.toast {
                Text(t)
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 64)
                    .task { try? await Task.sleep(nanoseconds: 2_500_000_000); store.toast = nil }
            }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        TabView {
            TasksView().tabItem { Label("Tasks", systemImage: "checklist") }
            MeetingsView().tabItem { Label("Meetings", systemImage: "calendar") }
            HubWebView().tabItem { Label("Hub", systemImage: "square.grid.2x2") }
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .task { if store.feed == nil { await store.sync() } }
    }
}
