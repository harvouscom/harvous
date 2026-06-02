import Foundation

extension Array where Element: Hashable {
    /// Removes duplicates while preserving the order of first occurrence.
    func uniquedPreservingOrder() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

extension Array where Element == String {
    /// Case-insensitive tag dedupe; keeps the first spelling seen.
    func uniquedPreservingOrderCaseInsensitive() -> [String] {
        var seen = Set<String>()
        return filter { tag in
            seen.insert(tag.lowercased()).inserted
        }
    }
}
