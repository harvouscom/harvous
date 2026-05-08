import Foundation

/// One row in the collections root list (shared by macOS sidebar and iOS Library).
struct HarvousCollectionRow: Identifiable, Hashable, Sendable {
    let collection: String?
    let count: Int
    let mostRecent: Date
    var id: String { collection ?? "__ungrouped__" }
    var title: String { collection ?? "No collection" }
}

enum HarvousCollectionListIndex {
    /// Buckets notes by primary collection (nil / empty → ungrouped bucket).
    static func rows(from notesInActiveSpace: [Note]) -> [HarvousCollectionRow] {
        var buckets: [String?: [Note]] = [:]
        for note in notesInActiveSpace {
            let normalized = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
            let collection = (normalized?.isEmpty == false) ? normalized : nil
            buckets[collection, default: []].append(note)
        }

        return buckets.map { key, values in
            HarvousCollectionRow(
                collection: key,
                count: values.count,
                mostRecent: values.map(\.updatedAt).max() ?? .distantPast
            )
        }
        .sorted { lhs, rhs in
            if lhs.collection == nil { return false }
            if rhs.collection == nil { return true }
            return lhs.mostRecent > rhs.mostRecent
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
                let bucketNotes = notesForBucketMatching.filter { note in
                    let candidate = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
                    let normalizedCandidate = (candidate?.isEmpty == false) ? candidate : nil
                    return normalizedCandidate == normalized
                }

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
                return lhs.0.mostRecent > rhs.0.mostRecent
            }
            .map(\.0)
    }
}
