import SwiftUI
import SwiftData

#if os(iOS)
import UIKit

/// iPhone Scripture index: books with parsed references, drill-in to notes for that book.
struct ScriptureHubView: View {
    @Binding var iosSelectedNoteId: UUID?
    var externalSearchText: Binding<String>? = nil
    @State private var fallbackSearchText = ""
    @State private var scriptureDrill: ScriptureDrill = .root

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    private enum ScriptureDrill: Equatable {
        case root
        case book(Int)
        case passage(ParsedScriptureFields)
    }

    private var notesInActiveSpace: [Note] {
        let sid = spaceStore.activeSpaceUUID()
        let scoped = notes.filter { $0.resolvedSpaceId() == sid }
        if scoped.isEmpty, !notes.isEmpty {
            return notes
        }
        return scoped
    }

    private var activeSearchQuery: String {
        externalSearchText?.wrappedValue ?? fallbackSearchText
    }

    private var scriptureBookRows: [ScriptureBookRow] {
        ScriptureBookListIndex.rows(from: notesInActiveSpace)
    }

    private var filteredScriptureBookRows: [ScriptureBookRow] {
        ScriptureBookListIndex.filtered(
            rows: scriptureBookRows,
            query: activeSearchQuery,
            notesForBucketMatching: notesInActiveSpace
        )
    }

    private var scriptureReferenceRowsForBookDrill: [ScriptureReferenceRow] {
        if case .book(let bookIdx) = scriptureDrill {
            return ScriptureBookListIndex.referenceRows(bookIndex: bookIdx, notesInActiveSpace: notesInActiveSpace)
        }
        return []
    }

    private var filteredScriptureReferenceRows: [ScriptureReferenceRow] {
        if case .book = scriptureDrill {
            return ScriptureBookListIndex.filteredReferenceRows(
                rows: scriptureReferenceRowsForBookDrill,
                query: activeSearchQuery,
                notesForBucketMatching: notesInActiveSpace
            )
        }
        return []
    }

    private var navigationTitleText: String {
        switch scriptureDrill {
        case .root:
            return ""
        case .book(let idx):
            return NoteFilter.scriptureBook(bookIndex: idx).displayName
        case .passage(let p):
            return NoteFilter.scripturePassage(p).displayName
        }
    }

    private var scriptureBackAccessibilityLabel: String {
        switch scriptureDrill {
        case .root: return ""
        case .book: return "Back to Scripture index"
        case .passage: return "Back to passages"
        }
    }

    private var searchBinding: Binding<String> {
        externalSearchText ?? $fallbackSearchText
    }

    var body: some View {
        Group {
            switch scriptureDrill {
            case .root:
                Group { scriptureRootContent }
                    .background(Color.clear)
            case .book:
                Group { scripturePassagesBookContent }
                    .background(Color.clear)
            case .passage(let passage):
                NoteListColumn(
                    filter: .scripturePassage(passage),
                    selectedNote: .constant(nil),
                    externalSearchText: searchBinding,
                    columnStyle: .iOSTabNoteList,
                    navigationTitleOverride: nil,
                    searchPresentationBinding: nil,
                    iosSelectedNoteId: $iosSelectedNoteId,
                    onNewNote: {}
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(navigationTitleText)
        .navigationBarTitleDisplayMode(.inline)
        .harvousIOSGlassOverCanvasShell()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
            }
            if scriptureDrill != .root {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        switch scriptureDrill {
                        case .root: break
                        case .book:
                            scriptureDrill = .root
                        case .passage(let p):
                            scriptureDrill = .book(p.bookIndex)
                        }
                    } label: {
                        HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 17)
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)
                    .tint(.primary)
                    .accessibilityLabel(scriptureBackAccessibilityLabel)
                }
            }
            if #available(iOS 26, *) {
                ToolbarSpacer(.fixed, placement: .topBarLeading)
            }
            ToolbarItem(placement: .topBarLeading) {
                IOSListSurfaceChip()
            }
            HarvousIOSProfileToolbarTrailingItem {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.more)
            }
        }
        .onChange(of: appRouter.iosListSurface) { _, newSurface in
            if newSurface != .scripture {
                scriptureDrill = .root
            }
        }
    }

    @ViewBuilder
    private var scripturePassagesBookContent: some View {
        if !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredScriptureReferenceRows.isEmpty {
            ContentUnavailableView.search(text: activeSearchQuery)
        } else if scriptureReferenceRowsForBookDrill.isEmpty {
            HarvousEmptyStateView(
                iconAsset: "Harvous.BookOpen",
                title: "No passages",
                description: "No parsed references for this book in the active space.",
                scale: .compact
            )
        } else {
            List {
                ForEach(filteredScriptureReferenceRows) { row in
                    Button {
                        scriptureDrill = .passage(row.passage)
                    } label: {
                        FolderFeedRow(
                            title: row.title,
                            noteCount: row.noteCount,
                            isPinned: false,
                            variant: .conversation
                        )
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 4, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 4, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .iosListBottomChromeReserve()
        }
    }

    @ViewBuilder
    private var scriptureRootContent: some View {
        if notesInActiveSpace.isEmpty {
            emptyNotesState
        } else if scriptureBookRows.isEmpty {
            HarvousEmptyStateView(
                iconAsset: "Harvous.BookOpen",
                title: "No Scripture References",
                description: "Add scripture references in your notes to build your index.",
                scale: .compact
            )
        } else if !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredScriptureBookRows.isEmpty {
            ContentUnavailableView.search(text: activeSearchQuery)
        } else {
            scriptureFlatList
        }
    }

    private var emptyNotesState: some View {
        HarvousEmptyStateView(
            iconAsset: "Harvous.BookOpen",
            title: "Your notes will organize here",
            scale: .compact
        )
    }

    private var scriptureFlatList: some View {
        List {
            ForEach(filteredScriptureBookRows) { row in
                Button {
                    scriptureDrill = .book(row.bookIndex)
                } label: {
                    FolderFeedRow(
                        title: row.title,
                        noteCount: row.noteCount,
                        isPinned: false,
                        customSubtitle: row.bookListSubtitle,
                        variant: .conversation
                    )
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 4, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .iosListBottomChromeReserve()
    }
}

#else

struct ScriptureHubView: View {
    var body: some View {
        EmptyView()
    }
}

#endif
