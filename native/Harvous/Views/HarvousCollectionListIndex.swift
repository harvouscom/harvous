import Foundation

/// One row in the collections root list (shared by macOS sidebar and iOS Library).
struct HarvousCollectionRow: Identifiable, Hashable, Sendable {
    /// Row id for the ungrouped bucket; not pin/rename/remove-from-list as a collection.
    static let ungroupedRowId = "__ungrouped__"

    let collection: String?
    let count: Int
    let mostRecent: Date
    var id: String { collection ?? Self.ungroupedRowId }
    var title: String { collection ?? "No collection" }
}

enum HarvousCollectionListIndex {
    /// Buckets notes by every collection membership (primary + secondaries); nil / empty → ungrouped bucket.
    static func rows(from notesInActiveSpace: [Note]) -> [HarvousCollectionRow] {
        var buckets: [String?: [Note]] = [:]
        for note in notesInActiveSpace {
            let labels = note.allCollectionMembershipLabels()
            if labels.isEmpty {
                buckets[nil, default: []].append(note)
                continue
            }
            var seenInNote = Set<String>()
            for raw in labels {
                let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                let low = trimmed.lowercased()
                if seenInNote.contains(low) { continue }
                seenInNote.insert(low)
                buckets[trimmed, default: []].append(note)
            }
        }

        return buckets.map { key, values in
            HarvousCollectionRow(
                collection: key,
                count: values.count,
                mostRecent: values.map(\.updatedAt).max() ?? .distantPast
            )
        }
        .sorted { lhs, rhs in
            // Ungrouped bucket last; then recency (matches note list: substantive edits bump updatedAt).
            if lhs.collection == nil, rhs.collection != nil { return false }
            if rhs.collection == nil, lhs.collection != nil { return true }
            if lhs.mostRecent != rhs.mostRecent {
                return lhs.mostRecent > rhs.mostRecent
            }
            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }
    }

    /// Scored filter matching macOS sidebar behavior; `notesForBucketMatching` should be the same note scope used to build rows (sidebar passes full query notes for bucket resolution).
    static func filtered(
        rows: [HarvousCollectionRow],
        query: String,
        notesForBucketMatching: [Note]
    ) -> [HarvousCollectionRow] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rows }
        return rows
            .compactMap { row -> (HarvousCollectionRow, Int)? in
                let normalized = row.collection?.trimmingCharacters(in: .whitespacesAndNewlines)
                let bucketNotes = notesForBucketMatching.filter { $0.noteBelongsToCollectionBucket(normalized) }

                var score = 0
                if row.title.localizedCaseInsensitiveContains(trimmed) { score += 6 }
                if row.title.lowercased().hasPrefix(trimmed.lowercased()) { score += 3 }

                if bucketNotes.contains(where: { $0.title.localizedCaseInsensitiveContains(trimmed) }) { score += 2 }
                if bucketNotes.contains(where: { $0.body.localizedCaseInsensitiveContains(trimmed) }) { score += 1 }
                if bucketNotes.contains(where: { $0.tags.contains(where: { $0.localizedCaseInsensitiveContains(trimmed) }) }) { score += 1 }
                if bucketNotes.contains(where: { $0.detectedRefs.contains(where: { $0.localizedCaseInsensitiveContains(trimmed) }) }) { score += 1 }

                guard score > 0 else { return nil }
                return (row, score)
            }
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
                if lhs.0.mostRecent != rhs.0.mostRecent {
                    return lhs.0.mostRecent > rhs.0.mostRecent
                }
                return lhs.0.title.localizedCaseInsensitiveCompare(rhs.0.title) == .orderedAscending
            }
            .map(\.0)
    }

    /// Pinned buckets first (`pinnedIdsInOrder` preserves manual order), then remaining rows in `rows` order.
    static func applyPinOrdering(_ rows: [HarvousCollectionRow], pinnedIdsInOrder: [String]) -> [HarvousCollectionRow] {
        let pinnedSet = Set(pinnedIdsInOrder)
        let rowById = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
        let pinned = pinnedIdsInOrder.compactMap { rowById[$0] }
        let unpinned = rows.filter { !pinnedSet.contains($0.id) }
        return pinned + unpinned
    }
}
