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
            return abbreviated ? "now" : "just now"
        }

        let minutes = Int(seconds / 60)
        if minutes < 60 {
            return relativePhrase(value: minutes, unit: .minute, relativeTo: now, abbreviated: abbreviated)
        }

        let hours = minutes / 60
        if hours < 24 {
            return relativePhrase(value: hours, unit: .hour, relativeTo: now, abbreviated: abbreviated)
        }

        let days = hours / 24
        if days < 14 {
            return relativePhrase(value: days, unit: .day, relativeTo: now, abbreviated: abbreviated)
        }

        let weeks = days / 7
        if weeks < 10 {
            return relativePhrase(value: weeks, unit: .weekOfYear, relativeTo: now, abbreviated: abbreviated)
        }

        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    private static func relativePhrase(
        value: Int,
        unit: Calendar.Component,
        relativeTo now: Date,
        abbreviated: Bool
    ) -> String {
        var components = DateComponents()
        switch unit {
        case .minute:
            components.minute = -value
        case .hour:
            components.hour = -value
        case .day:
            components.day = -value
        case .weekOfYear:
            components.weekOfYear = -value
        default:
            break
        }
        let past = Calendar.current.date(byAdding: components, to: now) ?? now
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = abbreviated ? .abbreviated : .full
        return formatter.localizedString(for: past, relativeTo: now)
    }
}
