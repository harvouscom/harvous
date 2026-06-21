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

    /// Space-validated thread list for a note; falls back to parent-only when space-scoped fetch is empty
    /// (orphan threads from cross-environment drift still surface on open).
    @MainActor
    static func activeThreads(for note: Note, modelContext: ModelContext) -> [StudyThread] {
        let spaceId = note.resolvedSpaceId(in: modelContext)
        let scoped = activeThreads(parentNoteId: note.id, spaceId: spaceId, modelContext: modelContext)
        if !scoped.isEmpty { return scoped }
        return activeThreadsUnscoped(parentNoteId: note.id, modelContext: modelContext)
    }

    @MainActor
    static func activeThreadsUnscoped(parentNoteId: UUID, modelContext: ModelContext) -> [StudyThread] {
        let nid = parentNoteId
        let fd = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in t.parentNoteId == nid && !t.isArchived },
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
        thread.markDirty()
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
        linked.markDirty()

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
        marker.markDirty()
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
        // Return existing connection if one already exists (prevents UI duplicates).
        let parentId = parent.id
        let linkedId = linked.id
        let existingDescriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.parentNoteId == parentId
                    && t.linkedNoteId == linkedId
                    && t.entryKindRaw == "linkedNote"
                    && !t.isArchived
            }
        )
        if let existing = (try? modelContext.fetch(existingDescriptor))?.first {
            return existing
        }
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

    /// Passage reference from the scripture pill dock: keyed by reference + translation + excerpt (no note-body anchor).
    @MainActor
    @discardableResult
    static func createPassageReferenceHighlight(
        parent: Note,
        spaceId: UUID,
        referenceRaw: String,
        translation: String,
        word: String,
        modelContext: ModelContext
    ) -> StudyThread {
        let trimmed = word.trimmingCharacters(in: .whitespacesAndNewlines)
        let display = canonicalScriptureDisplay(fromReferenceRaw: referenceRaw)
        let excerpt = StudyThread.normalizedPassageExcerpt(trimmed)
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: trimmed,
            focusTitle: trimmed,
            entryKindRaw: StudyThread.EntryKind.reference.rawValue,
            scriptureReference: display,
            scripturePassageTranslation: translation,
            scripturePassageExcerpt: excerpt.isEmpty ? nil : excerpt,
            highlightAccentRaw: StudyHighlightAccentToken.warmAmber.rawValue,
            parentNote: parent
        )
        modelContext.insert(thread)
        try? modelContext.saveWithLogging()
        touchParentNoteIfNeeded(thread, modelContext: modelContext)
        return thread
    }

    /// Inline reference-lookup highlight anchored to the current body selection (Easton's dictionary look-up flow).
    @MainActor
    @discardableResult
    static func createReferenceHighlight(
        parent: Note,
        spaceId: UUID,
        word: String,
        expandedAnchorUTF16Range: NSRange,
        expandedPlainForAnchor: String,
        modelContext: ModelContext
    ) -> StudyThread {
        let trimmed = word.trimmingCharacters(in: .whitespacesAndNewlines)
        let thread = StudyThread(
            spaceId: spaceId,
            parentNoteId: parent.id,
            sourceSnippet: trimmed,
            focusTitle: trimmed,
            entryKindRaw: StudyThread.EntryKind.reference.rawValue,
            highlightAccentRaw: StudyHighlightAccentToken.warmAmber.rawValue,
            parentNote: parent
        )
        applyAnchoredExpandedRange(expandedAnchorUTF16Range, expandedPlain: expandedPlainForAnchor, to: thread)
        modelContext.insert(thread)
        try? modelContext.saveWithLogging()
        touchParentNoteIfNeeded(thread, modelContext: modelContext)
        return thread
    }

    /// All dock passage highlights for this reference + translation across the local library (any space).
    @MainActor
    static func fetchScripturePassageHighlights(
        canonicalReference: String,
        translation: String,
        modelContext: ModelContext
    ) -> [StudyThread] {
        fetchScripturePassageStudyThreads(
            canonicalReference: canonicalReference,
            translation: translation,
            entryKind: .scriptureLink,
            modelContext: modelContext
        )
    }

    /// Saved passage references (Easton's dictionary words underlined in scripture dock text).
    @MainActor
    static func fetchScripturePassageReferences(
        canonicalReference: String,
        translation: String,
        modelContext: ModelContext
    ) -> [StudyThread] {
        fetchScripturePassageStudyThreads(
            canonicalReference: canonicalReference,
            translation: translation,
            entryKind: .reference,
            modelContext: modelContext
        )
    }

    @MainActor
    private static func fetchScripturePassageStudyThreads(
        canonicalReference: String,
        translation: String,
        entryKind: StudyThread.EntryKind,
        modelContext: ModelContext
    ) -> [StudyThread] {
        let kind = entryKind.rawValue
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
        let sid = note.resolvedSpaceId(in: modelContext)
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
        var incoming = (try? modelContext.fetch(incomingDescriptor)) ?? []
        var outgoing = (try? modelContext.fetch(outgoingDescriptor)) ?? []
        if incoming.isEmpty, outgoing.isEmpty {
            let incomingUnscoped = FetchDescriptor<StudyThread>(
                predicate: #Predicate { t in
                    t.entryKindRaw == linkedKindRaw
                        && t.linkedNoteId == noteId
                        && !t.isArchived
                },
                sortBy: [SortDescriptor(\StudyThread.updatedAt, order: .reverse)]
            )
            let outgoingUnscoped = FetchDescriptor<StudyThread>(
                predicate: #Predicate { t in
                    t.parentNoteId == noteId
                        && t.entryKindRaw == linkedKindRaw
                        && !t.isArchived
                },
                sortBy: [SortDescriptor(\StudyThread.updatedAt, order: .reverse)]
            )
            incoming = (try? modelContext.fetch(incomingUnscoped)) ?? []
            outgoing = (try? modelContext.fetch(outgoingUnscoped)) ?? []
        }
        // Deduplicate so the same source/target note never shows twice (e.g. from sync duplicates).
        var seen = Set<UUID>()
        incoming = incoming.filter { seen.insert($0.parentNoteId).inserted }
        seen.removeAll()
        outgoing = outgoing.filter {
            guard let lid = $0.linkedNoteId else { return false }
            return seen.insert(lid).inserted
        }
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
        HarvousSyncingDelete.delete(thread: thread, context: modelContext)
        try? modelContext.saveWithLogging()
    }

    /// Removes every `linkedNote` thread whose marker (`parentNoteId` *or* `linkedNoteId`) points to
    /// `deletedNoteId`. Call right before / after deleting a `Note` so dangling pills and underlines
    /// in any *other* note that referenced the doomed note get cleaned up in the same commit.
    /// Returns the set of parent note ids whose UI should refresh after the cleanup.
    @MainActor
    @discardableResult
    static func purgeLinkedNoteMarkers(referencingDeletedNote deletedNoteId: UUID, modelContext: ModelContext) -> Set<UUID> {
        let nid = deletedNoteId
        let linkedKindRaw = StudyThread.EntryKind.linkedNote.rawValue
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.entryKindRaw == linkedKindRaw
                    && (t.linkedNoteId == nid || t.parentNoteId == nid)
            }
        )
        let orphans = (try? modelContext.fetch(descriptor)) ?? []
        guard !orphans.isEmpty else { return [] }
        var touchedParents = Set<UUID>()
        for t in orphans {
            if t.parentNoteId != nid { touchedParents.insert(t.parentNoteId) }
            HarvousSyncingDelete.delete(thread: t, context: modelContext)
        }
        try? modelContext.saveWithLogging()
        return touchedParents
    }

    /// Lazy migration: scan every `linkedNote` thread parented to `parentNoteId` and delete any whose
    /// `linkedNoteId` no longer resolves to an existing `Note`. Heals legacy orphans created before
    /// `purgeLinkedNoteMarkers(referencingDeletedNote:)` was wired into note deletion. Returns true if
    /// anything was deleted so the caller can trigger a UI refresh.
    @MainActor
    @discardableResult
    static func purgeDanglingLinkedNoteMarkers(parentNoteId: UUID, modelContext: ModelContext) -> Bool {
        let nid = parentNoteId
        let linkedKindRaw = StudyThread.EntryKind.linkedNote.rawValue
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.parentNoteId == nid && t.entryKindRaw == linkedKindRaw
            }
        )
        let candidates = (try? modelContext.fetch(descriptor)) ?? []
        guard !candidates.isEmpty else { return false }
        var deletedAny = false
        for t in candidates {
            guard let linkedId = t.linkedNoteId else {
                HarvousSyncingDelete.delete(thread: t, context: modelContext)
                deletedAny = true
                continue
            }
            let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == linkedId })
            let exists = ((try? modelContext.fetch(fd))?.first) != nil
            if !exists {
                HarvousSyncingDelete.delete(thread: t, context: modelContext)
                deletedAny = true
            }
        }
        if deletedAny {
            try? modelContext.saveWithLogging()
        }
        return deletedAny
    }

    /// One-shot global sweep — walks every `linkedNote` thread in the database, drops any whose
    /// `linkedNoteId` no longer resolves to a `Note`. Call once at app launch (or from a refresh
    /// command) to heal accumulated orphans across all notes / all spaces in one pass.
    @MainActor
    @discardableResult
    static func purgeAllDanglingLinkedNoteMarkers(modelContext: ModelContext) -> Int {
        let linkedKindRaw = StudyThread.EntryKind.linkedNote.rawValue
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in t.entryKindRaw == linkedKindRaw }
        )
        let all = (try? modelContext.fetch(descriptor)) ?? []
        guard !all.isEmpty else { return 0 }
        // Snapshot existing Note ids in one fetch instead of one-fetch-per-thread.
        let allNotes = (try? modelContext.fetch(FetchDescriptor<Note>())) ?? []
        let liveIds = Set(allNotes.map(\.id))
        var deleted = 0
        for t in all {
            let linkedId = t.linkedNoteId
            if linkedId == nil || !liveIds.contains(linkedId!) {
                HarvousSyncingDelete.delete(thread: t, context: modelContext)
                deleted += 1
            }
        }
        if deleted > 0 {
            try? modelContext.saveWithLogging()
            #if DEBUG
            print("[ThreadStore] purgeAllDanglingLinkedNoteMarkers: removed \(deleted) orphans")
            #endif
        }
        return deleted
    }

    @MainActor
    static func save(_ thread: StudyThread, modelContext: ModelContext) {
        let now = Date()
        thread.updatedAt = now
        thread.highlightListEditedAt = now
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
    // MARK: - Connected note clusters

    struct NoteCluster: Identifiable {
        var id: UUID        // representative note id (most connections)
        var title: String
        var noteCount: Int
        var memberIds: [UUID]
        var updatedAt: Date?
    }

    /// Computes connected components of the `linkedNote` connection graph from local SwiftData rows.
    /// Each component becomes a "Thread" cluster shown in the Threads sidebar list.
    @MainActor
    static func connectedClusters(from notes: [Note], modelContext: ModelContext) -> [NoteCluster] {
        let linkedKindRaw = "linkedNote"
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in
                t.entryKindRaw == linkedKindRaw && !t.isArchived
            }
        )
        let edges = (try? modelContext.fetch(descriptor)) ?? []

        // Build bidirectional adjacency map from edges (parentNoteId ↔ linkedNoteId).
        let noteIdSet = Set(notes.map(\.id))
        var adj: [UUID: Set<UUID>] = [:]
        for edge in edges {
            guard let linkedId = edge.linkedNoteId else { continue }
            let from = edge.parentNoteId
            let to = linkedId
            // Only include nodes whose notes are present in the provided notes array.
            guard noteIdSet.contains(from), noteIdSet.contains(to) else { continue }
            adj[from, default: []].insert(to)
            adj[to, default: []].insert(from)
        }

        // BFS to find connected components.
        var visited = Set<UUID>()
        var clusters: [NoteCluster] = []
        let noteById = Dictionary(uniqueKeysWithValues: notes.map { ($0.id, $0) })

        for startId in adj.keys where !visited.contains(startId) {
            var component: [UUID] = []
            var queue: [UUID] = [startId]
            visited.insert(startId)
            while !queue.isEmpty {
                let current = queue.removeFirst()
                component.append(current)
                for neighbor in adj[current] ?? [] where !visited.contains(neighbor) {
                    visited.insert(neighbor)
                    queue.append(neighbor)
                }
            }
            guard component.count > 1 else { continue }

            // Pick representative: most connections, break ties by newest updatedAt.
            let repId = component.max(by: {
                let degA = adj[$0]?.count ?? 0
                let degB = adj[$1]?.count ?? 0
                if degA != degB { return degA < degB }
                let tA = noteById[$0]?.updatedAt ?? .distantPast
                let tB = noteById[$1]?.updatedAt ?? .distantPast
                return tA < tB
            }) ?? component[0]

            let rep = noteById[repId]
            let rawTitle = rep?.title.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let title = rawTitle.isEmpty ? "Untitled" : rawTitle
            let latestUpdate = component.compactMap { noteById[$0]?.updatedAt }.max()

            clusters.append(NoteCluster(
                id: repId,
                title: title,
                noteCount: component.count,
                memberIds: component,
                updatedAt: latestUpdate
            ))
        }

        // Sort A–Z by cluster title (number-prefixed titles sort from first letter).
        return clusters.sorted {
            HarvousAlphabeticalSortKey.compareLabels($0.title, $1.title) == .orderedAscending
        }
    }

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
            let generated = try await Task.detached(priority: .userInitiated) {
                try await ScriptureReflectionGenerator.generate(excerpt: snippet, reference: trimmed)
            }.value
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
