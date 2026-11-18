import Foundation

enum APIError: LocalizedError {
    case signedOut
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .signedOut: return "Sign in again."
        case .http(_, let message): return message
        }
    }
}

/// Talks to the hub's /api/app routes with the session token from Keychain.
final class API {
    static let shared = API()
    static let defaultServer = "https://hub.agenticaiuw.com"

    var server: String {
        get { UserDefaults.standard.string(forKey: "server") ?? API.defaultServer }
        set { UserDefaults.standard.set(newValue, forKey: "server") }
    }
    var token: String? {
        get { Keychain.read("session") }
        set { if let newValue { Keychain.write("session", newValue) } else { Keychain.delete("session") } }
    }

    private let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 20
        return URLSession(configuration: config)
    }()

    private func request(_ method: String, _ path: String, body: [String: Any]? = nil, auth: Bool = true) async throws -> Data {
        guard let url = URL(string: server + path) else { throw APIError.http(0, "The server address is wrong.") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        if auth {
            guard let token else { throw APIError.signedOut }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 && auth { throw APIError.signedOut }
        guard (200..<300).contains(code) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.http(code, message ?? "The hub answered \(code). Try again.")
        }
        return data
    }

    /// Emails a 6-digit code. Returns the code itself only from a local test hub.
    func sendCode(email: String) async throws -> String? {
        if email == Demo.email { return Demo.code }
        let data = try await request("POST", "/api/app/code", body: ["email": email], auth: false)
        return try JSONDecoder().decode(CodeReply.self, from: data).dev_code
    }

    func signIn(email: String, code: String) async throws -> SessionReply {
        if email == Demo.email {
            guard code == Demo.code else { throw APIError.http(400, "That code didn’t work.") }
            Demo.reset()
            token = Demo.token
            return SessionReply(token: Demo.token, expires_at: "", member: Demo.member)
        }
        let data = try await request("POST", "/api/app/session", body: ["email": email, "code": code], auth: false)
        let reply = try JSONDecoder().decode(SessionReply.self, from: data)
        token = reply.token
        return reply
    }

    func feed() async throws -> Feed {
        if Demo.on { return Demo.feed() }
        return try JSONDecoder().decode(Feed.self, from: try await request("GET", "/api/app/me"))
    }

    func setStatus(task id: String, done: Bool) async throws -> HubTask? {
        if Demo.on { return Demo.setStatus(task: id, done: done) }
        let data = try await request("POST", "/api/app/tasks/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)/status", body: ["status": done ? "done" : "open"])
        return try JSONDecoder().decode(TaskReply.self, from: data).task
    }

    /// The website the Hub tab shows: the hub, or the public club site for the demo account.
    var web: String { Demo.on ? Demo.site : server }

    func signOut() async {
        if !Demo.on { _ = try? await request("POST", "/api/app/logout") }
        token = nil
    }
}
