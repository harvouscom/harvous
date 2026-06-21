import Foundation

enum HarvousAlphabeticalSortKey {
    /// When a label starts with digits, sort from its first letter onward (e.g. "1 John" → "John").
    static func from(_ label: String) -> String {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let idx = trimmed.firstIndex(where: { $0.isLetter }) else { return trimmed }
        return String(trimmed[idx...])
    }

    static func compareLabels(_ lhs: String, _ rhs: String) -> ComparisonResult {
        let leftTrimmed = lhs.trimmingCharacters(in: .whitespacesAndNewlines)
        let rightTrimmed = rhs.trimmingCharacters(in: .whitespacesAndNewlines)
        let keyCmp = from(leftTrimmed).localizedCaseInsensitiveCompare(from(rightTrimmed))
        if keyCmp != .orderedSame { return keyCmp }
        return leftTrimmed.localizedCaseInsensitiveCompare(rightTrimmed)
    }
}
