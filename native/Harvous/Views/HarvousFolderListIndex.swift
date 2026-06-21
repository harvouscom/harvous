import Foundation

/// One row in the folders root list (shared by macOS sidebar and iOS Library).
struct HarvousFolderRow: Identifiable, Hashable, Sendable {
    /// Row id for the ungrouped bucket; not pin/rename/remove-from-list as a named folder.
    static let ungroupedRowId = "__ungrouped__"

    /// Named folder bucket key; `nil` is the ungrouped bucket.
    let folderLabel: String?
    let count: Int
    let mostRecent: Date
    var id: String { folderLabel ?? Self.ungroupedRowId }
    var title: String { folderLabel ?? "No folder" }
}

enum HarvousFolderListIndex {
    /// Buckets notes by every folder membership (primary + secondaries); nil / empty → ungrouped bucket.
    static func rows(from notesInActiveSpace: [Note]) -> [HarvousFolderRow] {
        var buckets: [String?: [Note]] = [:]
        for note in notesInActiveSpace {
            let labels = note.allFolderMembershipLabels()
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
            HarvousFolderRow(
                folderLabel: key,
                count: values.count,
                mostRecent: values.map(\.updatedAt).max() ?? .distantPast
            )
        }
        .sorted { lhs, rhs in
            // Ungrouped bucket last; then A–Z by folder name.
            if lhs.folderLabel == nil, rhs.folderLabel != nil { return false }
            if rhs.folderLabel == nil, lhs.folderLabel != nil { return true }
            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }
    }

    /// Scored filter matching macOS sidebar behavior; `notesForBucketMatching` should be the same note scope used to build rows (sidebar passes full query notes for bucket resolution).
    static func filtered(
        rows: [HarvousFolderRow],
        query: String,
        notesForBucketMatching: [Note]
    ) -> [HarvousFolderRow] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rows }
        return rows
            .compactMap { row -> (HarvousFolderRow, Int)? in
                let normalized = row.folderLabel?.trimmingCharacters(in: .whitespacesAndNewlines)
                let bucketNotes = notesForBucketMatching.filter { $0.noteBelongsToFolderBucket(normalized) }

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
                return lhs.0.title.localizedCaseInsensitiveCompare(rhs.0.title) == .orderedAscending
            }
            .map(\.0)
    }

    /// Pinned buckets first (`pinnedIdsInOrder` preserves manual order), then remaining rows in `rows` order.
    static func applyPinOrdering(_ rows: [HarvousFolderRow], pinnedIdsInOrder: [String]) -> [HarvousFolderRow] {
        let pinnedSet = Set(pinnedIdsInOrder)
        let rowById = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
        let pinned = pinnedIdsInOrder.compactMap { rowById[$0] }
        let unpinned = rows.filter { !pinnedSet.contains($0.id) }
        return pinned + unpinned
    }

    /// Notes belonging to a folder drill bucket (`nil` = ungrouped / no folder).
    static func memberCount(in notes: [Note], bucket: String?) -> Int {
        notes.filter { $0.noteBelongsToFolderBucket(bucket) }.count
    }
}
