import Foundation

/// Folder-scoring context guards — skip incidental spiritual mentions that describe
/// childhood church ritual rather than the note's subject. Keep in sync with web
/// `folder-keyword-context.ts`.
enum FolderKeywordContextGate {
    private static let ritualDescriptiveFolderNames: Set<String> = [
        "prayer", "worship", "communion", "praise", "thanksgiving", "baptism", "sabbath",
    ]

    private static let ritualDescriptivePattern =
        #"\b([a-z][a-z\s'-]{0,40})\s+was\s+(?:this|a|just)\b"#

    static func isRitualDescriptiveFolderMention(keywordName: String, title: String, body: String) -> Bool {
        let key = keywordName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard ritualDescriptiveFolderNames.contains(key) else { return false }
        let corpus = "\(title) \(body)".trimmingCharacters(in: .whitespacesAndNewlines)
        guard !corpus.isEmpty else { return false }
        guard let regex = try? NSRegularExpression(pattern: ritualDescriptivePattern, options: .caseInsensitive) else {
            return false
        }
        let ns = corpus as NSString
        let range = NSRange(location: 0, length: ns.length)
        for m in regex.matches(in: corpus, range: range) {
            guard m.numberOfRanges >= 2 else { continue }
            let subject = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if subject == key { return true }
        }
        return false
    }

    static let ritualDescriptiveFolderScorePenalty: Double = 0.18

    /// Church as a venue (attendance / building) — not the note's organizing theme.
    private static let churchAttendancePatterns = [
        #"\bat\s+(?:a\s+|the\s+)?church\b"#,
        #"\bto\s+(?:a\s+|the\s+|this\s+|that\s+)?(?:\w+\s+){0,3}church\b"#,
        #"\b(?:went|go|goes|going|attended|attend)\b[^.]{0,80}\bchurch\b"#,
        #"\bin\s+church\b"#,
        #"\bchurch\s+building\b"#,
        #"\btime\s+at\s+this\s+church\b"#,
        #"\b(?:local|other|this|that)\s+(?:\w+\s+){0,2}church\b"#,
    ]

    static func shouldSkipChurchAttendance(
        keywordName: String,
        needle: String,
        in textLower: String,
        matchRange: NSRange
    ) -> Bool {
        let key = keywordName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard key == "church" else { return false }
        let needleLower = needle.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard needleLower.contains("church") else { return false }
        for pattern in churchAttendancePatterns {
            if range(matchRange, isInsidePattern: pattern, in: textLower) { return true }
        }
        return false
    }

    private static func range(_ matchRange: NSRange, isInsidePattern pattern: String, in textLower: String) -> Bool {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return false }
        let n = (textLower as NSString).length
        var inside = false
        regex.enumerateMatches(in: textLower, options: [], range: NSRange(location: 0, length: n)) { m, _, stop in
            guard let m else { return }
            let start = m.range.location
            let end = start + m.range.length
            if matchRange.location >= start, matchRange.location < end {
                inside = true
                stop.pointee = true
            }
        }
        return inside
    }
}
