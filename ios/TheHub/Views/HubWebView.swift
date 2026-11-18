import SwiftUI
import WebKit

/// The full hub website, already signed in with the app's session.
struct HubWebView: View {
    @EnvironmentObject var store: Store
    @State private var reload = 0

    var body: some View {
        NavigationStack {
            HubWeb(url: URL(string: API.shared.web), reload: reload) { Task { await store.signOut() } }
                .background(Theme.bg.ignoresSafeArea())
                .navigationTitle("Hub")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { reload += 1 } label: { Image(systemName: "house") }
                            .accessibilityLabel("Hub home")
                    }
                }
        }
    }
}

/// One hub page in a sheet, such as a task or meeting page.
struct HubPage: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let url: URL

    var body: some View {
        NavigationStack {
            HubWeb(url: url) { dismiss() }
                .background(Theme.bg.ignoresSafeArea())
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

/// Website sign-ins made for the Hub tab.
enum WebSession {
    static let cookie = "hub_session"

    /// Forgets the hub's cookies when you sign out of the app.
    static func clear() {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
    }

    /// The app's session token as the website's sign-in cookie.
    static func cookie(for server: URL, token: String) -> HTTPCookie? {
        guard let host = server.host else { return nil }
        var props: [HTTPCookiePropertyKey: Any] = [
            .name: cookie,
            .value: token,
            .domain: host,
            .path: "/",
            .expires: Date(timeIntervalSinceNow: 60 * 86_400)
        ]
        if server.scheme == "https" { props[.secure] = "TRUE" }
        return HTTPCookie(properties: props)
    }
}

struct HubWeb: UIViewRepresentable {
    let url: URL?
    var reload = 0
    /// Called when the page tries to sign out, so the app signs out too.
    let onSignOut: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onSignOut: onSignOut) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.isOpaque = false
        web.backgroundColor = UIColor(Theme.bg)
        web.scrollView.backgroundColor = UIColor(Theme.bg)
        web.refreshControl(context.coordinator)
        context.coordinator.server = URL(string: API.shared.web)?.host
        load(web)
        context.coordinator.reload = reload
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if context.coordinator.reload != reload {
            context.coordinator.reload = reload
            load(web)
        }
    }

    private func load(_ web: WKWebView) {
        guard let url else { return }
        let go = { _ = web.load(URLRequest(url: url)) }
        guard !Demo.on, let server = URL(string: API.shared.server), let token = API.shared.token,
              let cookie = WebSession.cookie(for: server, token: token) else { go(); return }
        web.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { go() }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var server: String?
        var reload = 0
        let onSignOut: () -> Void
        init(onSignOut: @escaping () -> Void) { self.onSignOut = onSignOut }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .allow }
            if url.host == server {
                if url.path == "/logout" { onSignOut(); return .cancel }
                return .allow
            }
            // Docs, forms and other sites open in their own app or Safari.
            if action.navigationType == .linkActivated || action.targetFrame == nil {
                await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }

        /// Links that open a new window (target=_blank).
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if url.host == server { webView.load(action.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        @objc func pulled(_ sender: UIRefreshControl) {
            (sender.superview?.superview as? WKWebView)?.reload()
            sender.endRefreshing()
        }
    }
}

private extension WKWebView {
    func refreshControl(_ target: HubWeb.Coordinator) {
        let rc = UIRefreshControl()
        rc.addTarget(target, action: #selector(HubWeb.Coordinator.pulled(_:)), for: .valueChanged)
        scrollView.refreshControl = rc
    }
}
