import Foundation
import SwiftData

#if os(iOS)
import WidgetKit
#endif

/// Concept 9 hooks after a note is persisted (autosave, flush, compose save, etc.).
enum HarvousRecallOSIntegration {
    @MainActor
    static func afterNotePersisted(note: Note, modelContext: ModelContext) {
        HarvousNoteSpotlightIndexer.indexNote(
            id: note.id,
            title: note.title,
            body: note.body,
            tags: note.tags,
            scriptureRefs: note.detectedRefs
        )
        HarvousRecallSnapshotWriter.refresh(modelContext: modelContext)
        reloadWidgetsIfNeeded()
        HarvousRecallNotifications.scheduleNextRecallIfNeeded(modelContext: modelContext)
    }

    @MainActor
    static func afterNoteDeleted(id: UUID, modelContext: ModelContext) {
        HarvousNoteSpotlightIndexer.removeNote(id: id)
        HarvousRecallSnapshotWriter.refresh(modelContext: modelContext)
        reloadWidgetsIfNeeded()
    }

    @MainActor
    static func onAppLaunch(modelContext: ModelContext) {
        HarvousRecallSnapshotWriter.refresh(modelContext: modelContext)
        reloadWidgetsIfNeeded()
    }

    private static func reloadWidgetsIfNeeded() {
        #if os(iOS)
        WidgetCenter.shared.reloadTimelines(ofKind: "RecallCardWidget")
        #endif
    }
}
