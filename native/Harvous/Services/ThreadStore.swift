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

    /// First six words of `text` joined by spaces — used as the pre-filled Label in the annotation popover.
    static func shortLabelPreview(from text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let words = trimmed.split(separator: " ").prefix(6).map(String.init)
        return words.joined(separator: " ")
    }
}

    /// CRUD and scoped fetches for native study threads.
enum ThreadStore {
    struct TrailSnapshot {
        var incoming: [StudyThread]
        var outgoing: [StudyThread]
    }

    /// Canonical display reference string (matches `createScriptureLink` / passage dock queries).
    @MainActor
    static func canonicalScriptureDisplay(fromReferenceRaw raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let p = ScriptureReferenceParser.parse(trimmed) {
            return ScriptureReferenceParser.format(
                bookIndex: p.bookIndex,
                chapter: p.chapter,
                verseStart: p.verseStart,
                verseEnd: p.verseEnd
            )
        }
        return trimmed
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
        try? modelContext.saveWithLogging()
        return thread
    }

    @MainActor
    @discardableResult
    static func createMiniNote(
        parent: Note,
        spaceId: UUID,
        sourceSnippet: String,
        body: String,
        focusTitle: String? = nil,
        highlightAccent: StudyHighlightAccentToken = .warmAmber,
        expandedAnchorUTF16Range: NSRange? = nil,
        expandedPlainForAnchor: String? = nil,
        modelContext: ModelContext
    ) -> StudyThread {
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedCustomTitle = (focusTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let title = trimmedCustomTitle.isEmpty
            ? ThreadEditorSnippet.deriveFocus(from: sourceSnippet)
            : trimmedCustomTitle
        let seededPrompts = StudyPromptSuggester.questions(
            forSnippet: sourceSnippet,
            detectedRefs: parent.detectedRefs
        )
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: sourceSnippet,
            focusTitle: title,
            notesBody: "",
            suggestedQuestions: seededPrompts,
            entryKindRaw: StudyThread.EntryKind.miniNote.rawValue,
            miniNoteBody: trimmedBody,
            highlightAccentRaw: highlightAccent.rawValue,
            parentNote: parent
        )
        if let rr = expandedAnchorUTF16Range, let plain = expandedPlainForAnchor {
            applyAnchoredExpandedRange(rr, expandedPlain: plain, to: thread)
        }
        modelContext.insert(thread)
        try? modelContext.saveWithLogging()
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
        try? modelContext.saveWithLogging()
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
        try? modelContext.saveWithLogging()
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
        try? modelContext.saveWithLogging()
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
        let seededPrompts = StudyPromptSuggester.questions(forScriptureExcerpt: trimmedRef, reference: display)
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: sourceSnippet,
            focusTitle: focus,
            notesBody: "",
            suggestedQuestions: seededPrompts,
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
        try? modelContext.saveWithLogging()
        let threadId = thread.id
        Task { await warmScriptureReflectionQuestions(threadId: threadId, modelContext: modelContext) }
        return thread
    }

    /// Passage highlight from the scripture pill dock: keyed by reference + translation + excerpt (no note-body anchor).
    @MainActor
    @discardableResult
    static func createScripturePassageHighlight(
        parent: Note,
        spaceId: UUID,
        referenceRaw: String,
        translation: String,
        excerptRaw: String,
        annotation: String = "",
        focusTitle: String? = nil,
        highlightAccent: StudyHighlightAccentToken = .neutral,
        modelContext: ModelContext
    ) -> StudyThread {
        let normalized = StudyThread.normalizedPassageExcerpt(excerptRaw)
        let display = canonicalScriptureDisplay(fromReferenceRaw: referenceRaw)
        let trimmedRef = referenceRaw.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedAnnotation = annotation.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedCustomTitle = (focusTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let derivedFocus = ThreadEditorSnippet.deriveFocus(from: normalized.isEmpty ? trimmedRef : normalized)
        let focus = trimmedCustomTitle.isEmpty ? derivedFocus : trimmedCustomTitle
        let seededPrompts = StudyPromptSuggester.questions(
            forScriptureExcerpt: normalized.isEmpty ? trimmedRef : normalized,
            reference: display
        )
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: normalized.isEmpty ? trimmedRef : normalized,
            focusTitle: focus,
            notesBody: "",
            suggestedQuestions: seededPrompts,
            entryKindRaw: StudyThread.EntryKind.scriptureLink.rawValue,
            miniNoteBody: trimmedAnnotation,
            scriptureReference: display,
            scripturePassageTranslation: translation,
            scripturePassageExcerpt: normalized.isEmpty ? nil : normalized,
            highlightAccentRaw: highlightAccent.rawValue,
            parentNote: parent
        )
        modelContext.insert(thread)
        try? modelContext.saveWithLogging()
        touchParentNoteIfNeeded(thread, modelContext: modelContext)
        let threadId = thread.id
        Task { await warmScriptureReflectionQuestions(threadId: threadId, modelContext: modelContext) }
        return thread
    }

    /// All dock passage highlights for this reference + translation across the local library (any space).
    @MainActor
    static func fetchScripturePassageHighlights(
        canonicalReference: String,
        translation: String,
        modelContext: ModelContext
    ) -> [StudyThread] {
        let kind = StudyThread.EntryKind.scriptureLink.rawValue
        let ref = canonicalReference
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.entryKindRaw == kind && !t.isArchived && t.scriptureReference == ref
            },
            sortBy: [SortDescriptor(\StudyThread.createdAt, order: .forward)]
        )
        let rows = (try? modelContext.fetch(descriptor)) ?? []
        return rows.filter { row in
            let trans = row.scripturePassageTranslation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let ex = row.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trans == translation && !ex.isEmpty
        }
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

    /// Deletes a note-to-note link marker only (both notes remain). Parent note `updatedAt` is bumped for vault/index consistency.
    @MainActor
    static func deleteLinkedNoteMarker(_ thread: StudyThread, modelContext: ModelContext) {
        guard StudyThread.EntryKind(rawValue: thread.entryKindRaw) == .linkedNote else { return }
        touchParentNoteIfNeeded(thread, modelContext: modelContext)
        modelContext.delete(thread)
        try? modelContext.saveWithLogging()
    }

    @MainActor
    static func save(_ thread: StudyThread, modelContext: ModelContext) {
        thread.updatedAt = Date()
        try? modelContext.saveWithLogging()
    }

    @MainActor
    static func touchParentNoteIfNeeded(_ thread: StudyThread, modelContext: ModelContext) {
        guard let note = thread.parentNote ?? fetchParentNote(id: thread.parentNoteId, modelContext: modelContext) else { return }
        note.updatedAt = Date()
        try? modelContext.saveWithLogging()
    }

    @MainActor
    private static func fetchParentNote(id: UUID, modelContext: ModelContext) -> Note? {
        let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == id })
        return try? modelContext.fetch(fd).first
    }

    /// Pre-warm Apple Intelligence reflection questions for a scripture thread.
    /// Safe to fire-and-forget; idempotent via `aiSuggestedQuestionsGenerated`.
    /// No-ops gracefully on older OS or when Apple Intelligence is unavailable.
    @MainActor
    static func warmScriptureReflectionQuestions(threadId: UUID, modelContext: ModelContext) async {
        guard #available(macOS 26.0, iOS 26.0, *) else { return }
        guard let thread = fetch(id: threadId, modelContext: modelContext),
              thread.entryKind == .scriptureLink,
              !thread.aiSuggestedQuestionsGenerated else { return }

        let ref = thread.scriptureReference ?? thread.miniNoteBody
        let trimmed = ref.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let excerpt = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let snippet = excerpt.isEmpty ? trimmed : excerpt

        do {
            let generated = try await ScriptureReflectionGenerator.generate(excerpt: snippet, reference: trimmed)
            // Re-fetch after async gap — dock's .task may have raced us to completion.
            guard let t = fetch(id: threadId, modelContext: modelContext),
                  !t.aiSuggestedQuestionsGenerated else { return }
            let defaults = StudyPromptSuggester.questions(forScriptureExcerpt: snippet, reference: trimmed)
            t.suggestedQuestions = generated + defaults
            t.aiSuggestedQuestionsGenerated = true
            try? modelContext.saveWithLogging()
        } catch {
            // Model unavailable or generation failed — heuristic seeds remain; dock will retry on next open.
        }
    }
}
