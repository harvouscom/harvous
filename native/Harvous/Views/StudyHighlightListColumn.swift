import SwiftData
import SwiftUI

/// Library-style list of study highlights (`StudyThread`) with the same row chrome as notes/folders.
struct StudyHighlightListColumn: View {
    @Binding var selectedNote: Note?
    var externalSearchText: Binding<String>? = nil
    var columnStyle: NoteListColumnStyle
    #if os(iOS)
    var iosNoteNavPath: Binding<[UUID]>?
    #endif

    #if os(macOS)
    init(
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .macOSSidebar
    ) {
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
    }
    #else
    init(
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .iOSTabNoteList,
        iosNoteNavPath: Binding<[UUID]>? = nil
    ) {
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
        self.iosNoteNavPath = iosNoteNavPath
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
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var votdPassageCardDismissedDay: String = ""

    @State private var sidebarSelectedThreadId: UUID?

    private var searchText: String {
        externalSearchText?.wrappedValue ?? ""
    }

    private var showDailyPassageRow: Bool {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && votdPassageCardDismissedDay != VotdService.todayCalendarDayKey()
    }

    private var dailyPassageListRowInsets: EdgeInsets {
        #if os(macOS)
        EdgeInsets(top: 8, leading: 0, bottom: 4, trailing: 0)
        #else
        EdgeInsets(top: 8, leading: 14, bottom: 4, trailing: 14)
        #endif
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
        StudyHighlightListIndex.filter(baseRows, query: searchText)
    }

    private enum Metrics {
        static let selectionHPadding: CGFloat = 0
        static let selectionVPadding: CGFloat = 0
        static let sidebarRowHInset: CGFloat = 10
        static let sidebarRowVInset: CGFloat = 2
        static let sidebarWindowBezelInsetLeading: CGFloat = 1
        static let sidebarWindowBezelInsetTop: CGFloat = 0
    }

    var body: some View {
        Group {
            #if os(macOS)
            mainContent
                .background {
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
            #else
            Group { mainContent }
                .background(Color(.systemGroupedBackground))
            #endif
        }
        #if os(macOS)
        .toolbarBackground(.clear, for: .automatic)
        .modifier(HarvousSidebarTransparentWindowToolbar())
        .navigationTitle("")
        #else
        .navigationTitle(iosNavigationTitle)
        .navigationBarTitleDisplayMode(iosNavigationBarTitleDisplayMode)
        #endif
        .onAppear {
            sidebarSelectedThreadId = nil
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
        Group {
            if !showDailyPassageRow && filteredRows.isEmpty && baseRows.isEmpty {
                emptyState
            } else if !showDailyPassageRow && filteredRows.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                highlightList
            }
        }
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
            if showDailyPassageRow {
                DailyPassageCard { note in
                    #if os(iOS)
                    if let iosNoteNavPath {
                        iosNoteNavPath.wrappedValue.append(note.id)
                    }
                    #else
                    macSelectNoteWithoutListAnimation(note)
                    #endif
                }
                .listRowInsets(dailyPassageListRowInsets)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button {
                        votdPassageCardDismissedDay = VotdService.todayCalendarDayKey()
                    } label: {
                        Label {
                            Text("Dismiss")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 16)
                        }
                    }
                    .tint(.secondary)
                    .accessibilityLabel("Dismiss today's passage")
                }
            }
            ForEach(filteredRows) { thread in
                highlightRowContent(for: thread)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
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
            if let iosNoteNavPath {
                Button {
                    openHighlight(thread, iosNavPath: iosNoteNavPath)
                } label: {
                    StudyHighlightFeedRow(
                        focusTitle: thread.focusTitle,
                        subtitle: subtitle,
                        updatedAt: StudyHighlightListIndex.highlightsFeedRecencyDate(thread),
                        variant: .conversation
                    )
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } else {
                // Unlikely: no path — open parent if resolvable.
                Button {
                    openHighlightMacStyle(thread)
                } label: {
                    StudyHighlightFeedRow(
                        focusTitle: thread.focusTitle,
                        subtitle: subtitle,
                        updatedAt: StudyHighlightListIndex.highlightsFeedRecencyDate(thread),
                        variant: .conversation
                    )
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        } else {
            sidebarSelectableRow(thread: thread, subtitle: subtitle)
        }
        #else
        sidebarSelectableRow(thread: thread, subtitle: subtitle)
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
        DispatchQueue.main.async {
            appRouter.enqueueStudyHighlightListActivation(noteId: parent.id, threadId: thread.id)
        }
    }

    #if os(iOS)
    private func openHighlight(_ thread: StudyThread, iosNavPath: Binding<[UUID]>) {
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
        iosNavPath.wrappedValue.append(parent.id)
        DispatchQueue.main.async {
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
            variant: .sidebarCompact
        )
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

    private var emptyState: some View {
        VStack(spacing: 8) {
            HarvousFAGlyph(assetName: "Harvous.Highlight", edgePt: 16)
                .foregroundStyle(.tertiary)
            Text("No Highlights")
                .font(HarvousTypography.body)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
            Text("Selections and passage highlights from your notes appear here.")
                .font(HarvousTypography.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

#if os(iOS)
/// iPhone highlights hub — mirrors `HomeHubView` chrome; list uses bottom inline search.
struct HighlightsHubView: View {
    @Binding var iosNoteNavigationPath: [UUID]
    @EnvironmentObject private var appRouter: HarvousAppRouter

    var body: some View {
        StudyHighlightListColumn(
            selectedNote: .constant(nil),
            externalSearchText: $appRouter.iosInlineSearchText,
            columnStyle: .iOSTabNoteList,
            iosNoteNavPath: $iosNoteNavigationPath
        )
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appRouter.selectIOSListSurface(.more)
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.UserFilled", edgePt: 17)
                        .foregroundStyle(.primary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .tint(.primary)
                .accessibilityLabel("More")
            }
        }
    }
}
#endif
