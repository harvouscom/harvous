import Foundation
import SwiftData

/// Batch updates for folder buckets (membership = primary + secondaries), matching
/// `FolderChipPopover` semantics.
@MainActor
enum HarvousFolderBulkActions {
    static func normalizedBucketKey(_ primaryFolder: String?) -> String? {
        let trimmed = primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    static func notes(inBucket bucket: String?, from notes: [Note]) -> [Note] {
        notes.filter { $0.noteBelongsToFolderBucket(bucket) }
    }

    static func renameFolder(
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
            if let p = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines),
               !p.isEmpty, p.caseInsensitiveCompare(oldBucket) == .orderedSame {
                note.primaryFolder = trimmed
            }
            var secs = note.normalizedSecondaryFolderLabels()
            for i in secs.indices {
                if secs[i].caseInsensitiveCompare(oldBucket) == .orderedSame {
                    secs[i] = trimmed
                }
            }
            note.secondaryFolders = secs
            note.isFolderUserOverride = true
            note.isFolderPinned = true
            note.folderAutoConfidence = nil
            note.folderLastAutoUpdatedAt = nil
            note.updatedAt = now
            HarvousNoteSpotlightIndexer.reindex(note: note)
            HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
        }
        try? modelContext.saveWithLogging()
    }

    /// Clears the folder label on every note in the bucket; notes are not deleted.
    static func removeFolder(
        named bucket: String,
        notesInActiveSpace: [Note],
        modelContext: ModelContext
    ) {
        let targets = notes(inBucket: bucket, from: notesInActiveSpace)
        let now = Date()
        for note in targets {
            if let p = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines),
               !p.isEmpty, p.caseInsensitiveCompare(bucket) == .orderedSame {
                note.primaryFolder = nil
            }
            let filtered = note.normalizedSecondaryFolderLabels().filter {
                $0.caseInsensitiveCompare(bucket) != .orderedSame
            }
            note.secondaryFolders = filtered
            if note.primaryFolder == nil, note.secondaryFolders.isEmpty {
                note.isFolderUserOverride = false
                note.isFolderPinned = false
                note.folderAutoConfidence = nil
                note.folderLastAutoUpdatedAt = nil
            }
            note.updatedAt = now
            HarvousNoteSpotlightIndexer.reindex(note: note)
            HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
        }
        try? modelContext.saveWithLogging()
    }
}
