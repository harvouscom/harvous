import SwiftUI
import SwiftData

#if os(iOS)
import UIKit

/// iPhone Scripture index: books with parsed references, drill-in to notes for that book.
struct ScriptureHubView: View {
    @Binding var iosSelectedNoteId: UUID?
    var externalSearchText: Binding<String>? = nil
    @State private var fallbackSearchText = ""

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    /// Drill state lives on `HarvousAppRouter.iosScriptureDrill` so the top-bar chip can read it.
    private var scriptureDrill: HarvousIOSScriptureDrill {
        appRouter.iosScriptureDrill
    }

    private var notesInActiveSpace: [Note] {
        HarvousNoteListVisibility.notesInActiveSpace(
            from: notes,
            spaceId: spaceStore.activeSpaceUUID()
        )
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
        // Drilled context (book / passage) lives in `IOSListSurfaceChip` only — no duplicate nav title.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .harvousIOSGlassOverCanvasShell()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
            }
            if #available(iOS 26, *) {
                ToolbarSpacer(.fixed, placement: .topBarLeading)
            }
            // When drilled into a book or passage, the chip morphs into chevron-back + book name
            // (see `IOSListSurfaceChip`), so no separate back button is needed here.
            ToolbarItem(placement: .topBarLeading) {
                IOSListSurfaceChip()
            }
            HarvousIOSProfileToolbarTrailingItem {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.more)
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
                        appRouter.iosScriptureDrill = .passage(row.passage)
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
        ScrollView {
            LazyVGrid(columns: HarvousCollectionGridLayout.columns, spacing: HarvousCollectionGridLayout.spacing) {
                ForEach(filteredScriptureBookRows) { row in
                    Button {
                        appRouter.iosScriptureDrill = .book(row.bookIndex)
                    } label: {
                        CollectionGridCard(
                            iconAssetName: "Harvous.BookOpen",
                            title: row.title,
                            subtitle: row.bookListSubtitle
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, HarvousCollectionGridLayout.horizontalPadding)
            .padding(.top, HarvousCollectionGridLayout.topPadding)
            .iosListBottomChromeScrollContentBottomPadding()
        }
        .scrollContentBackground(.hidden)
    }
}

#else

struct ScriptureHubView: View {
    var body: some View {
        EmptyView()
    }
}

#endif
