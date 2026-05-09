import SwiftUI
import SwiftData

#if os(iOS)
import UIKit

/// iPhone Scripture index: books with parsed references, drill-in to notes for that book.
struct ScriptureHubView: View {
    @Binding var iosNoteNavigationPath: [UUID]
    var externalSearchText: Binding<String>? = nil
    @State private var fallbackSearchText = ""
    @State private var scriptureDrill: ScriptureDrill = .root

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var votdPassageCardDismissedDay: String = ""

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

    private var showDailyPassageRow: Bool {
        activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && votdPassageCardDismissedDay != VotdService.todayCalendarDayKey()
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
                    .background(Color(.systemGroupedBackground))
            case .book:
                Group { scripturePassagesBookContent }
                    .background(Color(.systemGroupedBackground))
            case .passage(let passage):
                NoteListColumn(
                    filter: .scripturePassage(passage),
                    selectedNote: .constant(nil),
                    externalSearchText: searchBinding,
                    columnStyle: .iOSTabNoteList,
                    navigationTitleOverride: nil,
                    searchPresentationBinding: nil,
                    iosNoteNavPath: $iosNoteNavigationPath,
                    onNewNote: {}
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(navigationTitleText)
        .navigationBarTitleDisplayMode(.inline)
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
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)
                    .tint(.primary)
                    .accessibilityLabel(scriptureBackAccessibilityLabel)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appRouter.selectIOSListSurface(.more)
                } label: {
                    Image(systemName: "person.fill")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.primary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .tint(.primary)
                .accessibilityLabel("More")
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
            ContentUnavailableView {
                Label("No passages", systemImage: "text.book.closed")
            } description: {
                Text("No parsed references for this book in the active space.")
            }
        } else {
            List {
                ForEach(filteredScriptureReferenceRows) { row in
                    Button {
                        scriptureDrill = .passage(row.passage)
                    } label: {
                        CollectionFeedRow(
                            title: row.title,
                            noteCount: row.noteCount,
                            isPinned: false,
                            variant: .conversation
                        )
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    @ViewBuilder
    private var scriptureRootContent: some View {
        if !showDailyPassageRow && notesInActiveSpace.isEmpty {
            emptyNotesState
        } else if !showDailyPassageRow && scriptureBookRows.isEmpty {
            ContentUnavailableView {
                Label("No Scripture References", systemImage: "book.closed")
            } description: {
                Text("Add scripture references in your notes to build your index.")
            }
        } else if !showDailyPassageRow && !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredScriptureBookRows.isEmpty {
            ContentUnavailableView.search(text: activeSearchQuery)
        } else {
            scriptureFlatList
        }
    }

    private var emptyNotesState: some View {
        VStack(spacing: 12) {
            Image(systemName: "book.closed")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("Your notes will organize here")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var scriptureFlatList: some View {
        List {
            if showDailyPassageRow {
                DailyPassageCard { note in
                    iosNoteNavigationPath.append(note.id)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button {
                        votdPassageCardDismissedDay = VotdService.todayCalendarDayKey()
                    } label: {
                        Label("Dismiss", systemImage: "xmark.circle.fill")
                    }
                    .tint(.secondary)
                    .accessibilityLabel("Dismiss today's passage")
                }
            }
            ForEach(filteredScriptureBookRows) { row in
                Button {
                    scriptureDrill = .book(row.bookIndex)
                } label: {
                    CollectionFeedRow(
                        title: row.title,
                        noteCount: row.noteCount,
                        isPinned: false,
                        customSubtitle: row.bookListSubtitle,
                        variant: .conversation
                    )
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
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
