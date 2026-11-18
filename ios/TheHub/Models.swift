import Foundation

struct HubMember: Codable, Equatable {
    let id: Int
    let name: String
    let email: String
    let role: String
}

struct HubTask: Codable, Identifiable, Equatable {
    /// A number for meeting tasks, "board-…" for team-board cards.
    let id: String
    /// True for a card on a team board.
    let board: Bool
    let title: String
    let details: String
    /// YYYY-MM-DD in the club's time zone.
    let due_date: String
    /// open, in_progress, done or dropped.
    let status: String
    let completed_at: String?
    let urgent: Bool
    let team: String?
    let meeting: String?
    let assigned_by: String?
    let url: String

    var isDone: Bool { status == "done" }
}

struct HubMeeting: Codable, Identifiable, Equatable {
    let id: Int
    /// meeting, or event for a club event.
    let kind: String
    let title: String
    let date: String
    /// HH:MM, or empty for a meeting with no set time.
    let time: String
    let end_time: String
    let location: String
    let doc_url: String
    let agenda: String
    let teams: [String]
    let host: String?
    let url: String
}

struct Feed: Codable, Equatable {
    let member: HubMember
    let today: String
    let timezone: String
    let app_url: String
    var tasks: [HubTask]
    let meetings: [HubMeeting]
}

struct SessionReply: Codable {
    let token: String
    let expires_at: String
    let member: HubMember
}

struct TaskReply: Codable { let task: HubTask? }
struct CodeReply: Codable { let ok: Bool; let dev_code: String? }

/// Dates from the hub are in the club's time zone (America/Chicago), not the phone's.
struct ClubTime {
    let zone: TimeZone
    init(_ identifier: String) { zone = TimeZone(identifier: identifier) ?? .current }

    var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = zone; return c }

    /// "2026-11-20" (+ "17:45") as a moment.
    func date(_ day: String, _ time: String = "") -> Date? {
        let d = day.split(separator: "-").compactMap { Int($0) }
        guard d.count == 3 else { return nil }
        let t = time.split(separator: ":").compactMap { Int($0) }
        var parts = DateComponents(year: d[0], month: d[1], day: d[2])
        if t.count >= 2 { parts.hour = t[0]; parts.minute = t[1] }
        return calendar.date(from: parts)
    }

    /// The day itself, for an all-day reminder or event.
    func dayComponents(_ day: String) -> DateComponents? {
        let d = day.split(separator: "-").compactMap { Int($0) }
        guard d.count == 3 else { return nil }
        return DateComponents(calendar: Calendar(identifier: .gregorian), year: d[0], month: d[1], day: d[2])
    }
}
