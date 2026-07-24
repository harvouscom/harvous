import Foundation

/// Phrase-context guards for life-category auto-tags — skip incidental hits in spiritual
/// or church-building prose. Keep in sync with web `life-keyword-context.ts`.
enum LifeKeywordContextGate {
  private static let spiritualRelationshipPattern =
    #"\brelationship\s+with\s+(?:god|christ|jesus|the\s+lord|lord)\b"#
    private static let fellowshipHallPattern = #"\bfellowship\s+hall\b"#
    private static let churchFellowshipPattern = #"\bchurch\s+fellowship\b"#
    private static let familyChurchAttendancePattern =
        #"\b(?:my\s+)?family(?:\s+and\s+i)?\s+(?:went|go|goes|attended|attend|used\s+to\s+go)\b[^.]{0,80}\bchurch\b"#
    private static let familyWentToChurchPattern = #"\bmy\s+family\s+went\s+to\b[^.]{0,60}\bchurch\b"#
    private static let marriageSupperOfLambPattern =
        #"\bmarriage(?:\s+supper|\s+feast|\s+banquet)\s+of\s+(?:the\s+)?lamb\b"#
    private static let marriageOfLambPattern = #"\bmarriage\s+of\s+(?:the\s+)?lamb\b"#

  static func shouldSkip(keywordName: String, needle: String, in textLower: String, matchRange: NSRange) -> Bool {
    let key = keywordName.lowercased()
    let needleLower = needle.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

    if (key == "marriage" || key == "relationships" || key == "reconciliation"),
       needleLower.contains("relationship"),
       range(matchRange, isInsidePattern: spiritualRelationshipPattern, in: textLower) {
      return true
    }

        if key == "friendship", needleLower == "fellowship" {
            if range(matchRange, isInsidePattern: fellowshipHallPattern, in: textLower) { return true }
            if range(matchRange, isInsidePattern: churchFellowshipPattern, in: textLower) { return true }
        }

        if (key == "family", needleLower.contains("family")) {
            if range(matchRange, isInsidePattern: familyChurchAttendancePattern, in: textLower) { return true }
            if range(matchRange, isInsidePattern: familyWentToChurchPattern, in: textLower) { return true }
        }

        if key == "marriage", needleLower.contains("marriage") {
            if range(matchRange, isInsidePattern: marriageSupperOfLambPattern, in: textLower) { return true }
            if range(matchRange, isInsidePattern: marriageOfLambPattern, in: textLower) { return true }
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
