import Foundation

/// Universal sidebar search — active-view matches plus cross-space "elsewhere" results.
enum SidebarUniversalSearchIndex {
    static let elsewhereResultsCap = 50

    enum HighlightKindFilter: String, CaseIterable, Identifiable {
        case all, notes, connected, scripture, references

        var id: String { rawValue }

        var label: String {
            switch self {
            case .all: return "All"
            case .notes: return "Notes"
            case .connected: return "Connected"
            case .scripture: return "Scripture"
            case .references: return "References"
            }
        }

        var iconAsset: String? {
            switch self {
            case .all: return nil
            case .notes: return "Harvous.Note"
            case .connected: return "Harvous.ArrowRightArrowLeft"
            case .scripture: return "Harvous.BookOpen"
            case .references: return "Harvous.LinesLeaning"
            }
        }

        func matches(_ kind: StudyThread.EntryKind) -> Bool {
            switch self {
            case .all: return true
            case .notes: return kind == .workspace || kind == .miniNote
            case .connected: return kind == .linkedNote
            case .scripture: return kind == .scriptureLink
            case .references: return kind == .reference
            }
        }
    }

    struct ActiveContext {
        var mode: SidebarPanelViewMode
        var folderDrillLabel: String?
        var folderDrilledIn: Bool
        var threadDrillTitle: String?
        var threadDrilledIn: Bool
        var scriptureBookTitle: String?
        var scriptureBookIndex: Int?
        var scripturePassageTitle: String?
        var scriptureDrillLevel: ScriptureDrillLevel
        var highlightKindFilter: HighlightKindFilter

        enum SidebarPanelViewMode: String {
            case notes, folders, threads, scripture, highlights
        }

        enum ScriptureDrillLevel {
            case root, book, passage
        }
    }

    struct SearchData {
        var notes: [Note]
        var folderRows: [HarvousFolderRow]
        var highlightThreads: [StudyThread]
        var scriptureBookRows: [ScriptureBookRow]
        var threadClusters: [ThreadStore.NoteCluster]
        var threadDrillNotes: [Note]
        var scripturePassageNotes: [Note]
    }

    static func activeSectionHeader(_ ctx: ActiveContext) -> String {
        switch ctx.mode {
        case .notes:
            return "In Notes"
        case .folders:
            if ctx.folderDrilledIn {
                return "In “\(ctx.folderDrillLabel ?? "No folder")”"
            }
            return "In Folders"
        case .threads:
            if ctx.threadDrilledIn {
                return "In “\(ctx.threadDrillTitle ?? "Thread")”"
            }
            return "In Threads"
        case .highlights:
            return "In Highlights"
        case .scripture:
            switch ctx.scriptureDrillLevel {
            case .root:
                return "In Scripture"
            case .book:
                return "In “\(ctx.scriptureBookTitle ?? "Book")”"
            case .passage:
                return "In “\(ctx.scripturePassageTitle ?? "Passage")”"
            }
        }
    }

    static func elsewhereEmptyStateTitle(
        _ ctx: ActiveContext,
        typeFilter: SidebarElsewhereTypeFilter
    ) -> String {
        switch typeFilter {
        case .notes:
            return SidebarNoMatchCopy.noNotesMatch
        case .folders:
            return SidebarNoMatchCopy.noFoldersMatch
        case .threads:
            return SidebarNoMatchCopy.noThreadsMatch
        case .highlights:
            return SidebarNoMatchCopy.noHighlightsMatch
        case .scripture:
            return SidebarNoMatchCopy.noScriptureMatch
        case .all:
            break
        }

        switch ctx.mode {
        case .notes:
            return "Nothing outside Notes"
        case .folders:
            if ctx.folderDrilledIn {
                return "Nothing outside “\(ctx.folderDrillLabel ?? "No folder")”"
            }
            return "Nothing outside Folders"
        case .threads:
            if ctx.threadDrilledIn {
                return "Nothing outside “\(ctx.threadDrillTitle ?? "Thread")”"
            }
            return "Nothing outside Threads"
        case .highlights:
            return "Nothing outside Highlights"
        case .scripture:
            switch ctx.scriptureDrillLevel {
            case .root:
                return "Nothing outside Scripture"
            case .book:
                return "Nothing outside “\(ctx.scriptureBookTitle ?? "Book")”"
            case .passage:
                return "Nothing outside “\(ctx.scripturePassageTitle ?? "Passage")”"
            }
        }
    }

    static func buildActiveResults(query: String, ctx: ActiveContext, data: SearchData) -> [SidebarSearchResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        switch ctx.mode {
        case .notes:
            return NoteSearchIndex.filter(data.notes, query: trimmed).map { noteResult($0) }
        case .folders:
            if ctx.folderDrilledIn {
                let bucket = data.notes.filter { note in
                    note.noteBelongsToFolderBucket(ctx.folderDrillLabel?.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                return NoteSearchIndex.filter(bucket, query: trimmed).map { noteResult($0) }
            }
            return HarvousFolderListIndex.filtered(
                rows: data.folderRows,
                query: trimmed,
                notesForBucketMatching: data.notes
            ).map { folderResult($0) }
        case .threads:
            if ctx.threadDrilledIn {
                return NoteSearchIndex.filter(data.threadDrillNotes, query: trimmed).map { noteResult($0) }
            }
            return data.threadClusters
                .filter { $0.title.localizedStandardContains(trimmed) }
                .map { threadClusterResult($0) }
        case .highlights:
            let kindFiltered = data.highlightThreads.filter { ctx.highlightKindFilter.matches($0.entryKind) }
            return StudyHighlightListIndex.filter(kindFiltered, query: trimmed).map { highlightResult($0) }
        case .scripture:
            switch ctx.scriptureDrillLevel {
            case .root:
                return ScriptureBookListIndex.filtered(
                    rows: data.scriptureBookRows,
                    query: trimmed,
                    notesForBucketMatching: data.notes
                ).map { scriptureBookResult($0) }
            case .book:
                guard let bookIdx = ctx.scriptureBookIndex else { return [] }
                let refs = ScriptureBookListIndex.referenceRows(bookIndex: bookIdx, notesInActiveSpace: data.notes)
                return ScriptureBookListIndex.filteredReferenceRows(
                    rows: refs,
                    query: trimmed,
                    notesForBucketMatching: data.notes
                ).map { scripturePassageResult($0) }
            case .passage:
                return NoteSearchIndex.filter(data.scripturePassageNotes, query: trimmed).map { noteResult($0) }
            }
        }
    }

    static func buildElsewhereResults(
        query: String,
        data: SearchData,
        excluding ids: Set<String>,
        typeFilter: SidebarElsewhereTypeFilter
    ) -> [SidebarSearchResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        var candidates: [SidebarSearchResult] = []

        for note in NoteSearchIndex.filter(data.notes, query: trimmed) {
            candidates.append(noteResult(note))
        }

        for row in HarvousFolderListIndex.filtered(
            rows: data.folderRows,
            query: trimmed,
            notesForBucketMatching: data.notes
        ) {
            candidates.append(folderResult(row))
        }

        for cluster in data.threadClusters where cluster.title.localizedStandardContains(trimmed) {
            candidates.append(threadClusterResult(cluster))
        }

        for thread in StudyHighlightListIndex.filter(data.highlightThreads, query: trimmed) {
            candidates.append(highlightResult(thread))
        }

        for bookRow in ScriptureBookListIndex.filtered(
            rows: data.scriptureBookRows,
            query: trimmed,
            notesForBucketMatching: data.notes
        ) {
            candidates.append(scriptureBookResult(bookRow))
        }

        for bookRow in data.scriptureBookRows {
            let refs = ScriptureBookListIndex.referenceRows(bookIndex: bookRow.bookIndex, notesInActiveSpace: data.notes)
            for ref in ScriptureBookListIndex.filteredReferenceRows(
                rows: refs,
                query: trimmed,
                notesForBucketMatching: data.notes
            ) {
                candidates.append(scripturePassageResult(ref))
            }
        }

        var deduped: [String: SidebarSearchResult] = [:]
        for result in candidates {
            if ids.contains(result.id) { continue }
            if !typeFilter.matches(result.kind) { continue }
            if deduped[result.id] == nil {
                deduped[result.id] = result
            }
        }

        return deduped.values
            .sorted { lhs, rhs in
                let lRank = matchRank(title: lhs.title, query: trimmed)
                let rRank = matchRank(title: rhs.title, query: trimmed)
                if lRank != rRank { return lRank < rRank }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
            .prefix(elsewhereResultsCap)
            .map { $0 }
    }

    private static func matchRank(title: String, query: String) -> Int {
        let lower = title.lowercased()
        let q = query.lowercased()
        if lower.hasPrefix(q) { return 0 }
        if lower.contains(q) { return 1 }
        return 2
    }

    private static func noteResult(_ note: Note) -> SidebarSearchResult {
        SidebarSearchResult(
            id: SidebarSearchResult.stableId(.note, key: note.id.uuidString),
            kind: .note,
            title: note.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "New Note" : note.title,
            subtitle: notePreview(note),
            highlightEntryKind: nil,
            noteId: note.id,
            folderLabel: nil,
            threadClusterRepresentativeId: nil,
            highlightThreadId: nil,
            scriptureBookIndex: nil,
            scripturePassage: nil
        )
    }

    private static func folderResult(_ row: HarvousFolderRow) -> SidebarSearchResult {
        SidebarSearchResult(
            id: SidebarSearchResult.stableId(.folder, key: row.id),
            kind: .folder,
            title: row.title,
            subtitle: "\(row.count) note\(row.count == 1 ? "" : "s")",
            highlightEntryKind: nil,
            noteId: nil,
            folderLabel: row.folderLabel,
            threadClusterRepresentativeId: nil,
            highlightThreadId: nil,
            scriptureBookIndex: nil,
            scripturePassage: nil
        )
    }

    private static func threadClusterResult(_ cluster: ThreadStore.NoteCluster) -> SidebarSearchResult {
        SidebarSearchResult(
            id: SidebarSearchResult.stableId(.threadCluster, key: cluster.id.uuidString),
            kind: .threadCluster,
            title: cluster.title,
            subtitle: "\(cluster.noteCount) note\(cluster.noteCount == 1 ? "" : "s")",
            highlightEntryKind: nil,
            noteId: nil,
            folderLabel: nil,
            threadClusterRepresentativeId: cluster.id,
            highlightThreadId: nil,
            scriptureBookIndex: nil,
            scripturePassage: nil
        )
    }

    private static func highlightResult(_ thread: StudyThread) -> SidebarSearchResult {
        let parentTitle = thread.parentNote?.title ?? ""
        return SidebarSearchResult(
            id: SidebarSearchResult.stableId(.highlight, key: thread.id.uuidString),
            kind: .highlight,
            title: highlightListTitle(for: thread),
            subtitle: StudyHighlightListIndex.subtitlePreview(for: thread, parentNoteTitle: parentTitle),
            highlightEntryKind: thread.entryKind,
            noteId: thread.parentNoteId,
            folderLabel: nil,
            threadClusterRepresentativeId: nil,
            highlightThreadId: thread.id,
            scriptureBookIndex: nil,
            scripturePassage: nil
        )
    }

    private static func scriptureBookResult(_ row: ScriptureBookRow) -> SidebarSearchResult {
        SidebarSearchResult(
            id: SidebarSearchResult.stableId(.scriptureBook, key: String(row.bookIndex)),
            kind: .scriptureBook,
            title: row.title,
            subtitle: row.bookListSubtitle,
            highlightEntryKind: nil,
            noteId: nil,
            folderLabel: nil,
            threadClusterRepresentativeId: nil,
            highlightThreadId: nil,
            scriptureBookIndex: row.bookIndex,
            scripturePassage: nil
        )
    }

    private static func scripturePassageResult(_ row: ScriptureReferenceRow) -> SidebarSearchResult {
        SidebarSearchResult(
            id: SidebarSearchResult.stableId(.scripturePassage, key: row.id),
            kind: .scripturePassage,
            title: row.title,
            subtitle: "\(row.noteCount) note\(row.noteCount == 1 ? "" : "s")",
            highlightEntryKind: nil,
            noteId: nil,
            folderLabel: nil,
            threadClusterRepresentativeId: nil,
            highlightThreadId: nil,
            scriptureBookIndex: row.passage.bookIndex,
            scripturePassage: row.passage
        )
    }

    static func highlightListTitle(for thread: StudyThread) -> String {
        if StudyHighlightListIndex.isScripturePassageHighlight(thread) {
            let excerpt = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !excerpt.isEmpty { return excerpt }
        }
        let anchor = (thread.anchorTextSnapshot ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !anchor.isEmpty { return anchor }
        let focus = thread.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !focus.isEmpty { return focus }
        return "Highlight"
    }

    private static func notePreview(_ note: Note) -> String? {
        let body = note.body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return nil }
        if body.count > 80 {
            return String(body.prefix(79)) + "…"
        }
        return body
    }
}
