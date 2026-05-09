import Foundation
import SwiftData

/// Batch updates for collection buckets (membership = primary + secondaries), matching
/// `CollectionChipPopover` semantics.
@MainActor
enum HarvousCollectionBulkActions {
    static func normalizedBucketKey(_ primaryCollection: String?) -> String? {
        let trimmed = primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    static func notes(inBucket bucket: String?, from notes: [Note]) -> [Note] {
        notes.filter { $0.noteBelongsToCollectionBucket(bucket) }
    }

    static func renameCollection(
        from oldBucket: String,
        to newDisplayName: String,
        notesInActiveSpace: [Note],
        modelContext: ModelContext
    ) {
        let trimmed = newDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let targets = notes(inBucket: oldBucket, from: notesInActiveSpace)
        let now = Date()
        for note in targets {
            if let p = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines),
               !p.isEmpty, p.caseInsensitiveCompare(oldBucket) == .orderedSame {
                note.primaryCollection = trimmed
            }
            var secs = note.normalizedSecondaryCollectionLabels()
            for i in secs.indices {
                if secs[i].caseInsensitiveCompare(oldBucket) == .orderedSame {
                    secs[i] = trimmed
                }
            }
            note.secondaryCollections = secs
            note.isCollectionUserOverride = true
            note.isCollectionPinned = true
            note.collectionAutoConfidence = nil
            note.collectionLastAutoUpdatedAt = nil
            note.updatedAt = now
            HarvousNoteSpotlightIndexer.reindex(note: note)
            HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
        }
        try? modelContext.saveWithLogging()
    }

    /// Clears the collection label on every note in the bucket; notes are not deleted.
    static func removeCollection(
        named bucket: String,
        notesInActiveSpace: [Note],
        modelContext: ModelContext
    ) {
        let targets = notes(inBucket: bucket, from: notesInActiveSpace)
        let now = Date()
        for note in targets {
            if let p = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines),
               !p.isEmpty, p.caseInsensitiveCompare(bucket) == .orderedSame {
                note.primaryCollection = nil
            }
            let filtered = note.normalizedSecondaryCollectionLabels().filter {
                $0.caseInsensitiveCompare(bucket) != .orderedSame
            }
            note.secondaryCollections = filtered
            if note.primaryCollection == nil, note.secondaryCollections.isEmpty {
                note.isCollectionUserOverride = false
                note.isCollectionPinned = false
                note.collectionAutoConfidence = nil
                note.collectionLastAutoUpdatedAt = nil
            }
            note.updatedAt = now
            HarvousNoteSpotlightIndexer.reindex(note: note)
            HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
        }
        try? modelContext.saveWithLogging()
    }
}
