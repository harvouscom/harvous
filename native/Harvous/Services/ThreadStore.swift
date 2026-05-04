import Foundation
import SwiftData

/// Selection → snippet + title helpers (linked-note storage uses `StudyThread`).
enum ThreadEditorSnippet {
    static func fallback(fromPlainBody body: String) -> (source: String, focusTitle: String) {
        let t = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return ("(From note)", "Linked note") }
        let source = clampSource(t)
        return (source, deriveFocus(from: source))
    }

    static func clampSource(_ s: String) -> String { String(s.prefix(800)) }

    static func deriveFocus(from source: String) -> String {
        let t = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return "Linked note" }
        let firstLine = t.split(separator: "\n", omittingEmptySubsequences: true).first.map(String.init) ?? t
        let capped = String(firstLine.prefix(120))
        return capped.isEmpty ? "Linked note" : capped
    }
}

/// CRUD and scoped fetches for native study threads.
enum ThreadStore {
    struct TrailSnapshot {
        var incoming: [StudyThread]
        var outgoing: [StudyThread]
    }

    @MainActor
    static func fetch(id: UUID, modelContext: ModelContext) -> StudyThread? {
        let fd = FetchDescriptor<StudyThread>(predicate: #Predicate { $0.id == id })
        return try? modelContext.fetch(fd).first
    }

    @MainActor
    static func activeThreads(
        parentNoteId: UUID,
        spaceId: UUID,
        modelContext: ModelContext
    ) -> [StudyThread] {
        let nid = parentNoteId
        let sid = spaceId
        let fd = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.parentNoteId == nid && t.spaceId == sid && !t.isArchived
            },
            sortBy: [SortDescriptor(\StudyThread.updatedAt, order: .reverse)]
        )
        return (try? modelContext.fetch(fd)) ?? []
    }

    @MainActor
    @discardableResult
    static func create(
        parent: Note,
        spaceId: UUID,
        sourceSnippet: String,
        focusTitle: String,
        modelContext: ModelContext
    ) -> StudyThread {
        let trimmedSource = String(sourceSnippet.prefix(4000)).trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedFocus = focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let focus = trimmedFocus.isEmpty ? ThreadEditorSnippet.deriveFocus(from: trimmedSource) : trimmedFocus
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: trimmedSource.isEmpty ? "(From note)" : trimmedSource,
            focusTitle: focus,
            notesBody: "",
            parentNote: parent
        )
        modelContext.insert(thread)
        try? modelContext.save()
        return thread
    }

    @MainActor
    @discardableResult
    static func createMiniNote(
        parent: Note,
        spaceId: UUID,
        sourceSnippet: String,
        body: String,
        highlightAccent: StudyHighlightAccentToken = .warmAmber,
        expandedAnchorUTF16Range: NSRange? = nil,
        expandedPlainForAnchor: String? = nil,
        modelContext: ModelContext
    ) -> StudyThread {
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = ThreadEditorSnippet.deriveFocus(from: sourceSnippet)
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: sourceSnippet,
            focusTitle: title,
            notesBody: "",
            entryKindRaw: StudyThread.EntryKind.miniNote.rawValue,
            miniNoteBody: trimmedBody,
            highlightAccentRaw: highlightAccent.rawValue,
            parentNote: parent
        )
        if let rr = expandedAnchorUTF16Range, let plain = expandedPlainForAnchor {
            applyAnchoredExpandedRange(rr, expandedPlain: plain, to: thread)
        }
        modelContext.insert(thread)
        try? modelContext.save()
        return thread
    }

    @MainActor
    @discardableResult
    static func createLinkedNoteMarker(
        parent: Note,
        spaceId: UUID,
        sourceSnippet: String,
        highlightAccent: StudyHighlightAccentToken = .auto,
        expandedAnchorUTF16Range: NSRange? = nil,
        expandedPlainForAnchor: String? = nil,
        modelContext: ModelContext
    ) -> StudyThread {
        let linked = Note(
            title: ThreadEditorSnippet.deriveFocus(from: sourceSnippet),
            body: sourceSnippet,
            detectedRefs: [],
            spaceId: spaceId
        )
        modelContext.insert(linked)
        NoteSimpleIDAssigner.assignIfMissing(linked, in: modelContext)

        let marker = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: sourceSnippet,
            focusTitle: linked.title,
            notesBody: "",
            entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
            linkedNoteId: linked.id,
            linkedNoteTitle: linked.title,
            highlightAccentRaw: highlightAccent.rawValue,
            parentNote: parent
        )
        if let rr = expandedAnchorUTF16Range, let plain = expandedPlainForAnchor {
            applyAnchoredExpandedRange(rr, expandedPlain: plain, to: marker)
        }
        modelContext.insert(marker)
        try? modelContext.save()
        return marker
    }

    /// Note-to-note link only (no text anchor, no inline highlight). Trail / navigation only.
    @MainActor
    @discardableResult
    static func createUnanchoredConnection(
        parent: Note,
        linked: Note,
        highlightAccent: StudyHighlightAccentToken = .auto,
        modelContext: ModelContext
    ) -> StudyThread {
        let spaceId = parent.resolvedSpaceId()
        let trimmedTitle = linked.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayTitle = trimmedTitle.isEmpty ? "Untitled note" : trimmedTitle
        let marker = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: "(Connected note)",
            focusTitle: displayTitle,
            notesBody: "",
            entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
            linkedNoteId: linked.id,
            linkedNoteTitle: displayTitle,
            anchorLocation: -1,
            anchorLength: 0,
            anchorTextSnapshot: nil,
            highlightAccentRaw: highlightAccent.rawValue,
            parentNote: parent
        )
        modelContext.insert(marker)
        try? modelContext.save()
        touchParentNoteIfNeeded(marker, modelContext: modelContext)
        return marker
    }

    /// Connects prose to an **existing** note (no duplicate note stub).
    @MainActor
    @discardableResult
    static func createConnectionMarker(
        parent: Note,
        spaceId: UUID,
        sourceSnippet: String,
        linked: Note,
        highlightAccent: StudyHighlightAccentToken = .auto,
        expandedAnchorUTF16Range: NSRange? = nil,
        expandedPlainForAnchor: String? = nil,
        modelContext: ModelContext
    ) -> StudyThread {
        let title = ThreadEditorSnippet.deriveFocus(from: sourceSnippet)
        let trimmedTitle = linked.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let marker = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: sourceSnippet,
            focusTitle: title,
            notesBody: "",
            entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
            linkedNoteId: linked.id,
            linkedNoteTitle: trimmedTitle.isEmpty ? title : trimmedTitle,
            highlightAccentRaw: highlightAccent.rawValue,
            parentNote: parent
        )
        if let rr = expandedAnchorUTF16Range, let plain = expandedPlainForAnchor {
            applyAnchoredExpandedRange(rr, expandedPlain: plain, to: marker)
        }
        modelContext.insert(marker)
        try? modelContext.save()
        return marker
    }

    /// Scripture-link highlight (anchors prose to a citation only for MVP UI).
    @MainActor
    @discardableResult
    static func createScriptureLink(
        parent: Note,
        spaceId: UUID,
        sourceSnippet: String,
        referenceRaw: String,
        highlightAccent: StudyHighlightAccentToken = .neutral,
        expandedAnchorUTF16Range: NSRange? = nil,
        expandedPlainForAnchor: String? = nil,
        modelContext: ModelContext
    ) -> StudyThread {
        let trimmedRef = referenceRaw.trimmingCharacters(in: .whitespacesAndNewlines)
        let display: String
        if let p = ScriptureReferenceParser.parse(trimmedRef) {
            display = ScriptureReferenceParser.format(bookIndex: p.bookIndex, chapter: p.chapter, verseStart: p.verseStart, verseEnd: p.verseEnd)
        } else {
            display = trimmedRef
        }

        let focus = ThreadEditorSnippet.deriveFocus(from: sourceSnippet)
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: sourceSnippet,
            focusTitle: focus,
            notesBody: "",
            entryKindRaw: StudyThread.EntryKind.scriptureLink.rawValue,
            miniNoteBody: trimmedRef,
            scriptureReference: display,
            highlightAccentRaw: highlightAccent.rawValue,
            parentNote: parent
        )
        if let rr = expandedAnchorUTF16Range, let plain = expandedPlainForAnchor {
            applyAnchoredExpandedRange(rr, expandedPlain: plain, to: thread)
        }
        modelContext.insert(thread)
        try? modelContext.save()
        return thread
    }

    @MainActor
    static func fetchAnchoredHighlights(parentNoteId: UUID, modelContext: ModelContext) -> [StudyThread] {
        let nid = parentNoteId
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { thread in thread.parentNoteId == nid && !thread.isArchived }
        )
        let rows = (try? modelContext.fetch(descriptor)) ?? []
        return rows
            .filter { StudyThread.anchoredHighlightKinds.contains($0.entryKind)
                && $0.anchorLocation != nil
                && ($0.anchorLength ?? 0) > 0
                && ($0.anchorLocation ?? -1) >= 0
            }
            .sorted { (($0.anchorLocation ?? 0), $0.createdAt.timeIntervalSince1970)
                < (($1.anchorLocation ?? 0), $1.createdAt.timeIntervalSince1970)
            }
    }

    private static func applyAnchoredExpandedRange(_ rr: NSRange, expandedPlain: String, to thread: StudyThread) {
        guard rr.location >= 0, rr.length > 0 else { return }
        let nsExpanded = expandedPlain as NSString
        guard NSMaxRange(rr) <= nsExpanded.length else { return }
        thread.anchorLocation = rr.location
        thread.anchorLength = rr.length
        thread.anchorTextSnapshot = nsExpanded.substring(with: rr)
    }

    @MainActor
    static func fetchNote(id: UUID, modelContext: ModelContext) -> Note? {
        let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == id })
        return try? modelContext.fetch(fd).first
    }

    @MainActor
    static func trailSnapshot(for note: Note, modelContext: ModelContext) -> TrailSnapshot {
        let noteId = note.id
        let sid = note.resolvedSpaceId()
        let linkedKindRaw = "linkedNote"
        let incomingDescriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.spaceId == sid
                    && t.entryKindRaw == linkedKindRaw
                    && t.linkedNoteId == noteId
                    && !t.isArchived
            },
            sortBy: [SortDescriptor(\StudyThread.updatedAt, order: .reverse)]
        )
        let outgoingDescriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.spaceId == sid
                    && t.parentNoteId == noteId
                    && t.entryKindRaw == linkedKindRaw
                    && !t.isArchived
            },
            sortBy: [SortDescriptor(\StudyThread.updatedAt, order: .reverse)]
        )
        let incoming = (try? modelContext.fetch(incomingDescriptor)) ?? []
        let outgoing = (try? modelContext.fetch(outgoingDescriptor)) ?? []
        return TrailSnapshot(incoming: incoming, outgoing: outgoing)
    }

    /// Inbound `linkedNote` markers pointing at `targetNoteId` (same filter as `trailSnapshot` incoming).
    @MainActor
    static func incomingLinkedNoteMarkers(
        targetNoteId: UUID,
        spaceId: UUID,
        modelContext: ModelContext
    ) -> [StudyThread] {
        let linkedKindRaw = "linkedNote"
        let nid = targetNoteId
        let sid = spaceId
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.spaceId == sid
                    && t.entryKindRaw == linkedKindRaw
                    && t.linkedNoteId == nid
                    && !t.isArchived
            },
            sortBy: [SortDescriptor(\StudyThread.updatedAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    @MainActor
    static func save(_ thread: StudyThread, modelContext: ModelContext) {
        thread.updatedAt = Date()
        try? modelContext.save()
    }

    @MainActor
    static func touchParentNoteIfNeeded(_ thread: StudyThread, modelContext: ModelContext) {
        guard let note = thread.parentNote ?? fetchParentNote(id: thread.parentNoteId, modelContext: modelContext) else { return }
        note.updatedAt = Date()
        try? modelContext.save()
    }

    @MainActor
    private static func fetchParentNote(id: UUID, modelContext: ModelContext) -> Note? {
        let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == id })
        return try? modelContext.fetch(fd).first
    }
}
