import Foundation
import SwiftData

/// Captures `NoteSnapshot` rows on a Time-Machine-style cadence:
/// 1. **Active interval** — at least one snapshot every 5 minutes while the user
///    keeps editing.
/// 2. **Idle flush** — if no snapshot has been recorded for the current edit
///    burst and the user has paused for ~30s, capture once.
/// 3. **No-op gating** — if body+title+refs match the most recent snapshot,
///    skip (avoids polluting the timeline with undo-back-to-original cycles).
///
/// The snapshotter is driven by `EditorAutosaveDebouncer` after each successful
/// autosave; it owns no debounce logic of its own.
@MainActor
final class NoteSnapshotter {
    static let shared = NoteSnapshotter()

    /// 5-minute target between automatic snapshots while actively editing.
    private static let activeInterval: TimeInterval = 5 * 60
    /// Quiet-period before we flush a final snapshot for an edit burst.
    private static let idleThreshold: TimeInterval = 30

    /// Per-note bookkeeping so we don't have to refetch on every keystroke.
    private struct PerNoteState {
        var lastSnapshotAt: Date?
        var lastEditAt: Date
        var idleFlushTask: Task<Void, Never>?
        var lastSnapshotBody: String?
        var lastSnapshotTitle: String?
        var lastSnapshotRefs: [String]?
    }

    private var states: [UUID: PerNoteState] = [:]

    private init() {}

    /// Notify the snapshotter that an autosave just persisted these values.
    /// Called from `EditorAutosaveDebouncer` after `context.save()` succeeds.
    func noteDidAutosave(
        noteID: UUID,
        body: String,
        title: String,
        refs: [String],
        in context: ModelContext
    ) {
        let now = Date()
        var state = state(for: noteID, in: context)
        state.lastEditAt = now

        let unchanged = (state.lastSnapshotBody == body)
            && (state.lastSnapshotTitle == title)
            && (state.lastSnapshotRefs ?? []) == refs

        let shouldCapture: Bool = {
            if unchanged { return false }
            guard let last = state.lastSnapshotAt else {
                // First write since app launch on a previously-unsnapshotted note —
                // capture immediately so there's an "original" to fall back to.
                return true
            }
            return now.timeIntervalSince(last) >= Self.activeInterval
        }()

        if shouldCapture {
            captureSnapshot(
                noteID: noteID,
                body: body,
                title: title,
                refs: refs,
                reason: .autoInterval,
                context: context,
                state: &state,
                now: now
            )
        }

        scheduleIdleFlush(noteID: noteID, context: context, state: &state)
        states[noteID] = state
    }

    /// Captures a snapshot of the current `Note` body before performing a restore,
    /// so the restore itself is reversible. Returns the inserted snapshot.
    @discardableResult
    func captureBeforeRestore(note: Note, in context: ModelContext) -> NoteSnapshot {
        let snap = NoteSnapshot(
            noteID: note.id,
            body: note.body,
            title: note.title,
            detectedRefs: note.detectedRefs,
            reason: .preRestore
        )
        context.insert(snap)
        note.snapshots.append(snap)
        try? context.saveWithLogging()

        var state = states[note.id] ?? PerNoteState(lastEditAt: Date())
        state.lastSnapshotAt = snap.capturedAt
        state.lastSnapshotBody = snap.body
        state.lastSnapshotTitle = snap.title
        state.lastSnapshotRefs = snap.detectedRefs
        states[note.id] = state
        return snap
    }

    /// Replaces a note's content with the values from `snapshot`, after first
    /// taking a `.preRestore` snapshot of the current state.
    func restore(note: Note, to snapshot: NoteSnapshot, in context: ModelContext) {
        captureBeforeRestore(note: note, in: context)
        note.title = snapshot.title
        note.body = snapshot.body
        note.detectedRefs = snapshot.detectedRefs
        note.updatedAt = Date()
        try? context.saveWithLogging()
    }

    // MARK: - Private

    private func state(for noteID: UUID, in context: ModelContext) -> PerNoteState {
        if let existing = states[noteID] { return existing }

        // First touch this session — hydrate from store so cadence math survives relaunch.
        var state = PerNoteState(lastEditAt: Date())
        let descriptor = FetchDescriptor<NoteSnapshot>(
            predicate: #Predicate { $0.noteID == noteID },
            sortBy: [SortDescriptor(\.capturedAt, order: .reverse)]
        )
        if let last = (try? context.fetch(descriptor))?.first {
            state.lastSnapshotAt = last.capturedAt
            state.lastSnapshotBody = last.body
            state.lastSnapshotTitle = last.title
            state.lastSnapshotRefs = last.detectedRefs
        }
        return state
    }

    private func captureSnapshot(
        noteID: UUID,
        body: String,
        title: String,
        refs: [String],
        reason: SnapshotReason,
        context: ModelContext,
        state: inout PerNoteState,
        now: Date
    ) {
        // Resolve the live note to attach via relationship so cascade-delete works.
        let descriptor = FetchDescriptor<Note>(predicate: #Predicate { $0.id == noteID })
        guard let note = try? context.fetch(descriptor).first else { return }

        let snap = NoteSnapshot(
            noteID: noteID,
            body: body,
            title: title,
            detectedRefs: refs,
            reason: reason,
            capturedAt: now
        )
        context.insert(snap)
        note.snapshots.append(snap)
        try? context.saveWithLogging()

        state.lastSnapshotAt = now
        state.lastSnapshotBody = body
        state.lastSnapshotTitle = title
        state.lastSnapshotRefs = refs
    }

    private func scheduleIdleFlush(noteID: UUID, context: ModelContext, state: inout PerNoteState) {
        state.idleFlushTask?.cancel()
        state.idleFlushTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.idleThreshold * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.idleFlushIfNeeded(noteID: noteID, in: context)
        }
    }

    private func idleFlushIfNeeded(noteID: UUID, in context: ModelContext) {
        guard var state = states[noteID] else { return }
        guard Date().timeIntervalSince(state.lastEditAt) >= Self.idleThreshold else { return }

        let descriptor = FetchDescriptor<Note>(predicate: #Predicate { $0.id == noteID })
        guard let note = try? context.fetch(descriptor).first else { return }

        let unchanged = (state.lastSnapshotBody == note.body)
            && (state.lastSnapshotTitle == note.title)
            && (state.lastSnapshotRefs ?? []) == note.detectedRefs
        guard !unchanged else { return }

        captureSnapshot(
            noteID: noteID,
            body: note.body,
            title: note.title,
            refs: note.detectedRefs,
            reason: .autoIdle,
            context: context,
            state: &state,
            now: Date()
        )
        states[noteID] = state
    }
}
