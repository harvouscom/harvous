import Foundation

/// Phrase-context guards for the Jesus character keyword — skip devotional Christ-language
/// ("in Christ", "O Lord") while keeping person-focused study. Keep in sync with web
/// `christ-keyword-context.ts`.
enum ChristKeywordContextGate {
    private static let devotionalPatterns: [String] = [
        #"\bin\s+christ\b"#,
        #"\bthrough\s+christ\b"#,
        #"\brelationship\s+with\s+(?:christ|jesus|the\s+lord|lord)\b"#,
        #"\bo\s+lord\b"#,
        #"\bdear\s+lord\b"#,
        #"\blord\s+help\b"#,
        #"\blord\s+i\b"#,
        #"\bthank\s+you\s+lord\b"#,
        #"\bpraise\s+(?:you\s+)?lord\b"#,
    ]

    private static let devotionalChristNeedles: Set<String> = ["christ", "lord", "savior", "messiah"]

    static func shouldSkipJesusNeedle(keywordName: String, needle: String, in textLower: String, matchRange: NSRange) -> Bool {
        guard keywordName.lowercased() == "jesus" else { return false }
        let needleLower = needle.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard devotionalChristNeedles.contains(needleLower) else { return false }
        for pattern in devotionalPatterns {
            if range(matchRange, isInsidePattern: pattern, in: textLower) { return true }
        }
        return false
    }

    static let synonymOnlyConfidenceThreshold: Double = 0.88

    static func shouldSuppressJesusTag(
        confidence: Double,
        fullTextLower: String,
        titleLower: String,
        synonymOnly: Bool
    ) -> Bool {
        if synonymOnly, confidence < synonymOnlyConfidenceThreshold { return true }
        if titleLower.range(of: #"\bjesus\b"#, options: .regularExpression) != nil { return false }
        if fullTextLower.range(of: #"\bjesus\b"#, options: .regularExpression) != nil { return false }
        for pattern in devotionalPatterns {
            if fullTextLower.range(of: pattern, options: .regularExpression) != nil { return true }
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
