import SwiftUI

/// Sign in the way the website does: an emailed 6-digit code.
struct LoginView: View {
    @EnvironmentObject var store: Store
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var working = false
    @State private var message: String?
    @State private var server = API.shared.server
    @State private var advanced = false
    @FocusState private var focus: Field?
    enum Field { case email, code }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 14) {
                    LogoTile(size: 76)
                    Text("The Hub")
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.fg)
                    Text("Agentic AI UW’s tasks and meetings, with your club tasks in Reminders and your meetings in Calendar.")
                        .font(.body)
                        .foregroundStyle(Theme.muted)
                }
                .padding(.top, 40)

                VStack(alignment: .leading, spacing: 10) {
                    Text(sent ? "Code" : "Email").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    if sent {
                        TextField("6-digit code", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .focused($focus, equals: .code)
                            .font(.title2.monospacedDigit())
                            .field()
                        Text("We sent a code to \(email). It works for 10 minutes.")
                            .font(.footnote).foregroundStyle(Theme.muted)
                    } else {
                        TextField("you@wisc.edu", text: $email)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focus, equals: .email)
                            .submitLabel(.send)
                            .onSubmit { Task { await send() } }
                            .field()
                        Text("Use the email you’re on the club roster with.")
                            .font(.footnote).foregroundStyle(Theme.muted)
                    }
                }

                if let message {
                    Text(message).font(.footnote.weight(.medium)).foregroundStyle(Theme.accent)
                }

                Button {
                    Task { sent ? await verify() : await send() }
                } label: {
                    HStack {
                        if working { ProgressView().tint(.white) }
                        Text(sent ? "Sign in" : "Email me a code").fontWeight(.bold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Theme.primary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundStyle(.white)
                }
                .disabled(working || (sent ? code.count < 6 : !email.contains("@")))
                .opacity(working || (sent ? code.count < 6 : !email.contains("@")) ? 0.6 : 1)

                if sent {
                    HStack {
                        Button("Send a new code") { Task { await send() } }
                        Spacer()
                        Button("Use a different email") { sent = false; code = ""; message = nil; focus = .email }
                    }
                    .font(.footnote.weight(.semibold))
                }

                DisclosureGroup("Advanced", isExpanded: $advanced) {
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Server", text: $server)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .field()
                            .onChange(of: server) { _, v in API.shared.server = v.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "/")) }
                        Text("Only change this to test a copy of the hub.").font(.footnote).foregroundStyle(Theme.muted)
                    }
                    .padding(.top, 8)
                }
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.bg.ignoresSafeArea())
        .onAppear { focus = sent ? .code : .email }
    }

    private func send() async {
        let e = email.trimmingCharacters(in: .whitespaces).lowercased()
        guard e.contains("@") else { return }
        working = true; defer { working = false }
        do {
            let dev = try await store.sendCode(email: e)
            email = e
            sent = true
            message = nil
            if let dev { code = dev }
            focus = .code
        } catch {
            message = error.localizedDescription
        }
    }

    private func verify() async {
        working = true; defer { working = false }
        do {
            try await store.signIn(email: email, code: code.filter(\.isNumber))
        } catch {
            message = error.localizedDescription
        }
    }
}

extension View {
    /// A text field drawn like the hub's.
    func field() -> some View {
        padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line, lineWidth: 1))
            .foregroundStyle(Theme.fg)
    }
}
