import SwiftUI

/// Your meetings and the club's events, by day.
struct MeetingsView: View {
    @EnvironmentObject var store: Store
    @State private var open: HubMeeting?
    @State private var showPast = false

    private var upcoming: [(String, [HubMeeting])] { days(store.feed?.meetings.filter { $0.date >= (store.feed?.today ?? "") } ?? []) }
    private var past: [(String, [HubMeeting])] { days((store.feed?.meetings.filter { $0.date < (store.feed?.today ?? "") } ?? []).reversed()) }

    private func days(_ list: [HubMeeting]) -> [(String, [HubMeeting])] {
        var out: [(String, [HubMeeting])] = []
        for m in list {
            if out.last?.0 == m.date { out[out.count - 1].1.append(m) } else { out.append((m.date, [m])) }
        }
        return out
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.feed == nil {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if upcoming.isEmpty && past.isEmpty {
                    Empty(title: "No meetings coming up", text: "Your teams’ meetings and the club’s events show up here and in Calendar.")
                } else {
                    List {
                        if upcoming.isEmpty {
                            Text("No meetings coming up.").foregroundStyle(Theme.muted).listRowBackground(Theme.surface)
                        }
                        ForEach(upcoming, id: \.0) { day, meetings in
                            Section(header: Text(label(day)).foregroundStyle(day == store.feed?.today ? Theme.accent : Theme.muted)) {
                                ForEach(meetings) { m in MeetingRow(meeting: m) { open = m }.listRowBackground(Theme.surface) }
                            }
                        }
                        if !past.isEmpty {
                            Section {
                                DisclosureGroup("Past two weeks", isExpanded: $showPast) {
                                    ForEach(past, id: \.0) { day, meetings in
                                        ForEach(meetings) { m in MeetingRow(meeting: m, day: label(day)) { open = m } }
                                    }
                                }
                                .foregroundStyle(Theme.muted)
                                .listRowBackground(Theme.surface)
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("Meetings")
            .refreshable { await store.sync(announce: true) }
            .sheet(item: $open) { m in MeetingDetail(meeting: m).environmentObject(store) }
        }
    }

    private func label(_ day: String) -> String {
        guard let feed = store.feed else { return day }
        return Fmt.day(day, today: feed.today, club: Fmt.club(feed))
    }
}

struct MeetingRow: View {
    let meeting: HubMeeting
    var day: String? = nil
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(meeting.time.isEmpty ? "All day" : Fmt.time(meeting.time, ""))
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(Theme.fg)
                    if let day { Text(day).font(.caption).foregroundStyle(Theme.muted) }
                }
                .frame(width: 78, alignment: .leading)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if meeting.kind == "event" {
                            Text("Club event").font(.caption2.weight(.heavy)).textCase(.uppercase)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Theme.accent.opacity(0.18), in: Capsule()).foregroundStyle(Theme.accent)
                        }
                        Text(meeting.title).font(.body.weight(.semibold)).foregroundStyle(Theme.fg).multilineTextAlignment(.leading)
                    }
                    Text([meeting.teams.joined(separator: ", "), meeting.location].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.footnote).foregroundStyle(Theme.muted).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct MeetingDetail: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let meeting: HubMeeting
    @State private var web: URL?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(meeting.title).font(.title2.weight(.bold)).foregroundStyle(Theme.fg)
                    Facts(rows: [
                        ("When", when),
                        ("Where", meeting.location),
                        (meeting.teams.count > 1 ? "Teams" : "Team", meeting.teams.joined(separator: ", ")),
                        ("Host", meeting.host)
                    ])
                    if !meeting.agenda.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Agenda").font(.footnote.weight(.heavy)).textCase(.uppercase).foregroundStyle(Theme.muted)
                            Text(meeting.agenda).font(.body).foregroundStyle(Theme.fg).textSelection(.enabled)
                        }
                    }
                    if let doc = URL(string: meeting.doc_url), !meeting.doc_url.isEmpty {
                        Link(destination: doc) {
                            Label("Open the meeting doc", systemImage: "doc.text")
                                .fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 13)
                                .background(Theme.primary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .foregroundStyle(.white)
                        }
                    }
                    Button { web = URL(string: meeting.url) } label: {
                        Label("Meeting page", systemImage: "arrow.up.right.square").frame(maxWidth: .infinity).padding(.vertical, 12)
                    }
                }
                .padding(20)
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .sheet(item: $web) { url in HubPage(url: url) }
        }
        .presentationDetents([.medium, .large])
    }

    private var when: String {
        guard let feed = store.feed else { return meeting.date }
        let day = Fmt.day(meeting.date, today: feed.today, club: Fmt.club(feed))
        return meeting.time.isEmpty ? day : "\(day) · \(Fmt.time(meeting.time, meeting.end_time))"
    }
}
