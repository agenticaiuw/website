import Foundation

/// Sample data behind demo@agenticaiuw.com, for App Review and screenshots. Nothing in it
/// reaches the hub: check-offs are kept on the phone, and dates follow today.
enum Demo {
    static let email = "demo@agenticaiuw.com"
    static let code = "123456"
    static let token = "demo"
    static let site = "https://agenticaiuw.com"
    private static let doneKey = "demo.done"

    static var on: Bool { API.shared.token == token }

    static let member = HubMember(id: 0, name: "Demo Member", email: email, role: "member")

    static func feed() -> Feed {
        let club = ClubTime("America/Chicago")
        let today = club.calendar.startOfDay(for: Date())
        func day(_ offset: Int) -> String {
            let d = club.calendar.date(byAdding: .day, value: offset, to: today) ?? today
            let c = club.calendar.dateComponents([.year, .month, .day], from: d)
            return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        }
        let done = UserDefaults.standard.dictionary(forKey: doneKey) as? [String: Bool] ?? [:]
        func task(_ id: String, _ title: String, _ details: String, due: Int, team: String, meeting: String?, by: String?, urgent: Bool = false, board: Bool = false) -> HubTask {
            let isDone = done[id] ?? false
            return HubTask(id: id, board: board, title: title, details: details, due_date: day(due), status: isDone ? "done" : "open",
                           completed_at: isDone ? day(0) + "T12:00:00.000Z" : nil, urgent: urgent, team: team, meeting: meeting,
                           assigned_by: by, url: site)
        }
        let tasks = [
            task("1", "Order the dev boards", "Two boards with Bluetooth, shipped to the lab.", due: -1, team: "Hardware", meeting: "Hardware team meeting", by: "Alex Kim", urgent: true),
            task("2", "Book a room for the general meeting", "Room for about 40 people with a projector.", due: 0, team: "Exec Board", meeting: "Exec Board meeting", by: "Sam Patel"),
            task("3", "Draft the sensor spec", "One page: what it measures, battery life, and cost.", due: 2, team: "Hardware", meeting: "Hardware team meeting", by: "Alex Kim"),
            task("board-4", "Write the demo script", "", due: 4, team: "Research", meeting: nil, by: nil, board: true),
            task("5", "Post the meeting recap", "Photos and three takeaways.", due: 9, team: "Outreach", meeting: "Outreach sync", by: "Jordan Lee")
        ]
        let meetings = [
            HubMeeting(id: 1, kind: "meeting", title: "Exec Board meeting", date: day(0), time: "18:00", end_time: "19:00",
                       location: "Morgridge Hall Org Suite", doc_url: "", agenda: "Room for the general meeting\nBudget check-in",
                       teams: ["Exec Board"], host: "Sam Patel", url: site),
            HubMeeting(id: 2, kind: "meeting", title: "Hardware team meeting", date: day(1), time: "17:30", end_time: "18:30",
                       location: "Morgridge Hall Org Suite", doc_url: "", agenda: "Dev boards\nSensor spec",
                       teams: ["Hardware"], host: "Alex Kim", url: site),
            HubMeeting(id: 3, kind: "event", title: "General meeting", date: day(3), time: "17:00", end_time: "18:30",
                       location: "Wisconsin Entrepreneurship Hub, 2nd floor", doc_url: "", agenda: "Team updates and demos",
                       teams: [], host: nil, url: site),
            HubMeeting(id: 4, kind: "meeting", title: "Outreach sync", date: day(6), time: "12:00", end_time: "12:30",
                       location: "Memorial Union", doc_url: "", agenda: "",
                       teams: ["Outreach"], host: "Jordan Lee", url: site)
        ]
        return Feed(member: member, today: day(0), timezone: "America/Chicago", app_url: site, tasks: tasks, meetings: meetings)
    }

    static func setStatus(task id: String, done: Bool) -> HubTask? {
        var all = UserDefaults.standard.dictionary(forKey: doneKey) as? [String: Bool] ?? [:]
        all[id] = done
        UserDefaults.standard.set(all, forKey: doneKey)
        return feed().tasks.first { $0.id == id }
    }

    static func reset() { UserDefaults.standard.removeObject(forKey: doneKey) }
}
