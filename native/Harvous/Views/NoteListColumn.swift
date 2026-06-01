import SwiftUI
import SwiftData
#if os(iOS)
import UIKit
#endif

enum NoteListColumnStyle {
    case macOSSidebar
    /// iOS home hub: push navigation into editor + conversation-style rows.
    case iOSHomeFeed
    /// Same rows as home feed; used from the Notes tab with a visible navigation title.
    case iOSTabNoteList
}

/// The note list column — Apple Notes-style rows (mac sidebar) or iOS home feed.
struct NoteListColumn: View {
    var filter: NoteFilter = .all
    @Binding var selectedNote: Note?
    var externalSearchText: Binding<String>? = nil
    var columnStyle: NoteListColumnStyle
    /// Called when the user taps the compose button.
    /// On macOS: immediately creates a note in-place (Apple Notes style).
    /// On iOS: typically forwarded to `HarvousAppRouter.requestComposeNewNote()` from the FAB.
    var onNewNote: () -> Void = {}
    #if os(iOS)
    /// When set on iPhone home / Notes tab, drives note editor push from the ancestor stack.
    var iosSelectedNoteId: Binding<UUID?>?
    #endif
    /// When set on iOS, overrides `NoteFilter.displayName` for the navigation title (Notes tab).
    var navigationTitleOverride: String? = nil
    #if os(iOS)
    /// When set, ties `.searchable` presentation to external controls (bottom search pill).
    var searchPresentationBinding: Binding<Bool>? = nil
    #endif

    #if os(macOS)
    /// When `false`, the column skips its own glass/material sidebar chrome — the parent owns and applies it.
    var ownsSidebarChrome: Bool = true

    init(
        filter: NoteFilter = .all,
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .macOSSidebar,
        navigationTitleOverride: String? = nil,
        ownsSidebarChrome: Bool = true,
        onNewNote: @escaping () -> Void = {}
    ) {
        self.filter = filter
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
        self.navigationTitleOverride = navigationTitleOverride
        self.ownsSidebarChrome = ownsSidebarChrome
        self.onNewNote = onNewNote
    }
    #else
    /// No-op on iOS — iPad sidebar owns its own chrome.
    var ownsSidebarChrome: Bool = true

    init(
        filter: NoteFilter = .all,
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .iOSHomeFeed,
        navigationTitleOverride: String? = nil,
        ownsSidebarChrome: Bool = true,
        searchPresentationBinding: Binding<Bool>? = nil,
        iosSelectedNoteId: Binding<UUID?>? = nil,
        onNewNote: @escaping () -> Void = {}
    ) {
        self.filter = filter
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
        self.navigationTitleOverride = navigationTitleOverride
        self.ownsSidebarChrome = ownsSidebarChrome
        self.searchPresentationBinding = searchPresentationBinding
        self.iosSelectedNoteId = iosSelectedNoteId
        self.onNewNote = onNewNote
    }
    #endif

    @Query(sort: [
        SortDescriptor(\Note.updatedAt, order: .reverse),
        SortDescriptor(\Note.createdAt, order: .reverse),
    ]) private var notes: [Note]
    @Environment(\.modelContext) private var context
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter
    #if os(macOS)
    @EnvironmentObject private var macNoteListSelectionCoordinator: MacNoteListSelectionCoordinator
    #endif

    private var notesInActiveSpace: [Note] {
        HarvousNoteListVisibility.notesInActiveSpace(
            from: notes,
            spaceId: spaceStore.activeSpaceUUID()
        )
    }

    @State private var localSearchText = ""

    private var searchText: String {
        externalSearchText?.wrappedValue ?? localSearchText
    }

    private var searchBinding: Binding<String> {
        externalSearchText ?? $localSearchText
    }

    private var shouldAttachSearchable: Bool {
        #if os(iOS)
        switch columnStyle {
        case .iOSHomeFeed, .iOSTabNoteList:
            return false
        case .macOSSidebar:
            // Match macOS: when the parent owns the chrome (via `externalSearchText`) it also owns the
            // search field, so don't attach a second one (avoids the iPad-sidebar double search bug).
            return externalSearchText == nil
        }
        #else
        externalSearchText == nil
        #endif
    }

    #if os(iOS)
    private var iosNavigationTitle: String {
        switch columnStyle {
        case .iOSHomeFeed, .iOSTabNoteList:
            return ""
        case .macOSSidebar:
            return navigationTitleOverride ?? filter.displayName
        }
    }

    private var iosNavigationBarTitleDisplayMode: NavigationBarItem.TitleDisplayMode {
        switch columnStyle {
        case .iOSHomeFeed, .iOSTabNoteList, .macOSSidebar:
            return .inline
        }
    }
    #endif

    // MARK: - Filtered notes

    private var baseNotes: [Note] {
        switch filter {
        case .all:
            return notesInActiveSpace
        case .folder(let selectedFolderKey):
            return notesInActiveSpace.filter { $0.noteBelongsToFolderBucket(selectedFolderKey) }
        case .scriptureBook(let bookIndex):
            return notesInActiveSpace.filter { $0.noteBelongsToScriptureBook(bookIndex) }
        case .scripturePassage(let passage):
            return notesInActiveSpace.filter { $0.noteBelongsToScripturePassage(passage) }
        case .urlReference(let href):
            return notesInActiveSpace.filter { $0.noteBelongsToURLReference(href) }
        }
    }

    private var filtered: [Note] {
        NoteSearchIndex.filter(baseNotes, query: searchText)
    }

    /// Pinned notes float to the top; within each group the existing updatedAt order is preserved.
    private var sortedFiltered: [Note] {
        let pinned = filtered.filter { $0.isPinned }
        let unpinned = filtered.filter { !$0.isPinned }
        return pinned + unpinned
    }

    #if os(macOS)
    private func registerMacListNavigationHandlerIfNeeded() {
        guard columnStyle == .macOSSidebar else { return }
        macNoteListSelectionCoordinator.registerAdvanceHandler { delta in
            macAdvanceNoteSelection(delta: delta)
        }
    }

    private func macAdvanceNoteSelection(delta: Int) {
        let rows = sortedFiltered
        guard !rows.isEmpty else { return }
        var txn = Transaction()
        txn.disablesAnimations = true
        withTransaction(txn) {
            if let current = selectedNote,
               let idx = rows.firstIndex(where: { $0.id == current.id }) {
                let next = idx + delta
                guard rows.indices.contains(next) else { return }
                selectedNote = rows[next]
            } else {
                if delta > 0 {
                    selectedNote = rows.first
                } else if delta < 0 {
                    selectedNote = rows.last
                }
            }
        }
    }
    #endif

    private enum Metrics {
        /// Insets the selection pill from the sidebar edges (glass column).
        static let selectionHPadding: CGFloat = 0
        static let selectionVPadding: CGFloat = 0
        /// Horizontal content padding applied directly to the row (not via listRowInsets, so the
        /// .background modifier sees the full row width and can position the pill correctly).
        static let sidebarRowHInset: CGFloat = 10
        /// Vertical content padding that extends the pill height beyond NoteFeedRow's internal padding.
        static let sidebarRowVInset: CGFloat = 2
        /// Inset from window **leading** only so the darker vertical bezel shows; **top is 0** so glass runs flush under the unified title bar / traffic lights.
        static let sidebarWindowBezelInsetLeading: CGFloat = 1
        static let sidebarWindowBezelInsetTop: CGFloat = 0
    }

    // MARK: - Body

    var body: some View {
        Group {
            #if os(macOS)
            mainContent
                .background {
                    if ownsSidebarChrome {
                        GeometryReader { proxy in
                            let lead = Metrics.sidebarWindowBezelInsetLeading
                            let top = Metrics.sidebarWindowBezelInsetTop
                            let w = proxy.size.width
                            let h = proxy.size.height
                            macOSSidebarChromeBackground()
                                .frame(width: max(0, w - lead), height: max(0, h - top))
                                .padding(.top, top)
                                .padding(.leading, lead)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                .clipShape(macOSSidebarChromeShape())
                        }
                        .ignoresSafeArea()
                    }
                }
            #else
            Group { mainContent }
                .background(Color.clear)
            #endif
        }
        #if os(macOS)
        .toolbarBackground(.clear, for: .automatic)
        .modifier(HarvousSidebarTransparentWindowToolbar())
        .navigationTitle("")
        #else
        .navigationTitle(iosNavigationTitle)
        .navigationBarTitleDisplayMode(iosNavigationBarTitleDisplayMode)
        .harvousIOSGlassOverCanvasShell()
        #endif
        #if os(iOS)
        .modifier(
            NoteListSearchableModifier(
                enabled: shouldAttachSearchable,
                text: searchBinding,
                isPresented: searchPresentationBinding
            )
        )
        #endif
        #if os(macOS)
        .modifier(NoteListMacSearchableModifier(enabled: shouldAttachSearchable, text: searchBinding))
        #endif
        #if os(iOS)
        .toolbar {
            // Only own the compose toolbar item when the column owns its own chrome — when embedded
            // in `SidebarPanelView` (iPad), the sidebar parent owns compose and we'd otherwise duplicate.
            if columnStyle == .macOSSidebar, ownsSidebarChrome {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: onNewNote) {
                        HarvousFAGlyph(assetName: "Harvous.Pencil", edgePt: 16)
                    }
                    .help("New Note")
                }
            }
        }
        #endif
        #if os(macOS)
        .onAppear {
            registerMacListNavigationHandlerIfNeeded()
        }
        .onDisappear {
            if columnStyle == .macOSSidebar {
                macNoteListSelectionCoordinator.unregisterAdvanceHandler()
            }
        }
        #endif
    }

    private var mainContent: some View {
        // Single-pass evaluation: `baseNotes` walks the @Query, `NoteSearchIndex.filter` is O(n), and the
        // pinned/unpinned split is two passes. Computing them once per render (vs. up to four times via the
        // computed properties) keeps the list column off the back-button hit dispatch path during transitions.
        let base = baseNotes
        let filteredOnce = NoteSearchIndex.filter(base, query: searchText)
        var rows: [Note] = []
        rows.reserveCapacity(filteredOnce.count)
        for n in filteredOnce where n.isPinned { rows.append(n) }
        for n in filteredOnce where !n.isPinned { rows.append(n) }
        return Group {
            if rows.isEmpty && base.isEmpty {
                emptyState
            } else if rows.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                noteList(rows: rows)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - macOS sidebar chrome

    #if os(macOS)
    /// Leading bottom corner matches the window; **top leading stays square** so clipping doesn’t eat glass under the unified title bar / traffic lights.
    private func macOSSidebarChromeShape() -> UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: HarvousRadius.sidebarGlassLeading,
            bottomTrailingRadius: 0,
            topTrailingRadius: 0,
            style: .continuous
        )
    }

    /// Liquid Glass on Tahoe (macOS 26+); earlier releases use `Material` so the column still blurs wallpaper.
    @ViewBuilder
    private func macOSSidebarChromeBackground() -> some View {
        let shape = macOSSidebarChromeShape()
        if #available(macOS 26.0, *) {
            shape
                .fill(Color.clear)
                .glassEffect(in: shape)
        } else {
            shape
                .fill(.ultraThinMaterial)
        }
    }
    #endif

    // MARK: - Note list

    @ViewBuilder
    private func noteSelectionBackground(isSelected: Bool) -> some View {
        if isSelected {
            selectionHighlightPill
                .padding(.vertical, Metrics.selectionVPadding)
        } else {
            Color.clear
        }
    }

    @ViewBuilder
    private var selectionHighlightPill: some View {
        #if os(macOS)
        if #available(macOS 26.0, *) {
            RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                .fill(Color.clear)
                .glassEffect(in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
                .overlay {
                    if colorScheme == .dark {
                        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                            .fill(Color.white.opacity(0.07))
                    }
                }
        } else {
            RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                .fill(.thinMaterial)
                .overlay {
                    if colorScheme == .dark {
                        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                            .fill(Color.white.opacity(0.06))
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                        .strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.06 : 0.08), lineWidth: 0.5)
                }
        }
        #else
        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 0.5)
            }
        #endif
    }

    private func noteList(rows: [Note]) -> some View {
        List {
            ForEach(rows) { note in
                noteRowContent(for: note)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        #if os(iOS)
        .modifier(IPadAwareListBottomChromeReserve(skip: isIPadSplitLayout))
        #elseif os(macOS)
        .modifier(MacOSSidebarDailyPassagePillListReserve(enabled: columnStyle == .macOSSidebar))
        #endif
    }

    #if os(macOS)
    /// Avoids SwiftUI list row accent painting (blue system selection) while keeping animations off for split/toolbar layout.
    private func macSelectNoteWithoutListAnimation(_ note: Note) {
        var txn = Transaction()
        txn.disablesAnimations = true
        withTransaction(txn) {
            selectedNote = note
        }
    }
    #endif

    @ViewBuilder
    private func noteRowContent(for note: Note) -> some View {
        #if os(iOS)
        if columnStyle == .iOSHomeFeed || columnStyle == .iOSTabNoteList {
            if let iosSelectedNoteId {
                Button {
                    iosSelectedNoteId.wrappedValue = note.id
                } label: {
                    NoteFeedRow(note: note, variant: .conversation)
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    noteRowTogglePinSwipe(note: note)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    noteRowDeleteSwipe(note: note, iosSelectedNoteId: iosSelectedNoteId)
                }
                .listRowInsets(EdgeInsets(top: 4, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 4, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } else {
                NavigationLink {
                    StatefulNoteEditorView(note: note)
                } label: {
                    NoteFeedRow(note: note, variant: .conversation)
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    noteRowTogglePinSwipe(note: note)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    noteRowDeleteSwipe(note: note, iosSelectedNoteId: nil)
                }
                .listRowInsets(EdgeInsets(top: 4, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 4, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        } else {
            sidebarSelectableRow(for: note)
        }
        #else
        sidebarSelectableRow(for: note)
        #endif
    }

    private func sidebarSelectableRow(for note: Note) -> some View {
        let isSelected = selectedNote?.id == note.id
        return NoteFeedRow(note: note, variant: .sidebarCompact)
            .padding(.horizontal, Metrics.sidebarRowHInset)
            .padding(.vertical, Metrics.sidebarRowVInset)
            .background {
                if isSelected {
                    selectionHighlightPill
                        .padding(.vertical, Metrics.selectionVPadding)
                }
            }
            .listRowInsets(EdgeInsets(top: 4, leading: Metrics.selectionHPadding, bottom: 4, trailing: Metrics.selectionHPadding))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            #if os(macOS)
            .contentShape(Rectangle())
            #endif
            .onTapGesture {
                #if os(macOS)
                macSelectNoteWithoutListAnimation(note)
                #else
                selectedNote = note
                #endif
            }
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                noteRowTogglePinSwipe(note: note)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                noteRowDeleteSwipe(note: note, iosSelectedNoteId: nil)
            }
    }

    @ViewBuilder
    private func noteRowDeleteSwipe(note: Note, iosSelectedNoteId: Binding<UUID?>?) -> some View {
        Button(role: .destructive) {
            let doomedId = note.id
            withAnimation {
                if selectedNote?.id == doomedId { selectedNote = nil }
                HarvousVaultExporter.removeMirrorFiles(for: note, modelContext: context)
                HarvousNoteSpotlightIndexer.removeNote(id: doomedId)
                ThreadStore.purgeLinkedNoteMarkers(referencingDeletedNote: doomedId, modelContext: context)
                HarvousSyncingDelete.delete(note: note, context: context)
                try? context.save()
            }
            guard let iosSelectedNoteId else { return }
            Task { @MainActor in
                if iosSelectedNoteId.wrappedValue == doomedId {
                    iosSelectedNoteId.wrappedValue = nil
                }
            }
        } label: {
            Label {
                Text("Delete")
            } icon: {
                HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 14)
            }
        }
#if os(iOS)
        // Same as trailing `NavigationStack.tint(.harvousAccent)` washing out swipe chrome — force system destructive red.
        .tint(Color(uiColor: .systemRed))
#endif
    }

    /// Leading swipe — same persistence as `NoteMoreToolbarMenu` pin in `NoteTopBar`.
    @ViewBuilder
    private func noteRowTogglePinSwipe(note: Note) -> some View {
        Button {
            withAnimation {
                note.isPinned.toggle()
                note.markDirtyMetadata()
                try? context.saveWithLogging()
            }
            HarvousNoteSpotlightIndexer.reindex(note: note)
            HarvousVaultExporter.scheduleWrite(note: note, modelContext: context)
        } label: {
            Label {
                Text(note.isPinned ? "Unpin" : "Pin")
            } icon: {
                HarvousFAGlyph(
                    assetName: note.isPinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                    edgePt: 14
                )
            }
        }
        .tint(.orange)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        HarvousEmptyStateView(
            iconAsset: "Harvous.Note",
            title: "No Notes",
            description: "Create your first note to get started.",
            scale: .compact
        )
    }
}

#if os(iOS)
private struct NoteListSearchableModifier: ViewModifier {
    let enabled: Bool
    @Binding var text: String
    var isPresented: Binding<Bool>?

    func body(content: Content) -> some View {
        if enabled {
            Group {
                if let isPresented {
                    content
                        .searchable(text: $text, isPresented: isPresented, prompt: "Search")
                        .autocorrectionDisabled(true)
                        .textInputAutocapitalization(.never)
                } else {
                    content
                        .searchable(text: $text, prompt: "Search")
                        .autocorrectionDisabled(true)
                        .textInputAutocapitalization(.never)
                }
            }
        } else {
            content
        }
    }
}
#endif

#if os(macOS)
private struct NoteListMacSearchableModifier: ViewModifier {
    let enabled: Bool
    @Binding var text: String

    func body(content: Content) -> some View {
        if enabled {
            content.searchable(text: $text, placement: .sidebar, prompt: "Search")
        } else {
            content
        }
    }
}
#endif

#if os(macOS)
/// Hides the default window toolbar backdrop so sidebar glass reads continuously under the traffic lights (macOS 15+).
struct HarvousSidebarTransparentWindowToolbar: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) {
            content.toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
        } else {
            content
        }
    }
}
#endif

#Preview {
    #if os(iOS)
    NavigationStack {
        NoteListColumn(selectedNote: .constant(nil))
            .environmentObject(SpaceStore())
            .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    }
    .frame(width: 400, height: 700)
    #else
    NoteListColumn(selectedNote: .constant(nil))
        .environmentObject(SpaceStore())
        .environmentObject(MacNoteListSelectionCoordinator())
        .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
        .frame(width: 300, height: 600)
    #endif
}
