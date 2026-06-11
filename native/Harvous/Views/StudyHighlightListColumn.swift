import SwiftData
import SwiftUI

/// Library-style list of study highlights (`StudyThread`) with the same row chrome as notes/folders.
struct StudyHighlightListColumn: View {
    @Binding var selectedNote: Note?
    var externalSearchText: Binding<String>? = nil
    var columnStyle: NoteListColumnStyle
    #if os(iOS)
    var iosSelectedNoteId: Binding<UUID?>?
    #endif

    var ownsSidebarChrome: Bool = true

    #if os(macOS)
    init(
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .macOSSidebar,
        ownsSidebarChrome: Bool = true
    ) {
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
        self.ownsSidebarChrome = ownsSidebarChrome
    }
    #else
    init(
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .iOSTabNoteList,
        ownsSidebarChrome: Bool = true,
        iosSelectedNoteId: Binding<UUID?>? = nil
    ) {
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
        self.ownsSidebarChrome = ownsSidebarChrome
        self.iosSelectedNoteId = iosSelectedNoteId
    }
    #endif

    @Query(
        sort: [
            SortDescriptor(\StudyThread.createdAt, order: .reverse),
            SortDescriptor(\StudyThread.id, order: .forward),
        ]
    )
    private var studyThreads: [StudyThread]

    @Environment(\.modelContext) private var context
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @State private var sidebarSelectedThreadId: UUID?
    @State private var kindFilter: KindFilter = .all
    @State private var chipBarAvailableWidth: CGFloat = 300
    @Namespace private var kindChipNamespace
    @State private var pinnedThreadIds: [String] = []
    @State private var removeConfirmThread: StudyThread?

    private enum KindFilter: String, CaseIterable, Identifiable {
        case all, highlights, connected, scripture, references
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all:        return "All"
            case .highlights: return "Notes"
            case .connected:  return "Connected"
            case .scripture:  return "Scripture"
            case .references: return "References"
            }
        }
        var iconAsset: String? {
            switch self {
            case .all:        return nil
            case .highlights: return "Harvous.Note"
            case .connected:  return "Harvous.ArrowRightArrowLeft"
            case .scripture:  return "Harvous.BookOpen"
            case .references: return "Harvous.LinesLeaning"
            }
        }
        func matches(_ kind: StudyThread.EntryKind) -> Bool {
            switch self {
            case .all:        return true
            case .highlights: return kind == .workspace || kind == .miniNote
            case .connected:  return kind == .linkedNote
            case .scripture:  return kind == .scriptureLink
            case .references: return kind == .reference
            }
        }
    }

    private var searchText: String {
        externalSearchText?.wrappedValue ?? ""
    }

    #if os(iOS)
    private var iosNavigationTitle: String {
        switch columnStyle {
        case .iOSHomeFeed, .iOSTabNoteList:
            return ""
        case .macOSSidebar:
            return "Highlights"
        }
    }

    private var iosNavigationBarTitleDisplayMode: NavigationBarItem.TitleDisplayMode {
        .inline
    }
    #endif

    private var baseRows: [StudyThread] {
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

    private var filteredRows: [StudyThread] {
        let kindFiltered = kindFilter == .all
            ? baseRows
            : baseRows.filter { kindFilter.matches($0.entryKind) }
        let searched = StudyHighlightListIndex.filter(kindFiltered, query: searchText)
        return applyPinOrdering(searched)
    }

    private func applyPinOrdering(_ rows: [StudyThread]) -> [StudyThread] {
        guard !pinnedThreadIds.isEmpty else { return rows }
        let pinnedSet = Set(pinnedThreadIds)
        let rowById = Dictionary(uniqueKeysWithValues: rows.map { ($0.id.uuidString, $0) })
        let pinned = pinnedThreadIds.compactMap { rowById[$0] }
        let unpinned = rows.filter { !pinnedSet.contains($0.id.uuidString) }
        return pinned + unpinned
    }

    private func reloadPinnedThreads() {
        pinnedThreadIds = HarvousPinnedHighlightsStore.loadOrderedIds(spaceId: spaceStore.activeSpaceUUID())
    }

    private func togglePin(_ thread: StudyThread) {
        withAnimation {
            pinnedThreadIds = HarvousPinnedHighlightsStore.togglePin(
                rowId: thread.id.uuidString,
                spaceId: spaceStore.activeSpaceUUID()
            )
        }
    }

    private func deleteHighlightThread(_ thread: StudyThread) {
        let sid = spaceStore.activeSpaceUUID()
        let threadId = thread.id
        HarvousPinnedHighlightsStore.removePinId(threadId.uuidString, spaceId: sid)
        HarvousSyncingDelete.delete(thread: thread, context: context)
        try? context.saveWithLogging()
        if sidebarSelectedThreadId == threadId {
            sidebarSelectedThreadId = nil
        }
        reloadPinnedThreads()
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
    }

    private enum Metrics {
        static let selectionHPadding: CGFloat = 0
        static let selectionVPadding: CGFloat = 0
        static let sidebarRowHInset: CGFloat = HarvousFeedListLayout.sidebarRowContentHInset
        static let sidebarWindowBezelInsetLeading: CGFloat = 1
        static let sidebarWindowBezelInsetTop: CGFloat = 0
    }

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
        .onAppear {
            sidebarSelectedThreadId = nil
            reloadPinnedThreads()
        }
        .onChange(of: spaceStore.selectedSpaceId) { _, _ in
            reloadPinnedThreads()
        }
        .confirmationDialog(
            "Delete highlight?",
            isPresented: Binding(
                get: { removeConfirmThread != nil },
                set: { if !$0 { removeConfirmThread = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let thread = removeConfirmThread {
                Button("Delete highlight", role: .destructive) {
                    deleteHighlightThread(thread)
                    removeConfirmThread = nil
                }
                Button("Cancel", role: .cancel) { removeConfirmThread = nil }
            }
        } message: {
            Text("The highlight is removed from the source note. The note itself is kept.")
        }
        .onChange(of: selectedNote?.id) { _, newId in
            guard let tid = sidebarSelectedThreadId else { return }
            guard let th = studyThreads.first(where: { $0.id == tid }) else {
                sidebarSelectedThreadId = nil
                return
            }
            if StudyHighlightListIndex.isScripturePassageHighlight(th) {
                if appRouter.standaloneScriptureFocusedPassageHighlightId != tid {
                    sidebarSelectedThreadId = nil
                }
                return
            }
            if newId != th.parentNoteId {
                sidebarSelectedThreadId = nil
            }
        }
        .onChange(of: appRouter.standaloneScripturePassageDock?.id) { _, _ in
            guard appRouter.standaloneScripturePassageDock == nil else { return }
            sidebarSelectedThreadId = nil
        }
        .onChange(of: appRouter.standaloneScriptureFocusedPassageHighlightId) { _, newId in
            guard appRouter.standaloneScripturePassageDock != nil else { return }
            sidebarSelectedThreadId = newId
        }
    }

    private var mainContent: some View {
        VStack(spacing: 0) {
            kindChipBar
            Group {
                if filteredRows.isEmpty && baseRows.isEmpty {
                    emptyState
                } else if filteredRows.isEmpty {
                    HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noHighlightsMatch)
                } else {
                    highlightList
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var kindChipBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(KindFilter.allCases) { filter in
                    kindChipSegment(filter)
                }
            }
            .frame(minWidth: chipBarAvailableWidth - 2 * HarvousFeedListLayout.listRowHorizontalInset)
            .padding(3)
            .background(Capsule().fill(Color.primary.opacity(0.07)))
            .padding(.horizontal, HarvousFeedListLayout.listRowHorizontalInset)
            .padding(.vertical, 8)
        }
        .background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear { chipBarAvailableWidth = proxy.size.width }
                    .onChange(of: proxy.size.width) { _, w in chipBarAvailableWidth = w }
            }
        )
    }

    private func kindChipSegment(_ filter: KindFilter) -> some View {
        let isSelected = kindFilter == filter
        #if os(iOS)
        let iconPt: CGFloat = 14
        let labelFont: Font = HarvousFonts.font(size: 16, weight: 500, design: .default)
        let hStackSpacing: CGFloat = 6
        let hPad: CGFloat = 12
        let vPad: CGFloat = 8
        #else
        let iconPt: CGFloat = 10
        let labelFont: Font = HarvousFonts.font(size: 12, weight: 500, design: .default)
        let hStackSpacing: CGFloat = 4
        let hPad: CGFloat = 10
        let vPad: CGFloat = 5
        #endif
        return Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.82)) {
                kindFilter = filter
            }
        } label: {
            HStack(spacing: hStackSpacing) {
                if let asset = filter.iconAsset {
                    HarvousFAGlyph(assetName: asset, edgePt: iconPt)
                }
                Text(filter.label)
                    .font(labelFont)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .frame(maxWidth: .infinity)
            .foregroundStyle(isSelected ? Color.primary : Color.primary.opacity(0.5))
            .background {
                if isSelected {
                    Capsule()
                        #if os(macOS)
                        .fill(Color(NSColor.controlBackgroundColor))
                        #else
                        // Match macOS: raised white pill against the translucent track.
                        // `secondarySystemGroupedBackground` was too close to the track color.
                        .fill(Color(UIColor.systemBackground))
                        #endif
                        .shadow(color: .black.opacity(0.1), radius: 2, y: 1)
                        .matchedGeometryEffect(id: "highlightKindChip", in: kindChipNamespace)
                }
            }
        }
        .buttonStyle(.plain)
    }

    #if os(macOS)
    private func macOSSidebarChromeShape() -> UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: HarvousRadius.sidebarGlassLeading,
            bottomTrailingRadius: 0,
            topTrailingRadius: 0,
            style: .continuous
        )
    }

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

    private var highlightList: some View {
        List {
            ForEach(filteredRows) { thread in
                highlightRowContent(for: thread)
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
    private func macSelectNoteWithoutListAnimation(_ note: Note) {
        var txn = Transaction()
        txn.disablesAnimations = true
        withTransaction(txn) {
            selectedNote = note
        }
    }
    #endif

    @ViewBuilder
    private func highlightRowContent(for thread: StudyThread) -> some View {
        let parentTitle = parentTitle(for: thread)
        let subtitle = StudyHighlightListIndex.subtitlePreview(for: thread, parentNoteTitle: parentTitle)
        #if os(iOS)
        if columnStyle == .iOSHomeFeed || columnStyle == .iOSTabNoteList {
            if let iosSelectedNoteId {
                Button {
                    openHighlight(thread, iosSelectedNoteId: iosSelectedNoteId)
                } label: {
                    StudyHighlightFeedRow(
                        focusTitle: thread.focusTitle,
                        subtitle: subtitle,
                        updatedAt: StudyHighlightListIndex.highlightsFeedRecencyDate(thread),
                        variant: .conversation,
                        entryKind: thread.entryKind,
                        isPinned: pinnedThreadIds.contains(thread.id.uuidString)
                    )
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 4, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .modifier(HighlightRowActions(thread: thread, isPinned: pinnedThreadIds.contains(thread.id.uuidString), onTogglePin: { togglePin(thread) }, onRequestDelete: { removeConfirmThread = thread }))
            } else {
                Button {
                    openHighlightMacStyle(thread)
                } label: {
                    StudyHighlightFeedRow(
                        focusTitle: thread.focusTitle,
                        subtitle: subtitle,
                        updatedAt: StudyHighlightListIndex.highlightsFeedRecencyDate(thread),
                        variant: .conversation,
                        entryKind: thread.entryKind,
                        isPinned: pinnedThreadIds.contains(thread.id.uuidString)
                    )
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 4, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .modifier(HighlightRowActions(thread: thread, isPinned: pinnedThreadIds.contains(thread.id.uuidString), onTogglePin: { togglePin(thread) }, onRequestDelete: { removeConfirmThread = thread }))
            }
        } else {
            sidebarSelectableRow(thread: thread, subtitle: subtitle)
                .modifier(HighlightRowActions(thread: thread, isPinned: pinnedThreadIds.contains(thread.id.uuidString), onTogglePin: { togglePin(thread) }, onRequestDelete: { removeConfirmThread = thread }))
        }
        #else
        sidebarSelectableRow(thread: thread, subtitle: subtitle)
            .modifier(HighlightRowActions(thread: thread, isPinned: pinnedThreadIds.contains(thread.id.uuidString), onTogglePin: { togglePin(thread) }, onRequestDelete: { removeConfirmThread = thread }))
        #endif
    }

    private func parentTitle(for thread: StudyThread) -> String {
        if let t = thread.parentNote?.title { return t }
        if let n = ThreadStore.fetchNote(id: thread.parentNoteId, modelContext: context) { return n.title }
        return ""
    }

    /// Non-nil when `thread` qualifies for the Highlights-list standalone scripture dock (canonical ref + translation on disk).
    private func scripturePassageHighlightStandaloneQuery(for thread: StudyThread) -> (canon: String, trans: String)? {
        guard StudyHighlightListIndex.isScripturePassageHighlight(thread) else { return nil }
        let raw = thread.scriptureReference ?? ""
        let canon = ThreadStore.canonicalScriptureDisplay(fromReferenceRaw: raw)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !canon.isEmpty else { return nil }
        let trans = thread.scripturePassageTranslation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trans.isEmpty else { return nil }
        return (canon, trans)
    }

    private func openHighlightMacStyle(_ thread: StudyThread) {
        if let query = scripturePassageHighlightStandaloneQuery(for: thread) {
            var txn = Transaction()
            txn.disablesAnimations = true
            withTransaction(txn) {
                selectedNote = nil
                sidebarSelectedThreadId = thread.id
                appRouter.presentStandaloneScripturePassageDock(
                    canonicalReference: query.canon,
                    translationCode: query.trans,
                    focusedHighlightThreadId: thread.id
                )
            }
            return
        }
        guard let parent = ThreadStore.fetchNote(id: thread.parentNoteId, modelContext: context) else { return }
        var txn = Transaction()
        txn.disablesAnimations = true
        withTransaction(txn) {
            selectedNote = parent
            sidebarSelectedThreadId = thread.id
        }
        Task { @MainActor in
            appRouter.enqueueStudyHighlightListActivation(noteId: parent.id, threadId: thread.id)
        }
    }

    #if os(iOS)
    private func openHighlight(_ thread: StudyThread, iosSelectedNoteId: Binding<UUID?>) {
        if let query = scripturePassageHighlightStandaloneQuery(for: thread) {
            sidebarSelectedThreadId = thread.id
            appRouter.presentStandaloneScripturePassageDock(
                canonicalReference: query.canon,
                translationCode: query.trans,
                focusedHighlightThreadId: thread.id
            )
            return
        }
        guard let parent = ThreadStore.fetchNote(id: thread.parentNoteId, modelContext: context) else { return }
        sidebarSelectedThreadId = thread.id
        iosSelectedNoteId.wrappedValue = parent.id
        Task { @MainActor in
            appRouter.enqueueStudyHighlightListActivation(noteId: parent.id, threadId: thread.id)
        }
    }
    #endif

    private func sidebarSelectableRow(thread: StudyThread, subtitle: String) -> some View {
        let isAnchoredSidebarSelected =
            sidebarSelectedThreadId == thread.id && selectedNote?.id == thread.parentNoteId
        let standaloneFocusId = appRouter.standaloneScriptureFocusedPassageHighlightId
        let isStandalonePassageSelected =
            StudyHighlightListIndex.isScripturePassageHighlight(thread)
                && appRouter.standaloneScripturePassageDock != nil
                && standaloneFocusId == thread.id
        let isSelected = StudyHighlightListIndex.isScripturePassageHighlight(thread)
            ? isStandalonePassageSelected : isAnchoredSidebarSelected

        return StudyHighlightFeedRow(
            focusTitle: thread.focusTitle,
            subtitle: subtitle,
            updatedAt: StudyHighlightListIndex.highlightsFeedRecencyDate(thread),
            variant: .sidebarCompact,
            entryKind: thread.entryKind,
            isPinned: pinnedThreadIds.contains(thread.id.uuidString)
        )
        .padding(.horizontal, Metrics.sidebarRowHInset)
        .padding(.vertical, HarvousFeedListLayout.sidebarRowContentVInset)
        .background {
            if isSelected {
                selectionHighlightPill
                    .padding(.vertical, Metrics.selectionVPadding)
            }
        }
        .listRowInsets(
            EdgeInsets(
                top: HarvousFeedListLayout.sidebarListRowInsetVertical,
                leading: Metrics.selectionHPadding,
                bottom: HarvousFeedListLayout.sidebarListRowInsetVertical,
                trailing: Metrics.selectionHPadding
            )
        )
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        #if os(macOS)
        .contentShape(Rectangle())
        #endif
        .onTapGesture {
            openHighlightMacStyle(thread)
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

    private struct HighlightRowActions: ViewModifier {
        let thread: StudyThread
        let isPinned: Bool
        let onTogglePin: () -> Void
        let onRequestDelete: () -> Void

        func body(content: Content) -> some View {
            content
                .contextMenu {
                    Button {
                        onTogglePin()
                    } label: {
                        Label {
                            Text(isPinned ? "Unpin" : "Pin")
                        } icon: {
                            HarvousFAGlyph(
                                assetName: isPinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                                edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                            )
                        }
                    }
                    Button(role: .destructive) {
                        onRequestDelete()
                    } label: {
                        Label {
                            Text("Delete highlight")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                        }
                    }
                }
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        onTogglePin()
                    } label: {
                        Label {
                            Text(isPinned ? "Unpin" : "Pin")
                        } icon: {
                            HarvousFAGlyph(
                                assetName: isPinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                                edgePt: 14
                            )
                        }
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        onRequestDelete()
                    } label: {
                        Label {
                            Text("Delete")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 14)
                        }
                    }
                }
        }
    }

    private var emptyState: some View {
        HarvousEmptyStateView(
            iconAsset: "Harvous.Highlight",
            title: "No Highlights",
            description: "Selections and passage highlights from your notes appear here.",
            scale: .compact
        )
    }
}

#if os(iOS)
/// iPhone highlights hub — mirrors `HomeHubView` chrome; list uses bottom inline search.
struct HighlightsHubView: View {
    @Binding var iosSelectedNoteId: UUID?
    @EnvironmentObject private var appRouter: HarvousAppRouter

    var body: some View {
        StudyHighlightListColumn(
            selectedNote: .constant(nil),
            externalSearchText: $appRouter.iosInlineSearchText,
            columnStyle: .iOSTabNoteList,
            iosSelectedNoteId: $iosSelectedNoteId
        )
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
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
        .navigationBarTitleDisplayMode(.inline)
        .harvousIOSGlassOverCanvasShell()
    }
}
#endif
