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
            if UIDevice.current.userInterfaceIdiom == .pad {
                iPadRootView()
            } else {
                iOSRootView()
            }
            #endif
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier(HarvousAccessibilityID.rootContent)
        .environment(\.harvousScriptureTheme, spaceStore.scriptureTheme)
        .task {
            spaceStore.bootstrapIfNeeded(modelContext: modelContext)
            _ = spaceStore.consumePendingJoinToken(modelContext: modelContext)
            NoteSimpleIDAssigner.backfillAllIfNeeded(in: modelContext)
            // Heal accumulated orphans: linkedNote markers whose target Note was deleted before the
            // deletion-time cleanup landed. One-shot sweep; new deletions are caught at the source.
            let purged = ThreadStore.purgeAllDanglingLinkedNoteMarkers(modelContext: modelContext)
            if purged > 0 {
                NotificationCenter.default.post(name: .harvousStudyThreadsPurged, object: nil)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                // Returning to the foreground: flush any queued local edits, then pull
                // remote changes so notes edited on another device appear without a manual
                // refresh. (.onChange doesn't fire for the initial value, so this won't
                // double up with the launch bootstrap in `.task`.)
                HarvousSyncScheduler.scheduleFullSync()
            case .inactive, .background:
                HarvousVaultExportCoordinator.shared.flush(modelContext: modelContext)
                HarvousVaultInboxScanner.scanIfNeeded(modelContext: modelContext, activeSpaceId: spaceStore.activeSpaceUUID())
            @unknown default:
                break
            }
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
    @State private var lazyDraftComposeActive = false
    @State private var liveShareSnapshot = NoteShareSnapshot(title: "", body: "")
    @State private var splitColumnVisibility: NavigationSplitViewVisibility = .all
    /// Live sidebar column width from `SidebarPanelView` — drives compose toolbar `.id` during split-divider drag.
    @State private var sidebarColumnMeasuredWidth: CGFloat = 0
    @State private var showSearch = false
    @State private var showInspector = false
    @State private var threadNavPath: [UUID] = []
    @State private var importSummaryPayload: HarvousVaultImportSummaryPayload?
    @State private var bridge = HarvousClerkBridge.shared
    /// Stable mirror of `bridge.isAuthenticated`, flipped only on real sign-in/out
    /// transitions. The window-toolbar visibility modifier reads THIS, not the inline
    /// `bridge.isAuthenticated` (which subscribes to `Clerk.shared`'s high-frequency
    /// observable) — otherwise the unified window toolbar is re-applied on every render
    /// and re-enters the window update-constraints pass → recursion/crash on note open.
    @State private var isAuthed = false
    @State private var macToggleInspectorFocusedAction: (() -> Void)?
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var macNoteListSelectionCoordinator: MacNoteListSelectionCoordinator
    @EnvironmentObject private var macEditorMenuActionsCoordinator: MacEditorMenuActionsCoordinator
    @EnvironmentObject private var shiftHints: HarvousShiftHintsMonitor
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

    /// Leading gutter for the study dock carousel in the detail column only.
    /// When the sidebar is visible, the split already offsets the editor — do not add sidebar width again.
    private var macStudyDockLeadingInset: CGFloat {
        splitColumnVisibility == .detailOnly ? StudyDockLayoutMetrics.macCollapsedSidebarLeadingGutter : 0
    }

    private var macStudyDockTrailingInset: CGFloat {
        showInspector ? StudyDockLayoutMetrics.macInspectorTrailingReserve : 0
    }

    /// Recreates the detail-column compose `ToolbarItem` when the split divider moves so AppKit `.bordered` chrome cannot desync from the glyph.
    private var macComposeToolbarItemIdentity: Int {
        splitColumnVisibility == .detailOnly ? 0 : Int(sidebarColumnMeasuredWidth.rounded())
    }

    private var macNavigationSplit: some View {
        NavigationSplitView(columnVisibility: animatedSplitVisibility) {
            SidebarPanelView(
                selectedNote: $selectedNote,
                splitColumnVisibility: animatedSplitVisibility,
                onCreateNewNote: createNewNote,
                reportedSidebarColumnWidth: $sidebarColumnMeasuredWidth
            )
                .navigationSplitViewColumnWidth(min: 260, ideal: 260, max: 300)
        } detail: {
            NavigationStack(path: $threadNavPath) {
                ZStack {
                    NoteEditorView(
                        note: $selectedNote,
                        isLazyDraftComposeActive: $lazyDraftComposeActive,
                        onNavigateToLinkedNotes: { threadNavPath.append($0) },
                        showInspector: $showInspector as Binding<Bool>
                    )
                    .environment(\.harvousMacStudyDockLeadingInset, macStudyDockLeadingInset)
                    .environment(\.harvousMacStudyDockTrailingInset, macStudyDockTrailingInset)
                    if selectedNote == nil, !lazyDraftComposeActive, let dock = appRouter.standaloneScripturePassageDock {
                        StandaloneScripturePassageDockHost(
                            presentation: dock,
                            scriptureTheme: spaceStore.scriptureTheme,
                            onDismiss: { appRouter.dismissStandaloneScripturePassageDock() }
                        )
                        .transition(.opacity)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .onPreferenceChange(NoteShareSnapshotPreferenceKey.self) { liveShareSnapshot = $0 }
                    .toolbar(removing: .sidebarToggle)
                    .toolbar {
                        if isAuthed {
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
                                            .harvousToolbarShortcutHint("B")
                                        }
                                    }
                                    .labelStyle(.iconOnly)
                                    .buttonStyle(.bordered)
                                    .help("Show sidebar (⇧B)")
                                    .accessibilityLabel("Show sidebar")
                                }
                            }

                            ToolbarItem(placement: .navigation) {
                                Button(action: createNewNote) {
                                    HarvousFAGlyph(assetName: "Harvous.Pencil")
                                        .fixedSize(horizontal: true, vertical: true)
                                        .harvousToolbarShortcutHint("N")
                                }
                                .buttonStyle(.bordered)
                                .help("New Note (⇧N)")
                                .id(macComposeToolbarItemIdentity)
                                .transaction(value: macComposeToolbarItemIdentity) { $0.disablesAnimations = true }
                            }

                            if let note = selectedNote {
                                if #available(macOS 26, *) { ToolbarSpacer(.fixed) }

                                ToolbarItem(placement: .cancellationAction) {
                                    NoteFolderChip(
                                        note: note,
                                        isFolderContextUpdating: false,
                                        showFolderToolbarText: true,
                                        scriptureTheme: spaceStore.scriptureTheme
                                    )
                                }

                                // Flexible spacer absorbs extra width between the folder chip and the
                                // share/more group. Two fixed spacers before share/more match the
                                // perceived leading inset of the trailing `confirmationAction` cluster
                                // (`.primaryAction` sits in a tighter column than the trailing slot).
                                if #available(macOS 26, *) { ToolbarSpacer(.flexible) }
                                if #available(macOS 26, *) { ToolbarSpacer(.fixed) }
                                if #available(macOS 26, *) { ToolbarSpacer(.fixed) }

                                MacNoteShareMoreToolbar(
                                    note: note,
                                    liveShareSnapshot: liveShareSnapshot,
                                    onDeleteConfirmed: {
                                        let nid = note.id
                                        HarvousVaultExporter.removeMirrorFiles(for: note, modelContext: context)
                                        HarvousNoteSpotlightIndexer.removeNote(id: nid)
                                        ThreadStore.purgeLinkedNoteMarkers(referencingDeletedNote: nid, modelContext: context)
                                        selectedNote = nil
                                        HarvousSyncingDelete.delete(note: note, context: context, trigger: .menu)
                                        try? context.saveWithLogging()
                                    }
                                )

                                if #available(macOS 26, *) { ToolbarSpacer(.fixed) }
                            } else if #available(macOS 26, *) {
                                // Push inspector + profile to the trailing edge when chip/share are hidden.
                                ToolbarSpacer(.flexible)
                            }

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
                                            .harvousToolbarShortcutHint("D")
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
                                            .harvousToolbarShortcutHint("D")
                                        }
                                    }
                                }
                                .labelStyle(.iconOnly)
                                .buttonStyle(.bordered)
                                .help(showInspector ? "Hide note details (⇧D)" : "Show note details (⇧D)")
                                .disabled(selectedNote == nil)

                                HarvousMacProfileToolbarMenu()
                            }
                        }
                    }
                .navigationDestination(for: UUID.self) { threadID in
                    LinkedNotesView(linkedNoteMarkerId: threadID)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .id(navStackResetToken)
        }
    }

    private var macSplitStyled: some View {
        macNavigationSplit
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.clear)
            .navigationSplitViewStyle(.balanced)
            // When signed out, SignInGate keeps this NavigationSplitView in the
            // tree under the sign-in overlay. Its unified toolbar's vibrancy
            // material re-activates to white on every focus cycle. Removing the
            // whole window toolbar (not just its items) leaves no material to
            // redraw, so HarvousPaperWindowChrome's paper title bar stays clean.
            .toolbar(isAuthed ? .automatic : .hidden, for: .windowToolbar)
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
            .focusedSceneValue(\.showSearchAction, macOpenSearch)
            .focusedSceneValue(\.dailyNoteAction, openDailyNote)
            .focusedSceneValue(\.randomRevisitAction, openRandomNote)
            .focusedSceneValue(\.insertWikiLinkAction, macPostInsertWikiLink)
    }

    private var macWithInspectorAndListFocus: some View {
        macWithBaseFocusedValues
            .focusedSceneValue(\.toggleInspectorAction, macToggleInspectorFocusedAction)
            .focusedSceneValue(\.focusNoteListAction, macFocusNoteList)
            .focusedSceneValue(\.nextNoteAction, macNoteListSelectionCoordinator.nextNote)
            .focusedSceneValue(\.previousNoteAction, macNoteListSelectionCoordinator.previousNote)
            .focusedSceneValue(\.firstNoteAction, macNoteListSelectionCoordinator.firstNote)
            .focusedSceneValue(\.lastNoteAction, macNoteListSelectionCoordinator.lastNote)
            .focusedSceneValue(\.deleteNoteAction, macEditorMenuActionsCoordinator.deleteNoteAction)
            .focusedSceneValue(\.newConnectedNoteAction, macEditorMenuActionsCoordinator.newConnectedNoteAction)
            .focusedSceneValue(\.nextStudyHighlightAction, macEditorMenuActionsCoordinator.nextStudyHighlightAction)
            .focusedSceneValue(\.previousStudyHighlightAction, macEditorMenuActionsCoordinator.previousStudyHighlightAction)
            .focusedSceneValue(\.toggleStudyHighlightDockExpandedAction, macEditorMenuActionsCoordinator.toggleStudyHighlightDockExpandedAction)
            .focusedSceneValue(\.removeActiveStudyHighlightAction, macEditorMenuActionsCoordinator.removeActiveStudyHighlightAction)
            .onChange(of: selectedNote?.id, initial: true) { _, _ in
                macToggleInspectorFocusedAction = selectedNote == nil ? nil : { showInspector.toggle() }
            }
    }

    private var macRootChrome: some View {
        macWithInspectorAndListFocus
            // Seed + track auth as plain state so the window-toolbar visibility modifier
            // doesn't read the churning `Clerk.shared` observable on every render.
            .task { isAuthed = bridge.isAuthenticated }
            .onChange(of: bridge.isAuthenticated) { _, authed in isAuthed = authed }
            .onChange(of: lazyDraftComposeActive) { _, _ in
                shiftHints.isNoteRouteActive = selectedNote != nil || lazyDraftComposeActive
            }
            .onChange(of: selectedNote?.id) { _, _ in
                shiftHints.isNoteRouteActive = selectedNote != nil || lazyDraftComposeActive
                threadNavPath.removeAll()
            }
            .overlay {
                if showSearch {
                    SpotlightSearchView(isPresented: $showSearch, selectedNote: $selectedNote)
                        .ignoresSafeArea()
                }
            }
            .overlay(alignment: .bottomLeading) {
                if isAuthed {
                    HarvousSyncStatusChip()
                        .padding(.leading, 16)
                        .padding(.bottom, 16)
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
            .onReceive(NotificationCenter.default.publisher(for: .harvousNotesPruned)) { n in
                let pruned = HarvousNotesPrunedPayload.prunedIds(from: n)
                guard let current = selectedNote, pruned.contains(current.id) else { return }
                selectedNote = nil
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
                wireShiftHints()
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
            .harvousCanvasBackground()
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

    private func wireShiftHints() {
        shiftHints.isNoteRouteActive = selectedNote != nil
        shiftHints.onShortcut = { shortcut in
            handleShiftShortcut(shortcut)
        }
    }

    private func handleShiftShortcut(_ shortcut: HarvousShiftShortcut) {
        switch shortcut {
        case .newNote:
            createNewNote()
        case .search:
            showSearch = true
        case .settings:
            openWindow(id: HarvousMacPreferencesWindow.sceneID)
        case .toggleSidebar:
            splitColumnVisibility = splitColumnVisibility == .detailOnly ? .all : .detailOnly
        case .focusNoteList:
            selectedNote = nil
        case .findInNote:
            appRouter.requestFindInNote()
        case .lockNote:
            break // Note lock temporarily disabled.
        case .toggleInspector:
            if selectedNote != nil { showInspector.toggle() }
        case .cycleListMode(let step):
            NotificationCenter.default.post(
                name: .harvousCycleSidebarMode,
                object: nil,
                userInfo: ["step": step]
            )
        }
    }

    private func macOpenSearch() {
        showSearch = true
    }

    private func macFocusNoteList() {
        lazyDraftComposeActive = false
        selectedNote = nil
    }

    private func macPostInsertWikiLink() {
        NotificationCenter.default.post(name: .harvousRequestInsertWikiLink, object: nil)
    }

    private func createNewNote() {
        selectedNote = nil
        lazyDraftComposeActive = true
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
        note.markDirty()
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

/// Trailing toolbar control: neutral person orb (or Clerk photo), menu for account + Settings.
private struct HarvousMacProfileToolbarMenu: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.openWindow) private var openWindow
    @Environment(\.colorScheme) private var colorScheme

    @Bindable private var bridge = HarvousClerkBridge.shared
    @State private var isSigningOut = false

    var body: some View {
        Menu {
            if let profile = bridge.currentProfile {
                Text(profile.displayName)
                    .font(HarvousFonts.font(size: 15, weight: .semibold, design: .default))
                if let email = profile.primaryEmail, !email.isEmpty, email != profile.displayName {
                    Text(email)
                        .font(HarvousTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Divider()
            }

            Button {
                openWindow(id: HarvousMacPreferencesWindow.sceneID)
            } label: {
                HStack(spacing: 8) {
                    HarvousFAGlyph(assetName: "Harvous.Gear", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                    Text("Settings…")
                        .font(HarvousTypography.profileMenuAction)
                    Spacer(minLength: 0)
                }
            }
            .font(HarvousTypography.profileMenuAction)

            Button {
                Task { await logOut() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: HarvousFAIconMetrics.menuRowLeadingGlyphPt, weight: .regular))
                        .frame(width: HarvousFAIconMetrics.menuRowLeadingGlyphPt, alignment: .center)
                    Text(isSigningOut ? "Logging out…" : "Log out")
                        .font(HarvousTypography.profileMenuAction)
                    Spacer(minLength: 0)
                    if isSigningOut {
                        ProgressView().controlSize(.small)
                    }
                }
            }
            .font(HarvousTypography.profileMenuAction)
            .disabled(isSigningOut)
        } label: {
            profileOrbLabel
        }
        .menuIndicator(.hidden)
        .buttonStyle(.bordered)
        .help("Account, profile, and settings")
        .onAppear { bridge.refreshProfile() }
    }

    private var profileOrbLabel: some View {
        ZStack {
            if bridge.macToolbarProfileImage == nil {
                Circle()
                    .fill(HarvousProfileOrb.neutralFill(colorScheme: colorScheme))
                    .frame(width: 28, height: 28)
            }
            if let photo = bridge.macToolbarProfileImage {
                Image(nsImage: photo)
                    .frame(width: 28, height: 28)
            } else {
                HarvousFAGlyph(assetName: "Harvous.UserFilled")
                    .foregroundStyle(HarvousProfileOrb.neutralGlyphTint(colorScheme: colorScheme))
            }
        }
        .frame(width: 28, height: 28)
        .clipShape(Circle())
        .overlay {
            if bridge.macToolbarProfileImage == nil {
                Circle()
                    .strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.18), lineWidth: 0.75)
            }
        }
        .accessibilityLabel("Account, profile, and settings")
    }

    private func logOut() async {
        isSigningOut = true
        defer { isSigningOut = false }
        await bridge.signOut()
    }
}
#endif

/// Unique per app launch — forces every NavigationStack to discard persisted
/// scene state from a previous session, preventing comparisonTypeMismatch crashes.
/// File-level so it's created once per process and shared across iOS/macOS roots.
let navStackResetToken = UUID()

// MARK: - iOS: Single-column shell + bottom row actions

#if os(iOS)
struct iOSRootView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.modelContext) private var modelContext
    @State private var iosSelectedNoteId: UUID?
    @State private var importSummaryPayload: HarvousVaultImportSummaryPayload?
    @State private var iosKeyboardOccupiesBottom = false
    @State private var bridge = HarvousClerkBridge.shared

    var body: some View {
        let chrome = iosNavigationStack
            .overlay {
                // Detail screens (drilled in via NavigationStack) own a system back button — never let the
                // dismiss tap-catcher cover its hit area. The overlay also reserves the top safe area so the
                // back button stays tappable even at the root list level if the orb somehow stays presented.
                if appRouter.iosComposeCameraOrbPresented && iosSelectedNoteId == nil {
                    GeometryReader { geo in
                        let bottomReserve = HarvousIOSMorphingChromeLayout.composeCameraOrbDismissTapCatcherBottomReserve
                            + geo.safeAreaInsets.bottom
                        let topReserve = geo.safeAreaInsets.top + 44
                        let usableHeight = max(0, geo.size.height - bottomReserve - topReserve)
                        Color.clear
                            .contentShape(Rectangle())
                            .frame(width: geo.size.width, height: usableHeight, alignment: .top)
                            .padding(.top, topReserve)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                            .onTapGesture {
                                appRouter.dismissIOSComposeCameraOrbIfPresented()
                            }
                    }
                    .allowsHitTesting(true)
                }
            }
            .tint(.harvousAccent)
            .safeAreaInset(edge: .bottom, spacing: HarvousIOSMorphingChromeLayout.interChromeSpacing) {
                iosMorphingChromeInset
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                iosKeyboardOccupiesBottom = true
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                iosKeyboardOccupiesBottom = false
            }

        let withSheets = chrome
            .sheet(isPresented: $appRouter.iosNotesFilterSearchPresented) {
                IOSNotesFilterSearchSheet()
                    .environmentObject(appRouter)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $appRouter.iosShowMore, onDismiss: {
                appRouter.youNavigationStack.removeAll()
                HarvousClerkBridge.shared.refreshProfile()
            }) {
                iosYouRootSheet
            }

        let withScene = withSheets
            .onChange(of: appRouter.iosListSurface) { _, newSurface in
                if newSurface == .notes {
                    return
                }
                appRouter.dismissStandaloneScripturePassageDock()
                iosSelectedNoteId = nil
            }
            .onChange(of: iosSelectedNoteId) { _, newId in
                // Drilling into a detail screen must hide the compose orb so the system back button is never
                // shadowed by its dismiss tap-catcher (back-button unresponsive bug).
                if newId != nil {
                    appRouter.dismissIOSComposeCameraOrbIfPresented()
                }
            }
            .focusedSceneValue(\.newNoteAction, iosFocusedComposeNew)
            .focusedSceneValue(\.showSearchAction, iosFocusedOpenSearch)
            .focusedSceneValue(\.dailyNoteAction, iosFocusedDailyNote)
            .focusedSceneValue(\.randomRevisitAction, iosFocusedRandomRevisit)
            .focusedSceneValue(\.insertWikiLinkAction, iosFocusedInsertWikiLink)

        return withScene
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
                iosStandaloneScriptureDockSheet
            }
            .onAppear {
                iosSelectedNoteId = nil
                appRouter.youNavigationStack.removeAll()
                HarvousCalendarStudyNotifier.requestAccessAndPrewarm(modelContext: modelContext)
                appRouter.applyPendingDeepLink()
            }
            .harvousCanvasBackground()
    }

    private var iosNavigationStack: some View {
        NavigationStack {
            iosListSurfaceGroup
                .modifier(HarvousIOSNavigationContainerBackgroundClearModifier())
                .navigationDestination(item: $iosSelectedNoteId) { noteId in
                    if HarvousLazyComposeDraft.isDraftNavigationId(noteId) {
                        LazyDraftNoteEditorView(selectedNoteId: $iosSelectedNoteId)
                            .modifier(HarvousIOSNavigationContainerBackgroundClearModifier())
                    } else {
                        NoteEditorById(noteId: noteId)
                            .modifier(HarvousIOSNavigationContainerBackgroundClearModifier())
                    }
                }
        }
        .background(Color.clear)
        .harvousIOSGlassOverCanvasShell()
    }

    @ViewBuilder
    private var iosListSurfaceGroup: some View {
        if !appRouter.iosInlineSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            IOSUniversalSearchHost(
                iosSelectedNoteId: $iosSelectedNoteId,
                query: appRouter.iosInlineSearchText
            )
        } else {
            iosListSurfaceContent
        }
    }

    @ViewBuilder
    private var iosListSurfaceContent: some View {
        Group {
            switch appRouter.iosListSurface {
            case .notes:
                HomeHubView(iosSelectedNoteId: $iosSelectedNoteId)
            case .folders:
                LibraryView(
                    iosSelectedNoteId: $iosSelectedNoteId,
                    externalSearchText: $appRouter.iosInlineSearchText
                )
            case .threads:
                ThreadsHubView(
                    iosSelectedNoteId: $iosSelectedNoteId,
                    externalSearchText: $appRouter.iosInlineSearchText
                )
            case .highlights:
                HighlightsHubView(iosSelectedNoteId: $iosSelectedNoteId)
            case .scripture:
                ScriptureHubView(
                    iosSelectedNoteId: $iosSelectedNoteId,
                    externalSearchText: $appRouter.iosInlineSearchText
                )
            case .more:
                // `.more` is presented as a sheet; fallback only.
                HomeHubView(iosSelectedNoteId: $iosSelectedNoteId)
            }
        }
        // Note: bottom scroll-content inset is applied directly inside each vertical `List`
        // (see `.iosListBottomChromeReserve()`), not here. Applying it at this level would
        // also affect the horizontal `ScrollView`s used for the highlights chip
        // bars and create a large empty band between the chips and the list.
    }

    /// Keeps `MorphingChromeBar` in a stable slot (not inside `if/else` branches) so
    /// `HarvousIOSInlineBottomChromeRow`'s `@FocusState` survives keyboard show/hide.
    @ViewBuilder
    private var iosMorphingChromeInset: some View {
        if bridge.isAuthenticated {
            VStack(spacing: 8) {
                HStack {
                    HarvousSyncStatusChip()
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                MorphingChromeBar()
                    .environmentObject(appRouter)
                    .padding(.bottom, iosKeyboardOccupiesBottom ? 0 : -4)
            }
        }
    }

    private var iosYouRootSheet: some View {
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
        .harvousListMenuTypography()
        .id(navStackResetToken)
        .environmentObject(appRouter)
        .environmentObject(spaceStore)
        .harvousCanvasBackground()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private var iosStandaloneScriptureDockSheet: some View {
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

    private func iosFocusedComposeNew() {
        NotificationCenter.default.post(name: HarvousAppRouter.requestComposeNewNotification, object: nil)
    }

    private func iosFocusedOpenSearch() {
        switch appRouter.iosListSurface {
        case .notes:
            appRouter.iosNotesFilterSearchPresented = true
        case .folders, .threads, .highlights, .scripture:
            NotificationCenter.default.post(name: .harvousFocusIOSInlineSearch, object: nil)
        case .more:
            break
        }
    }

    private func iosFocusedDailyNote() {
        NotificationCenter.default.post(name: .requestDailyNote, object: nil)
    }

    private func iosFocusedRandomRevisit() {
        NotificationCenter.default.post(name: .requestRandomRevisit, object: nil)
    }

    private func iosFocusedInsertWikiLink() {
        NotificationCenter.default.post(name: .harvousRequestInsertWikiLink, object: nil)
    }
}

// MARK: - Notes filter (no list `.searchable` chrome)

struct IOSNotesFilterSearchSheet: View {
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

// MARK: - Top-bar list-surface chip (Notes / Folders / Scripture / Highlights / Dictionary)

/// Replaces the floating circle orb at the bottom-left: a chip in the hub views'
/// `.topBarLeading` toolbar slot — same position and treatment as `NoteFolderChip`
/// in `NoteTopBar.swift`. iOS 26's auto-glass on toolbar items provides the capsule
/// background; we just contribute icon + label and let the system style it.
struct IOSListSurfaceChip: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter

    private var labelFont: Font {
        HarvousFonts.font(size: 16, weight: 500, design: .default)
    }

    /// When the user has drilled into a specific folder bucket, the chip morphs into a back-affordance
    /// showing the active folder name. Returns the display name to render (matches `NoteFilter.folder.displayName`),
    /// or `nil` when the chip should keep its normal surface-switcher behavior.
    private var drilledFolderLabel: String? {
        guard appRouter.iosListSurface == .folders,
              case .bucket(let key) = appRouter.iosFoldersDrill else { return nil }
        return NoteFilter.folder(key).displayName
    }

    /// When drilled into a thread cluster, the chip morphs into a chevron-back showing the cluster title.
    private var drilledThreadLabel: String? {
        guard appRouter.iosListSurface == .threads,
              case .cluster(_, let title, _) = appRouter.iosThreadsDrill else { return nil }
        return title
    }

    /// When drilled into a scripture book or passage, the chip morphs into chevron + context label (matches folder drill).
    private var drilledScriptureChip: (label: String, accessibilityLabel: String)? {
        guard appRouter.iosListSurface == .scripture else { return nil }
        switch appRouter.iosScriptureDrill {
        case .root:
            return nil
        case .book(let idx):
            let label = NoteFilter.scriptureBook(bookIndex: idx).displayName
            return (label, "Back to Scripture index, currently viewing \(label)")
        case .passage(let p):
            let label = NoteFilter.scripturePassage(p).displayName
            return (label, "Back to passages, currently viewing \(label)")
        }
    }

    var body: some View {
        if let folderLabel = drilledFolderLabel {
            drilledBackChip(
                label: folderLabel,
                accessibilityLabel: "Back to folders, currently viewing \(folderLabel)"
            ) {
                appRouter.iosFoldersDrill = .root
            }
        } else if let threadLabel = drilledThreadLabel {
            drilledBackChip(
                label: threadLabel,
                accessibilityLabel: "Back to threads, currently viewing \(threadLabel)"
            ) {
                appRouter.iosThreadsDrill = .root
            }
        } else if let scripture = drilledScriptureChip {
            drilledBackChip(label: scripture.label, accessibilityLabel: scripture.accessibilityLabel) {
                popScriptureDrill()
            }
        } else {
            surfaceMenuChip
        }
    }

    private func popScriptureDrill() {
        switch appRouter.iosScriptureDrill {
        case .root:
            break
        case .book:
            appRouter.iosScriptureDrill = .root
        case .passage(let p):
            appRouter.iosScriptureDrill = .book(p.bookIndex)
        }
    }

    private var surfaceMenuChip: some View {
        Menu {
            chipMenuButton(.notes, label: "Notes", icon: "Harvous.Note")
            chipMenuButton(.folders, label: "Folders", icon: "Harvous.Folder")
            chipMenuButton(.threads, label: "Threads", icon: "Harvous.ArrowRightArrowLeft")
            chipMenuButton(.scripture, label: "Scripture", icon: "Harvous.BookOpen")
            chipMenuButton(.highlights, label: "Highlights", icon: "Harvous.Highlight")
        } label: {
            HStack(spacing: 6) {
                HarvousFAGlyph(
                    assetName: appRouter.iosListSurface.catalogGlyphAssetName,
                    edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                .frame(
                    width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                    height: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                Text(appRouter.iosListSurface.listChromeMenuTitle)
                    .font(labelFont)
                    .lineLimit(1)
            }
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, 8)
            .frame(minHeight: 24)
        }
        .menuIndicator(.hidden)
        .buttonStyle(.plain)
        .tint(.primary)
        .accessibilityLabel("List: \(appRouter.iosListSurface.listChromeMenuTitle)")
    }

    @ViewBuilder
    private func chipMenuButton(_ surface: HarvousIOSListSurface, label: String, icon: String) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            appRouter.selectIOSListSurface(surface)
        } label: {
            Label {
                Text(label)
            } icon: {
                HarvousFAGlyph(assetName: icon, edgePt: HarvousFAIconMetrics.compactMenuRowLeadingGlyphPt)
            }
        }
    }

    private func drilledBackChip(
        label: String,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: 6) {
                HarvousFAGlyph(
                    assetName: "Harvous.ChevronLeft",
                    edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                .frame(
                    width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                    height: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                Text(label)
                    .font(labelFont)
                    .lineLimit(1)
            }
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, 8)
            .frame(minHeight: 24)
        }
        .buttonStyle(.plain)
        .tint(.primary)
        .accessibilityLabel(accessibilityLabel)
    }
}

// MARK: - Bottom row (search pill, compose)

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
        // DailyPassagePill is in the VStack so its height is part of safeAreaInset layout —
        // lists scroll above both pill and chrome row when the pill is visible.
        // When not visible, DailyPassagePill renders Color.clear.frame(0,0) so the VStack
        // collapses back to just the chrome row.
        //
        // `.fixedSize(horizontal: false, vertical: true)` is required: the pill's internal
        // ZStack contains a swipe-dismiss background with `.frame(maxHeight: .infinity)`.
        // Inside the old `.overlay`, that infinity was clamped by the chrome row's 48pt host
        // bounds, but inside this VStack (safeAreaInset content has no parent height limit)
        // it would expand to fill the entire screen, pushing the chrome bar far above its
        // natural bottom position. fixedSize forces the pill to size to its natural content height.
        VStack(spacing: 0) {
            DailyPassagePill { note in
                NotificationCenter.default.post(
                    name: .harvousRequestOpenNoteId,
                    object: nil,
                    userInfo: [HarvousOpenNoteIdPayload.idKey: note.id.uuidString]
                )
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.bottom, HarvousIOSMorphingChromeLayout.interChromeSpacing)
            .frame(maxWidth: Self.hubClusterMaxWidth)
            .frame(maxWidth: .infinity)

            // `.bottom` keeps search on the baseline when the compose column grows (camera orb above pencil).
            HStack(alignment: .bottom, spacing: HarvousIOSMorphingChromeLayout.interChromeSpacing) {
                searchPill
                composeOrb
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 4)
            .frame(maxWidth: Self.hubClusterMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    private var searchPill: some View {
        inlineSearchPill
    }

    private var inlineSearchPill: some View {
        HStack(spacing: 8) {
            HarvousFAGlyph(assetName: "Harvous.MagnifyingGlass", edgePt: 16)
                .foregroundStyle(Color.primary.opacity(0.6))
            TextField("Search", text: $appRouter.iosInlineSearchText)
                .font(HarvousTypography.searchField)
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
        .frame(minHeight: HarvousIOSMorphingChromeLayout.chromeControlsHeight)
        .frame(maxWidth: .infinity)
        .background { floatingChromeBackground(shape: Capsule(style: .continuous)) }
        .contentShape(Capsule(style: .continuous))
        .onTapGesture {
            appRouter.dismissIOSComposeCameraOrbIfPresented()
            searchFocused = true
        }
        .animation(.easeInOut(duration: 0.15), value: hasSearchText)
        .animation(.easeInOut(duration: 0.15), value: searchFocused)
        .onReceive(NotificationCenter.default.publisher(for: .harvousFocusIOSInlineSearch)) { _ in
            searchFocused = true
        }
    }

    private var composeOrb: some View {
        HarvousIOSComposeOrbCluster {
            floatingChromeBackground(shape: Circle())
        }
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
