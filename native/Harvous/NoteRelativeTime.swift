import Foundation

/// Relative time-ago for note lists and cards. Under one minute (or future clock skew) shows **just now**.
enum NoteRelativeTime {
    /// - Parameters:
    ///   - date: Reference instant (typically `note.updatedAt`).
    ///   - now: Clock for "ago" (use `TimelineView`'s `context.date` so labels refresh).
    ///   - abbreviated: Shorter strings in tight layouts (e.g. cards, spotlight).
    static func formatted(_ date: Date, relativeTo now: Date = .now, abbreviated: Bool = false) -> String {
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 {
            return "just now"
        }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = abbreviated ? .abbreviated : .full
        return f.localizedString(for: date, relativeTo: now)
    }
}
