#if os(iOS)
import SwiftData
import SwiftUI

/// iPhone universal search host — replaces hub list content when bottom-chrome search is active.
struct IOSUniversalSearchHost: View {
    @Binding var iosSelectedNoteId: UUID?
    let query: String

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Query(
        sort: [
            SortDescriptor(\StudyThread.createdAt, order: .reverse),
            SortDescriptor(\StudyThread.id, order: .forward),
        ]
    )
    private var studyThreads: [StudyThread]

    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    private var notesInActiveSpace: [Note] {
        HarvousNoteListVisibility.notesInActiveSpace(
            from: notes,
            spaceId: spaceStore.activeSpaceUUID()
        )
    }

    private var folderRows: [HarvousFolderRow] {
        HarvousFolderListIndex.rows(from: notesInActiveSpace)
    }

    private var threadClusters: [ThreadStore.NoteCluster] {
        ThreadStore.connectedClusters(from: notesInActiveSpace, modelContext: modelContext)
    }

    private var scriptureBookRows: [ScriptureBookRow] {
        ScriptureBookListIndex.rows(from: notesInActiveSpace)
    }

    private var highlightThreadsForSearch: [StudyThread] {
        let sid = spaceStore.activeSpaceUUID()
        let scoped = StudyHighlightListIndex.rowsInActiveSpace(
            threads: studyThreads,
            activeSpaceId: sid,
            allowUnscopedFallback: true
        )
        return StudyHighlightListIndex.sortedForList(
            scoped.filter { StudyHighlightListIndex.isEligibleListHighlight($0) }
        )
    }

    private var threadDrillNotes: [Note] {
        if case .cluster(_, _, let memberIds) = appRouter.iosThreadsDrill {
            let idSet = Set(memberIds)
            return notesInActiveSpace.filter { idSet.contains($0.id) }
        }
        return []
    }

    private var scripturePassageNotes: [Note] {
        if case .passage(let p) = appRouter.iosScriptureDrill {
            return notesInActiveSpace.filter { $0.noteBelongsToScripturePassage(p) }
        }
        return []
    }

    private var searchData: SidebarUniversalSearchIndex.SearchData {
        SidebarUniversalSearchIndex.SearchData(
            notes: notesInActiveSpace,
            folderRows: folderRows,
            highlightThreads: highlightThreadsForSearch,
            scriptureBookRows: scriptureBookRows,
            threadClusters: threadClusters,
            threadDrillNotes: threadDrillNotes,
            scripturePassageNotes: scripturePassageNotes
        )
    }

    private var activeContext: SidebarUniversalSearchIndex.ActiveContext {
        var ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: mapSurface(appRouter.iosListSurface),
            folderDrillLabel: nil,
            folderDrilledIn: false,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )

        switch appRouter.iosListSurface {
        case .folders:
            if case .bucket(let key) = appRouter.iosFoldersDrill {
                ctx.folderDrilledIn = true
                ctx.folderDrillLabel = NoteFilter.folder(key).displayName
            }
        case .threads:
            if case .cluster(_, let title, _) = appRouter.iosThreadsDrill {
                ctx.threadDrilledIn = true
                ctx.threadDrillTitle = title
            }
        case .scripture:
            switch appRouter.iosScriptureDrill {
            case .root:
                ctx.scriptureDrillLevel = .root
            case .book(let idx):
                ctx.scriptureDrillLevel = .book
                ctx.scriptureBookIndex = idx
                ctx.scriptureBookTitle = NoteFilter.scriptureBook(bookIndex: idx).displayName
            case .passage(let p):
                ctx.scriptureDrillLevel = .passage
                ctx.scriptureBookIndex = p.bookIndex
                ctx.scripturePassageTitle = NoteFilter.scripturePassage(p).displayName
            }
        default:
            break
        }

        return ctx
    }

    var body: some View {
        SidebarUniversalSearchResultsView(
            query: query,
            activeContext: activeContext,
            searchData: searchData,
            onSelect: activateSearchResult
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func mapSurface(_ surface: HarvousIOSListSurface) -> SidebarUniversalSearchIndex.ActiveContext.SidebarPanelViewMode {
        switch surface {
        case .notes: return .notes
        case .folders: return .folders
        case .threads: return .threads
        case .scripture: return .scripture
        case .highlights: return .highlights
        case .more: return .notes
        }
    }

    private func activateSearchResult(_ result: SidebarSearchResult) {
        switch result.kind {
        case .note:
            if let id = result.noteId {
                iosSelectedNoteId = id
            }
        case .folder:
            appRouter.selectIOSListSurface(.folders)
            appRouter.iosFoldersDrill = .bucket(result.folderLabel)
        case .threadCluster:
            if let repId = result.threadClusterRepresentativeId,
               let cluster = threadClusters.first(where: { $0.id == repId }) {
                appRouter.selectIOSListSurface(.threads)
                appRouter.iosThreadsDrill = .cluster(
                    representativeId: cluster.id,
                    title: cluster.title,
                    memberIds: cluster.memberIds
                )
            }
        case .highlight:
            if let tid = result.highlightThreadId,
               let thread = studyThreads.first(where: { $0.id == tid }) {
                appRouter.enqueueStudyHighlightListActivation(
                    noteId: thread.parentNoteId,
                    threadId: tid
                )
                iosSelectedNoteId = thread.parentNoteId
            }
        case .scriptureBook:
            if let idx = result.scriptureBookIndex {
                appRouter.selectIOSListSurface(.scripture)
                appRouter.iosScriptureDrill = .book(idx)
            }
        case .scripturePassage:
            if let passage = result.scripturePassage {
                appRouter.selectIOSListSurface(.scripture)
                appRouter.iosScriptureDrill = .passage(passage)
            }
        }
    }
}
#endif
