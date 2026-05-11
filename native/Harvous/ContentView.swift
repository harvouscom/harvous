import SwiftUI
import SwiftData
#if os(iOS)
import UIKit
import UniformTypeIdentifiers
#elseif os(macOS)
import AppKit
import UniformTypeIdentifiers
#endif

struct ContentView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif

    var body: some View {
        Group {
            #if os(macOS)
            MacRootView()
            #else
            iOSRootView()
            #endif
        }
        .accessibilityIdentifier(HarvousAccessibilityID.rootContent)
        .environment(\.harvousScriptureTheme, spaceStore.scriptureTheme)
        .task {
            spaceStore.bootstrapIfNeeded(modelContext: modelContext)
            _ = spaceStore.consumePendingJoinToken(modelContext: modelContext)
            NoteSimpleIDAssigner.backfillAllIfNeeded(in: modelContext)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .inactive || phase == .background else { return }
            HarvousVaultExportCoordinator.shared.flush(modelContext: modelContext)
            HarvousVaultInboxScanner.scanIfNeeded(modelContext: modelContext, activeSpaceId: spaceStore.activeSpaceUUID())
        }
        .onOpenURL { url in
            SpaceStore.queueJoinTokenFromURL(url)
            HarvousPendingRoute.applyURL(url)
            spaceStore.bootstrapIfNeeded(modelContext: modelContext)
            _ = spaceStore.consumePendingJoinToken(modelContext: modelContext)
            #if os(iOS)
            appRouter.applyPendingDeepLink()
            #endif
        }
        #if os(macOS)
        .onReceive(NotificationCenter.default.publisher(for: .harvousOpenMacPreferences)) { _ in
            openWindow(id: HarvousMacPreferencesWindow.sceneID)
        }
        #endif
    }
}

// MARK: - macOS: Sidebar + editor

#if os(macOS)
struct MacRootView: View {
    @State private var selectedNote: Note?
    @State private var lastSelectedNote: Note?
    @State private var splitColumnVisibility: NavigationSplitViewVisibility = .all
    @State private var showSearch = false
    @State private var showInspector = false
    @State private var threadNavPath = NavigationPath()
    @State private var importSummaryPayload: HarvousVaultImportSummaryPayload?
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var macNoteListSelectionCoordinator: MacNoteListSelectionCoordinator
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        macRootChrome
    }

    /// Suppresses the slide animation when expanding the sidebar (.detailOnly → anything else).
    ///
    /// With `.windowToolbarStyle(.unified)`, AppKit re-checks overflow on every animation tick; during expand interpolation it can flash the "more" chevron even when final widths fit. Committing the expand in one transaction gives a single layout pass at final widths. Collapse (→ .detailOnly) keeps default animation.
    private var animatedSplitVisibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { splitColumnVisibility },
            set: { newValue in
                if splitColumnVisibility == .detailOnly && newValue != .detailOnly {
                    var tx = Transaction()
                    tx.disablesAnimations = true
                    withTransaction(tx) { splitColumnVisibility = newValue }
                } else {
                    splitColumnVisibility = newValue
                }
            }
        )
    }

    private var macNavigationSplit: some View {
        NavigationSplitView(columnVisibility: animatedSplitVisibility) {
            SidebarPanelView(
                selectedNote: $selectedNote,
                splitColumnVisibility: animatedSplitVisibility,
                onCreateNewNote: createNewNote
            )
                .navigationSplitViewColumnWidth(min: 230, ideal: 260, max: 300)
        } detail: {
            NavigationStack(path: $threadNavPath) {
                ZStack {
                    NoteEditorView(
                        note: $selectedNote,
                        onNavigateToLinkedNotes: { threadNavPath.append($0) },
                        showInspector: $showInspector as Binding<Bool>
                    )
                    if selectedNote == nil, let dock = appRouter.standaloneScripturePassageDock {
                        StandaloneScripturePassageDockHost(
                            presentation: dock,
                            scriptureTheme: spaceStore.scriptureTheme,
                            onDismiss: { appRouter.dismissStandaloneScripturePassageDock() }
                        )
                        .transition(.opacity)
                    }
                }
                    .toolbar(removing: .sidebarToggle)
                    .toolbar {
                        // Sidebar scope uses `.automatic` so these stay paired; keep Show sidebar (.detailOnly)
                        // and Compose as separate toolbar items—otherwise AppKit nests them in one cluster.
                        if splitColumnVisibility == .detailOnly {
                            ToolbarItem(placement: .navigation) {
                                Button {
                                    animatedSplitVisibility.wrappedValue = .all
                                } label: {
                                    Label {
                                        Text("Show sidebar")
                                    } icon: {
                                        HarvousFAGlyph(
                                            assetName: "Harvous.LayoutSidebarRight",
                                            edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                                        )
                                        .frame(
                                            width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                                            height: HarvousFAIconMetrics.catalogGlyphBoxPt
                                        )
                                    }
                                }
                                .labelStyle(.iconOnly)
                                .buttonStyle(.bordered)
                                .help("Show sidebar")
                                .accessibilityLabel("Show sidebar")
                            }
                        }

                        ToolbarItem(placement: .navigation) {
                            Button(action: createNewNote) {
                                HarvousFAGlyph(assetName: "Harvous.Pencil")
                                    .fixedSize(horizontal: true, vertical: true)
                            }
                            .buttonStyle(.bordered)
                            .help("New Note (⌘N)")
                        }

                        if #available(macOS 26, *) { ToolbarSpacer(.fixed) }

                        ToolbarItem(placement: .cancellationAction) {
                            if let note = selectedNote {
                                NoteFolderChip(
                                    note: note,
                                    isFolderContextUpdating: false,
                                    showFolderToolbarText: true,
                                    scriptureTheme: spaceStore.scriptureTheme
                                )
                            }
                        }

                        // Flexible spacer absorbs extra width between the folder chip and the
                        // share/more group. Two fixed spacers before share/more match the
                        // perceived leading inset of the trailing `confirmationAction` cluster
                        // (`.primaryAction` sits in a tighter column than the trailing slot).
                        if #available(macOS 26, *) { ToolbarSpacer(.flexible) }
                        if #available(macOS 26, *) { ToolbarSpacer(.fixed) }
                        if #available(macOS 26, *) { ToolbarSpacer(.fixed) }

                        if let note = selectedNote {
                            MacNoteShareMoreToolbar(
                                note: note,
                                scriptureTheme: spaceStore.scriptureTheme,
                                onDeleteConfirmed: {
                                    let nid = note.id
                                    HarvousVaultExporter.removeMirrorFiles(for: note, modelContext: context)
                                    HarvousNoteSpotlightIndexer.removeNote(id: nid)
                                    selectedNote = nil
                                    context.delete(note)
                                    try? context.saveWithLogging()
                                }
                            )
                        }

                        if #available(macOS 26, *) { ToolbarSpacer(.fixed) }

                        ToolbarItemGroup(placement: .confirmationAction) {
                            Button {
                                showInspector.toggle()
                            } label: {
                                if showInspector {
                                    Label {
                                        Text("Hide note details")
                                    } icon: {
                                        HarvousFAGlyph(
                                            assetName: "Harvous.LayoutSidebarLeft",
                                            edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                                        )
                                        .frame(
                                            width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                                            height: HarvousFAIconMetrics.catalogGlyphBoxPt
                                        )
                                    }
                                } else {
                                    Label {
                                        Text("Note details")
                                    } icon: {
                                        HarvousFAGlyph(
                                            assetName: "Harvous.LayoutSidebarRight",
                                            edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                                        )
                                        .frame(
                                            width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                                            height: HarvousFAIconMetrics.catalogGlyphBoxPt
                                        )
                                    }
                                }
                            }
                            .labelStyle(.iconOnly)
                            .buttonStyle(.bordered)
                            .help(showInspector ? "Hide note details" : "Show note details")
                            .disabled(selectedNote == nil)

                            HarvousMacProfileToolbarMenu()
                        }
                    }
                    .navigationDestination(for: UUID.self) { threadID in
                        LinkedNotesView(linkedNoteMarkerId: threadID)
                    }
            }
        }
    }

    private var macSplitStyled: some View {
        macNavigationSplit
            .navigationSplitViewStyle(.balanced)
            // The .inspector modifier's built-in animation propagates up into the NSSplitView
            // backing NavigationSplitView, causing the sidebar divider to slide when the
            // inspector opens. Committing the layout in a single pass (same pattern as
            // animatedSplitVisibility) stops the brief leftward drift.
            .transaction(value: showInspector) { $0.disablesAnimations = true }
            // Note switches: suppress implicit animations so unified toolbar/split/layout don’t
            // interpolate every frame against a new TextKit document (hang + overflow flicker risk).
            .transaction(value: selectedNote?.id) { $0.disablesAnimations = true }
            .onChange(of: selectedNote?.id) { _, _ in
                if selectedNote != nil {
                    appRouter.dismissStandaloneScripturePassageDock()
                }
            }
    }

    private var macWithBaseFocusedValues: some View {
        macSplitStyled
            .focusedSceneValue(\.newNoteAction, createNewNote)
            .focusedSceneValue(\.showSearchAction, { showSearch = true })
            .focusedSceneValue(\.dailyNoteAction, openDailyNote)
            .focusedSceneValue(\.randomRevisitAction, openRandomNote)
            .focusedSceneValue(\.insertWikiLinkAction, {
                NotificationCenter.default.post(name: .harvousRequestInsertWikiLink, object: nil)
            })
    }

    private var macWithInspectorAndListFocus: some View {
        macWithBaseFocusedValues
            .focusedSceneValue(
                \.toggleInspectorAction,
                selectedNote == nil
                    ? nil
                    : {
                        showInspector.toggle()
                    }
            )
            .focusedSceneValue(\.focusNoteListAction, { selectedNote = nil })
            .focusedSceneValue(\.nextNoteAction) { macNoteListSelectionCoordinator.nextNote() }
            .focusedSceneValue(\.previousNoteAction) { macNoteListSelectionCoordinator.previousNote() }
    }

    private var macRootChrome: some View {
        macWithInspectorAndListFocus
            .onChange(of: selectedNote?.id) { _, _ in
                threadNavPath = NavigationPath()
                let newNote = selectedNote
                let previous = lastSelectedNote
                Task { @MainActor in
                    if let prev = previous,
                       prev.id != newNote?.id,
                       prev.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                       prev.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        let pid = prev.id
                        HarvousVaultExporter.removeMirrorFiles(for: prev, modelContext: context)
                        HarvousNoteSpotlightIndexer.removeNote(id: pid)
                        context.delete(prev)
                        try? context.saveWithLogging()
                    }
                    lastSelectedNote = newNote
                }
            }
            .overlay {
                if showSearch {
                    SpotlightSearchView(isPresented: $showSearch, selectedNote: $selectedNote)
                        .ignoresSafeArea()
                }
            }
            .onOpenURL { url in
                SpaceStore.queueJoinTokenFromURL(url)
                HarvousPendingRoute.applyURL(url)
                spaceStore.bootstrapIfNeeded(modelContext: context)
                _ = spaceStore.consumePendingJoinToken(modelContext: context)
                applyMacDeepLink()
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousRequestOpenNoteId)) { n in
                guard let raw = n.userInfo?[HarvousOpenNoteIdPayload.idKey] as? String,
                      let id = UUID(uuidString: raw) else { return }
                let target = id
                let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == target })
                if let found = try? context.fetch(fd).first {
                    selectedNote = found
                }
            }
            .onDrop(of: [.fileURL], isTargeted: .constant(false)) { providers in
                HarvousVaultDropImport.handle(providers: providers, spaceId: spaceStore.activeSpaceUUID(), modelContext: context)
                return true
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousVaultImportSummary)) { note in
                importSummaryPayload = note.object as? HarvousVaultImportSummaryPayload
            }
            .onAppear {
                HarvousMacSidebarSearchFieldGlyph.scheduleBrandMagnifyingGlassPatch()
            }
            .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
                HarvousMacSidebarSearchFieldGlyph.scheduleBrandMagnifyingGlassPatch()
            }
            .alert(
                "Import finished",
                isPresented: Binding(
                    get: { importSummaryPayload != nil },
                    set: { if !$0 { importSummaryPayload = nil } }
                )
            ) {
                Button("OK", role: .cancel) { importSummaryPayload = nil }
            } message: {
                if let p = importSummaryPayload {
                    Text(macImportSummaryMessage(p))
                }
            }
    }

    private func macImportSummaryMessage(_ p: HarvousVaultImportSummaryPayload) -> String {
        var s = p.report.summaryLine
        if let u = p.logFileURL {
            s += "\n\nLog file:\n\(u.path)"
        }
        if !p.report.skipped.isEmpty {
            let lines = p.report.skipped.prefix(8).map { "\($0.url.lastPathComponent): \($0.reason)" }
            s += "\n\nSkipped (\(p.report.skipped.count)):\n" + lines.joined(separator: "\n")
        }
        return s
    }

    private func applyMacDeepLink() {
        guard let route = HarvousPendingRoute.take() else { return }
        if route == "you" || HarvousSettingsPathParser.opensSettingsUI(route) {
            appRouter.macSettingsDeepLink = HarvousSettingsPathParser.detail(fromFullPath: route)
            openWindow(id: HarvousMacPreferencesWindow.sceneID)
            return
        }
        switch route {
        case "compose":
            createNewNote()
        case "search":
            showSearch = true
        default:
            if route.hasPrefix("note/"),
               let uuidStr = route.split(separator: "/").dropFirst().first,
               let id = UUID(uuidString: String(uuidStr)) {
                NotificationCenter.default.post(
                    name: .harvousRequestOpenNoteId,
                    object: nil,
                    userInfo: [HarvousOpenNoteIdPayload.idKey: id.uuidString]
                )
            }
        }
    }

    private func createNewNote() {
        let note = Note(spaceId: spaceStore.activeSpaceUUID())
        context.insert(note)
        NoteSimpleIDAssigner.assignIfMissing(note, in: context)
        try? context.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: context)
        selectedNote = note
    }

    private func openDailyNote() {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone.current
        df.dateFormat = "yyyy-MM-dd"
        let key = df.string(from: Date())
        let sid = spaceStore.activeSpaceUUID()
        let all = (try? context.fetch(FetchDescriptor<Note>())) ?? []
        if let hit = all.first(where: { $0.resolvedSpaceId() == sid && $0.title == key }) {
            selectedNote = hit
            return
        }
        let note = Note(title: key, body: "", spaceId: sid)
        context.insert(note)
        NoteSimpleIDAssigner.assignIfMissing(note, in: context)
        try? context.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: context)
        selectedNote = note
    }

    private func openRandomNote() {
        let sid = spaceStore.activeSpaceUUID()
        let all = (try? context.fetch(FetchDescriptor<Note>())) ?? []
        let pool = all.filter { $0.resolvedSpaceId() == sid }
        guard let pick = pool.randomElement() else { return }
        selectedNote = pick
    }
}

// MARK: - Profile / account (macOS toolbar, Apple-style)

/// Trailing toolbar control: person icon tinted by profile color, menu for Settings and web account (like Mail / TV).
private struct HarvousMacProfileToolbarMenu: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openURL) private var openURL
    @Environment(\.colorScheme) private var colorScheme

    @AppStorage(HarvousSettingsStorageKeys.firstName) private var firstName = ""
    @AppStorage(HarvousSettingsStorageKeys.lastName) private var lastName = ""
    @AppStorage(HarvousSettingsStorageKeys.avatarColor) private var avatarColorRaw = HarvousAvatarColorToken.blue.rawValue

    private var hasName: Bool {
        !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var menuTitle: String {
        let f = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let l = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !f.isEmpty else { return l }
        guard !l.isEmpty else { return f }
        return "\(f) \(String(l.prefix(1)))"
    }

    private var avatarFill: Color {
        let token = HarvousAvatarColorToken(rawValue: avatarColorRaw) ?? .blue
        switch token {
        case .paper:
            return colorScheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.07)
        default:
            return Color.thread(avatarColorRaw) ?? Color.harvousAccent.opacity(0.35)
        }
    }

    /// Foreground for the toolbar person glyph (follows profile avatar color; readable on pastel disk).
    private var iconTint: Color {
        let token = HarvousAvatarColorToken(rawValue: avatarColorRaw) ?? .blue
        switch token {
        case .paper:
            return colorScheme == .dark ? Color.white.opacity(0.55) : Color.primary.opacity(0.55)
        default:
            return Color.threadGlyph(avatarColorRaw) ?? Color.harvousAccent
        }
    }

    var body: some View {
        Menu {
            if hasName {
                Text(menuTitle)
                    .font(.system(size: 15, weight: .semibold, design: .default))
                Text("On this Mac")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
                Divider()
            }

            Button {
                openWindow(id: HarvousMacPreferencesWindow.sceneID)
            } label: {
                Label {
                    Text("Settings…")
                } icon: {
                    HarvousFAGlyph(assetName: "Harvous.Gear", edgePt: 14)
                }
            }

            Button {
                appRouter.macSettingsDeepLink = .editProfile
                openWindow(id: HarvousMacPreferencesWindow.sceneID)
            } label: {
                Label {
                    Text("Name…")
                } icon: {
                    HarvousFAGlyph(assetName: "Harvous.UserFilled", edgePt: 14)
                }
            }

            Divider()

            Button {
                openURL(URL(string: "https://app.harvous.com/profile")!)
            } label: {
                Label {
                    Text("Manage account on the web…")
                } icon: {
                    HarvousFAGlyph(assetName: "Harvous.Globe", edgePt: 14)
                }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(avatarFill)
                    .frame(width: 28, height: 28)
                HarvousFAGlyph(assetName: "Harvous.UserFilled")
                    .foregroundStyle(iconTint)
            }
            .overlay {
                Circle()
                    .strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.18), lineWidth: 0.75)
            }
            .accessibilityLabel("Account, profile, and settings")
        }
        .menuIndicator(.hidden)
        .buttonStyle(.bordered)
        .help("Account, profile, and settings")
    }
}
#endif

// MARK: - iOS: Single-column shell + bottom row actions

#if os(iOS)
struct iOSRootView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.modelContext) private var modelContext
    @State private var iosNoteNavigationPath: [UUID] = []
    @State private var importSummaryPayload: HarvousVaultImportSummaryPayload?

    var body: some View {
        NavigationStack(path: $iosNoteNavigationPath) {
            Group {
                switch appRouter.iosListSurface {
                case .notes:
                    HomeHubView(iosNoteNavigationPath: $iosNoteNavigationPath)
                case .folders:
                    LibraryView(
                        iosNoteNavigationPath: $iosNoteNavigationPath,
                        externalSearchText: $appRouter.iosInlineSearchText
                    )
                case .highlights:
                    HighlightsHubView(iosNoteNavigationPath: $iosNoteNavigationPath)
                case .scripture:
                    ScriptureHubView(
                        iosNoteNavigationPath: $iosNoteNavigationPath,
                        externalSearchText: $appRouter.iosInlineSearchText
                    )
                case .more:
                    // `.more` is now presented as a sheet; this branch is a fallback only.
                    HomeHubView(iosNoteNavigationPath: $iosNoteNavigationPath)
                }
            }
            .navigationDestination(for: UUID.self) { noteId in
                NoteEditorById(noteId: noteId)
            }
        }
        .tint(.harvousAccent)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            MorphingChromeBar()
                .environmentObject(appRouter)
                // Sit slightly nearer the physical bottom; keeps touch targets usable on notched phones.
                .padding(.bottom, -4)
        }
        .sheet(isPresented: $appRouter.iosNotesFilterSearchPresented) {
            IOSNotesFilterSearchSheet()
                .environmentObject(appRouter)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $appRouter.iosShowMore, onDismiss: {
            appRouter.youNavigationStack.removeAll()
        }) {
            NavigationStack(path: $appRouter.youNavigationStack) {
                YouRootView()
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") {
                                appRouter.iosShowMore = false
                            }
                        }
                    }
                    .navigationDestination(for: HarvousYouNavigation.self) { nav in
                        switch nav {
                        case .settingsList:
                            IOSSettingsGroupedListView()
                        case .settingsDetail(let item):
                            HarvousSettingsFormView(item: item)
                        }
                    }
            }
            .environmentObject(appRouter)
            .environmentObject(spaceStore)
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .onChange(of: appRouter.iosListSurface) { _, newSurface in
            if newSurface == .notes {
                return
            }
            appRouter.dismissStandaloneScripturePassageDock()
            // Clearing the path synchronously alongside tab chrome updates can collide with NavigationStack
            // transactions (especially when switching surfaces after a List tap animation).
            Task { @MainActor in
                iosNoteNavigationPath.removeAll()
            }
        }
        .focusedSceneValue(\.newNoteAction) {
            NotificationCenter.default.post(name: HarvousAppRouter.requestComposeNewNotification, object: nil)
        }
        .focusedSceneValue(\.showSearchAction) {
            switch appRouter.iosListSurface {
            case .notes:
                appRouter.iosNotesFilterSearchPresented = true
            case .folders, .highlights, .scripture:
                NotificationCenter.default.post(name: .harvousFocusIOSInlineSearch, object: nil)
            case .more:
                break
            }
        }
        .focusedSceneValue(\.dailyNoteAction) {
            NotificationCenter.default.post(name: .requestDailyNote, object: nil)
        }
        .focusedSceneValue(\.randomRevisitAction) {
            NotificationCenter.default.post(name: .requestRandomRevisit, object: nil)
        }
        .focusedSceneValue(\.insertWikiLinkAction) {
            NotificationCenter.default.post(name: .harvousRequestInsertWikiLink, object: nil)
        }
        .onDrop(of: [.fileURL], isTargeted: .constant(false)) { providers in
            HarvousVaultDropImport.handle(providers: providers, spaceId: spaceStore.activeSpaceUUID(), modelContext: modelContext)
            return true
        }
        .onReceive(NotificationCenter.default.publisher(for: .harvousVaultImportSummary)) { note in
            importSummaryPayload = note.object as? HarvousVaultImportSummaryPayload
        }
        .alert(
            "Import finished",
            isPresented: Binding(
                get: { importSummaryPayload != nil },
                set: { if !$0 { importSummaryPayload = nil } }
            )
        ) {
            Button("OK", role: .cancel) { importSummaryPayload = nil }
        } message: {
            if let p = importSummaryPayload {
                Text(iosImportSummaryMessage(p))
            }
        }
        .sheet(isPresented: Binding(
            get: { appRouter.standaloneScripturePassageDock != nil },
            set: { isPresented in if !isPresented { appRouter.dismissStandaloneScripturePassageDock() } }
        )) {
            if let dock = appRouter.standaloneScripturePassageDock {
                NavigationStack {
                    StandaloneScripturePassageDockHost(
                        presentation: dock,
                        scriptureTheme: spaceStore.scriptureTheme,
                        onDismiss: { appRouter.dismissStandaloneScripturePassageDock() }
                    )
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") {
                                appRouter.dismissStandaloneScripturePassageDock()
                            }
                        }
                    }
                }
                .presentationDragIndicator(.visible)
            }
        }
        .onAppear {
            HarvousCalendarStudyNotifier.requestAccessAndPrewarm(modelContext: modelContext)
            appRouter.applyPendingDeepLink()
        }
    }

    private func iosImportSummaryMessage(_ p: HarvousVaultImportSummaryPayload) -> String {
        var s = p.report.summaryLine
        if let u = p.logFileURL {
            s += "\n\nLog file:\n\(u.path)"
        }
        if !p.report.skipped.isEmpty {
            let lines = p.report.skipped.prefix(8).map { "\($0.url.lastPathComponent): \($0.reason)" }
            s += "\n\nSkipped (\(p.report.skipped.count)):\n" + lines.joined(separator: "\n")
        }
        return s
    }
}

// MARK: - Notes filter (no list `.searchable` chrome)

private struct IOSNotesFilterSearchSheet: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @FocusState private var fieldFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 10) {
                        HarvousFAGlyph(assetName: "Harvous.MagnifyingGlass", edgePt: 16)
                            .foregroundStyle(.secondary)
                        TextField("Search", text: $appRouter.iosInlineSearchText)
                            .autocorrectionDisabled(true)
                            .textInputAutocapitalization(.never)
                            .focused($fieldFocused)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        appRouter.iosNotesFilterSearchPresented = false
                    }
                }
            }
        }
        .onAppear { fieldFocused = true }
    }
}

// MARK: - Bottom row (list picker, search pill, compose)

struct HarvousIOSInlineBottomChromeRow: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var searchFocused: Bool

    /// Keeps list / search / compose as a compact floating cluster on wide phones (not edge-to-edge).
    private static let hubClusterMaxWidth: CGFloat = 420

    private var hasSearchText: Bool {
        !appRouter.iosInlineSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .center, spacing: HarvousIOSMorphingChromeLayout.interChromeSpacing) {
            listPickerOrb
            searchPill
            composeOrb
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 4)
        .frame(maxWidth: Self.hubClusterMaxWidth)
        .frame(maxWidth: .infinity)
    }

    private var listPickerOrb: some View {
        Menu {
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.notes)
            } label: {
                HStack {
                    Label {
                        Text("Notes")
                    } icon: {
                        HarvousFAGlyph(assetName: "Harvous.Note", edgePt: HarvousFAIconMetrics.sidebarListModeMenuRowIconPt)
                    }
                    Spacer(minLength: 8)
                    if appRouter.iosListSurface == .notes {
                        HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 12)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.folders)
            } label: {
                HStack {
                    Label {
                        Text("Folders")
                    } icon: {
                        HarvousFAGlyph(assetName: "Harvous.Folder", edgePt: HarvousFAIconMetrics.sidebarListModeMenuRowIconPt)
                    }
                    Spacer(minLength: 8)
                    if appRouter.iosListSurface == .folders {
                        HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 12)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.scripture)
            } label: {
                HStack {
                    Label {
                        Text("Scripture")
                    } icon: {
                        HarvousFAGlyph(assetName: "Harvous.BookOpen", edgePt: HarvousFAIconMetrics.sidebarListModeMenuRowIconPt)
                    }
                    Spacer(minLength: 8)
                    if appRouter.iosListSurface == .scripture {
                        HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 12)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.highlights)
            } label: {
                HStack {
                    Label {
                        Text("Highlights")
                    } icon: {
                        HarvousFAGlyph(assetName: "Harvous.Highlight", edgePt: HarvousFAIconMetrics.sidebarListModeMenuRowIconPt)
                    }
                    Spacer(minLength: 8)
                    if appRouter.iosListSurface == .highlights {
                        HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 12)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        } label: {
            HarvousFAGlyph(assetName: appRouter.iosListSurface.catalogGlyphAssetName, edgePt: 20)
                .foregroundStyle(Color.primary.opacity(0.85))
                .frame(width: 44, height: 44)
                .background { floatingChromeBackground(shape: Circle()) }
                .contentTransition(.opacity)
                .animation(.easeInOut(duration: 0.2), value: appRouter.iosListSurface)
        }
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .accessibilityLabel("List: \(appRouter.iosListSurface.listChromeMenuTitle)")
    }

    private var searchPill: some View {
        inlineSearchPill
    }

    private var inlineSearchPill: some View {
        HStack(spacing: 8) {
            HarvousFAGlyph(assetName: "Harvous.MagnifyingGlass", edgePt: 16)
                .foregroundStyle(Color.primary.opacity(0.6))
            TextField("Search", text: $appRouter.iosInlineSearchText)
                .font(.system(size: 17, weight: .regular))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .submitLabel(.search)
                .focused($searchFocused)
                .frame(maxWidth: .infinity, alignment: .leading)
            if hasSearchText || searchFocused {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appRouter.iosInlineSearchText = ""
                    searchFocused = false
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 17)
                        .foregroundStyle(Color.primary.opacity(0.4))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
                .transition(.opacity.combined(with: .scale))
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .frame(maxWidth: .infinity)
        .background { floatingChromeBackground(shape: Capsule(style: .continuous)) }
        .contentShape(Capsule(style: .continuous))
        .onTapGesture {
            searchFocused = true
        }
        .animation(.easeInOut(duration: 0.15), value: hasSearchText)
        .animation(.easeInOut(duration: 0.15), value: searchFocused)
        .onReceive(NotificationCenter.default.publisher(for: .harvousFocusIOSInlineSearch)) { _ in
            searchFocused = true
        }
    }

    private var composeOrb: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            appRouter.requestComposeNewNote()
        } label: {
            HarvousFAGlyph(assetName: "Harvous.Pencil")
                .foregroundStyle(Color.primary.opacity(0.9))
                .frame(width: 44, height: 44)
                .background { floatingChromeBackground(shape: Circle()) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("New note")
    }

    @ViewBuilder
    private func floatingChromeBackground<S: InsettableShape>(shape: S) -> some View {
        HarvousIOSFloatingChromeBackdrop.material(shape, colorScheme: colorScheme)
    }
}
#endif

#Preview {
    ContentView()
        .environmentObject(HarvousAppRouter())
        .environmentObject(SpaceStore())
        .modelContainer(for: [Note.self, StudyThread.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
}
