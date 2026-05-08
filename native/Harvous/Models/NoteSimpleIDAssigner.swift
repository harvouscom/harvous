import Foundation
import SwiftData

/// Assigns monotonic `simpleNoteId` values (SPA-style `N###`); never reuses freed IDs after delete.
@MainActor
enum NoteSimpleIDAssigner {
    static func nextId(in context: ModelContext) -> Int {
        let descriptor = FetchDescriptor<Note>()
        guard let rows = try? context.fetch(descriptor) else { return 1 }
        let highest = rows.compactMap(\.simpleNoteId).max() ?? 0
        return highest + 1
    }

    static func assignIfMissing(_ note: Note, in context: ModelContext) {
        guard note.simpleNoteId == nil else { return }
        note.simpleNoteId = nextId(in: context)
    }

    static func backfillAllIfNeeded(in context: ModelContext) {
        let unassigned = FetchDescriptor<Note>(
            predicate: #Predicate { $0.simpleNoteId == nil },
            sortBy: [SortDescriptor(\.createdAt, order: .forward)]
        )
        guard let rows = try? context.fetch(unassigned), !rows.isEmpty else { return }
        var n = nextId(in: context)
        for note in rows {
            note.simpleNoteId = n
            n += 1
        }
        try? context.saveWithLogging()
    }
}
