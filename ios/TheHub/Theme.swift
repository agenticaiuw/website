import SwiftUI

/// The hub's dark palette.
enum Theme {
    static let bg = Color(red: 0x14 / 255, green: 0x11 / 255, blue: 0x0F / 255)
    static let surface = Color(red: 0x1C / 255, green: 0x19 / 255, blue: 0x16 / 255)
    static let surface2 = Color(red: 0x25 / 255, green: 0x21 / 255, blue: 0x1D / 255)
    static let fg = Color(red: 0xF6 / 255, green: 0xF1 / 255, blue: 0xE6 / 255)
    static let muted = Color(red: 0xB5 / 255, green: 0xAD / 255, blue: 0xA2 / 255)
    static let accent = Color(red: 0xFF / 255, green: 0x6B / 255, blue: 0x5F / 255)
    static let primary = Color(red: 0xD1 / 255, green: 0x12 / 255, blue: 0x1B / 255)
    static let line = Color(red: 0x2D / 255, green: 0x29 / 255, blue: 0x24 / 255)
}

/// The club logo as it is: the black glove on its white tile.
struct LogoTile: View {
    var size: CGFloat = 72
    var body: some View {
        Image("Logo")
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .accessibilityLabel("Agentic AI UW")
    }
}

/// Dates and times the way the hub writes them.
enum Fmt {
    static func club(_ feed: Feed?) -> ClubTime { ClubTime(feed?.timezone ?? "America/Chicago") }

    /// "Today", "Tomorrow", "Fri, Nov 20".
    static func day(_ day: String, today: String, club: ClubTime) -> String {
        if day == today { return "Today" }
        guard let d = club.date(day), let t = club.date(today) else { return day }
        let diff = club.calendar.dateComponents([.day], from: t, to: d).day ?? 0
        if diff == 1 { return "Tomorrow" }
        if diff == -1 { return "Yesterday" }
        let f = DateFormatter()
        f.timeZone = club.zone
        f.dateFormat = club.calendar.component(.year, from: d) == club.calendar.component(.year, from: t) ? "EEE, MMM d" : "EEE, MMM d, yyyy"
        return f.string(from: d)
    }

    /// "5:45 PM", or "5:45–7:00 PM" with an end.
    static func time(_ start: String, _ end: String) -> String {
        func parts(_ s: String) -> (Int, Int)? {
            let p = s.split(separator: ":").compactMap { Int($0) }
            return p.count >= 2 ? (p[0], p[1]) : nil
        }
        func label(_ h: Int, _ m: Int, suffix: Bool) -> String {
            let h12 = h % 12 == 0 ? 12 : h % 12
            return String(format: "%d:%02d", h12, m) + (suffix ? (h < 12 ? " AM" : " PM") : "")
        }
        guard let s = parts(start) else { return "" }
        guard let e = parts(end) else { return label(s.0, s.1, suffix: true) }
        let same = (s.0 < 12) == (e.0 < 12)
        return label(s.0, s.1, suffix: !same) + "–" + label(e.0, e.1, suffix: true)
    }
}
