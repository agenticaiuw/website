import SwiftUI

/// Your tasks, by when they're due. Tap the circle to mark one done.
struct TasksView: View {
    @EnvironmentObject var store: Store
    @State private var open: HubTask?

    private var groups: [(String, [HubTask])] {
        guard let feed = store.feed else { return [] }
        let club = Fmt.club(feed)
        let week = club.date(feed.today).flatMap { club.calendar.date(byAdding: .day, value: 7, to: $0) }
        let weekDay = week.map { d -> String in
            let c = club.calendar.dateComponents([.year, .month, .day], from: d)
            return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        } ?? feed.today
        let todo = feed.tasks.filter { !$0.isDone }
        let done = feed.tasks.filter(\.isDone).sorted { ($0.completed_at ?? "") > ($1.completed_at ?? "") }
        return [
            ("Overdue", todo.filter { $0.due_date < feed.today }),
            ("Today", todo.filter { $0.due_date == feed.today }),
            ("This week", todo.filter { $0.due_date > feed.today && $0.due_date < weekDay }),
            ("Later", todo.filter { $0.due_date >= weekDay }),
            ("Done", done)
        ].filter { !$0.1.isEmpty }
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.feed == nil {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if groups.isEmpty {
                    Empty(title: "Nothing on your list", text: "Tasks you’re given in the hub show up here and in Reminders.")
                } else {
                    List {
                        ForEach(groups, id: \.0) { name, tasks in
                            Section {
                                ForEach(tasks) { t in
                                    TaskRow(task: t, overdue: name == "Overdue") { open = t }
                                        .listRowBackground(Theme.surface)
                                }
                            } header: {
                                Text(name).foregroundStyle(name == "Overdue" ? Theme.accent : Theme.muted)
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("Tasks")
            .refreshable { await store.sync(announce: true) }
            .sheet(item: $open) { t in TaskDetail(task: t).environmentObject(store) }
        }
    }
}

struct TaskRow: View {
    @EnvironmentObject var store: Store
    let task: HubTask
    var overdue = false
    let onOpen: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                Task { await store.toggle(task) }
            } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(task.isDone ? Theme.accent : Theme.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(task.isDone ? "Mark not done" : "Mark done")

            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if task.urgent && !task.isDone {
                            Text("Urgent").font(.caption2.weight(.heavy)).textCase(.uppercase)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Theme.primary, in: Capsule()).foregroundStyle(.white)
                        }
                        Text(task.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(task.isDone ? Theme.muted : Theme.fg)
                            .strikethrough(task.isDone, color: Theme.muted)
                            .multilineTextAlignment(.leading)
                    }
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(overdue ? Theme.accent : Theme.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }

    private var subtitle: String {
        guard let feed = store.feed else { return "" }
        let due = task.isDone ? "Done" : "Due " + Fmt.day(task.due_date, today: feed.today, club: Fmt.club(feed)).lowercasedFirst
        return [due, task.team].compactMap { $0 }.joined(separator: " · ")
    }
}

struct TaskDetail: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let task: HubTask
    @State private var web: URL?

    private var current: HubTask { store.feed?.tasks.first { $0.id == task.id } ?? task }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(current.title).font(.title2.weight(.bold)).foregroundStyle(Theme.fg)
                    Facts(rows: [
                        ("Due", store.feed.map { Fmt.day(current.due_date, today: $0.today, club: Fmt.club($0)) } ?? current.due_date),
                        ("Team", current.team),
                        ("From", current.meeting),
                        ("Assigned by", current.assigned_by)
                    ])
                    if !current.details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(current.details).font(.body).foregroundStyle(Theme.fg).textSelection(.enabled)
                    }
                    Button {
                        Task { await store.toggle(current) }
                    } label: {
                        Label(current.isDone ? "Mark not done" : "Mark done", systemImage: current.isDone ? "arrow.uturn.backward" : "checkmark")
                            .fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 13)
                            .background(current.isDone ? Theme.surface2 : Theme.primary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(.white)
                    }
                    Button { web = URL(string: current.url) } label: {
                        Label("Open in the hub", systemImage: "arrow.up.right.square").frame(maxWidth: .infinity).padding(.vertical, 12)
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
}

/// Label–value rows, skipping empty ones.
struct Facts: View {
    let rows: [(String, String?)]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(rows.filter { !($0.1 ?? "").isEmpty }, id: \.0) { label, value in
                HStack(alignment: .firstTextBaseline) {
                    Text(label).font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted).frame(width: 96, alignment: .leading)
                    Text(value ?? "").font(.subheadline).foregroundStyle(Theme.fg).textSelection(.enabled)
                }
            }
        }
    }
}

struct Empty: View {
    let title: String
    let text: String
    var body: some View {
        VStack(spacing: 14) {
            LogoTile(size: 64)
            Text(title).font(.headline).foregroundStyle(Theme.fg)
            Text(text).font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension URL: @retroactive Identifiable { public var id: String { absoluteString } }

extension String {
    var lowercasedFirst: String {
        guard let f = first else { return self }
        // "Today" → "today", but "Fri, Nov 20" stays.
        return ["Today", "Tomorrow", "Yesterday"].contains(self) ? f.lowercased() + dropFirst() : self
    }
}
