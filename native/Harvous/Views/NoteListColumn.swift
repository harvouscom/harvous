import SwiftUI
import SwiftData

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
    /// When set on iPhone home / Notes tab, drives `NavigationLink(value: UUID)` destinations from the ancestor stack.
    var iosNoteNavPath: Binding<[UUID]>?
    #endif
    /// When set on iOS, overrides `NoteFilter.displayName` for the navigation title (Notes tab).
    var navigationTitleOverride: String? = nil
    #if os(iOS)
    /// When set, ties `.searchable` presentation to external controls (bottom search pill).
    var searchPresentationBinding: Binding<Bool>? = nil
    #endif

    #if os(macOS)
    init(
        filter: NoteFilter = .all,
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .macOSSidebar,
        navigationTitleOverride: String? = nil,
        onNewNote: @escaping () -> Void = {}
    ) {
        self.filter = filter
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
        self.navigationTitleOverride = navigationTitleOverride
        self.onNewNote = onNewNote
    }
    #else
    init(
        filter: NoteFilter = .all,
        selectedNote: Binding<Note?>,
        externalSearchText: Binding<String>? = nil,
        columnStyle: NoteListColumnStyle = .iOSHomeFeed,
        navigationTitleOverride: String? = nil,
        searchPresentationBinding: Binding<Bool>? = nil,
        iosNoteNavPath: Binding<[UUID]>? = nil,
        onNewNote: @escaping () -> Void = {}
    ) {
        self.filter = filter
        _selectedNote = selectedNote
        self.externalSearchText = externalSearchText
        self.columnStyle = columnStyle
        self.navigationTitleOverride = navigationTitleOverride
        self.searchPresentationBinding = searchPresentationBinding
        self.iosNoteNavPath = iosNoteNavPath
        self.onNewNote = onNewNote
    }
    #endif

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var context
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var spaceStore: SpaceStore

    private var notesInActiveSpace: [Note] {
        let sid = spaceStore.activeSpaceUUID()
        let scoped = notes.filter { $0.resolvedSpaceId() == sid }
        // Recovery fallback: if active-space scope is empty but local notes exist,
        // surface all notes instead of presenting a false "No Notes" state.
        if scoped.isEmpty, !notes.isEmpty {
            return notes
        }
        return scoped
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
            return true
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
        case .collection(let selectedCollection):
            return notesInActiveSpace.filter { note in
                let normalized = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
                let collection = (normalized?.isEmpty == false) ? normalized : nil
                return collection == selectedCollection
            }
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

    private enum Metrics {
        /// Insets the selection pill from the sidebar edges (glass column).
        static let selectionHPadding: CGFloat = 8
        static let selectionVPadding: CGFloat = 2
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
            if columnStyle == .macOSSidebar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: onNewNote) {
                        Image(systemName: "square.and.pencil")
                    }
                    .help("New Note")
                }
            }
        }
        #endif
    }

    private var mainContent: some View {
        Group {
            if sortedFiltered.isEmpty && baseNotes.isEmpty {
                emptyState
            } else if sortedFiltered.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                noteList
            }
        }
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
                .padding(.horizontal, Metrics.selectionHPadding)
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

    private var noteList: some View {
        List {
            ForEach(sortedFiltered) { note in
                noteRowContent(for: note)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    @ViewBuilder
    private func noteRowContent(for note: Note) -> some View {
        #if os(iOS)
        if columnStyle == .iOSHomeFeed || columnStyle == .iOSTabNoteList {
            if let iosNoteNavPath {
                NavigationLink(value: note.id) {
                    NoteFeedRow(note: note, variant: .conversation)
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    noteRowDeleteSwipe(note: note, iosNavPath: iosNoteNavPath)
                }
            } else {
                NavigationLink {
                    StatefulNoteEditorView(note: note)
                } label: {
                    NoteFeedRow(note: note, variant: .conversation)
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    noteRowDeleteSwipe(note: note, iosNavPath: nil)
                }
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
            .listRowInsets(EdgeInsets(top: 5, leading: 10, bottom: 5, trailing: 10))
            .listRowBackground(noteSelectionBackground(isSelected: isSelected))
            .listRowSeparator(.hidden)
            .onTapGesture { selectedNote = note }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                noteRowDeleteSwipe(note: note, iosNavPath: nil)
            }
    }

    @ViewBuilder
    private func noteRowDeleteSwipe(note: Note, iosNavPath: Binding<[UUID]>?) -> some View {
        Button(role: .destructive) {
            let doomedId = note.id
            withAnimation {
                if selectedNote?.id == doomedId { selectedNote = nil }
                HarvousVaultExporter.removeMirrorFiles(for: note, modelContext: context)
                HarvousNoteSpotlightIndexer.removeNote(id: doomedId)
                context.delete(note)
                try? context.save()
            }
            guard let iosNavPath else { return }
            Task { @MainActor in
                iosNavPath.wrappedValue.removeAll { $0 == doomedId }
            }
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "note.text")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.tertiary)
            Text("No Notes")
                .font(HarvousTypography.body)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
            Text("Create your first note to get started.")
                .font(HarvousTypography.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
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
        .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
        .frame(width: 300, height: 600)
    #endif
}
