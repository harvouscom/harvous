import SwiftUI
import SwiftData

private struct HarvousIsIPadSplitLayoutKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// `true` when a view is rendered inside `iPadRootView`'s split layout — used by editor / lists
    /// to enable Mac-like chrome (bottom formatting bar, compact sidebar rows) instead of iPhone-style.
    var harvousIsIPadSplitLayout: Bool {
        get { self[HarvousIsIPadSplitLayoutKey.self] }
        set { self[HarvousIsIPadSplitLayoutKey.self] = newValue }
    }
}

#if os(iOS)
import UIKit

struct iPadRootView: View {
    @State private var selectedNote: Note?
    @State private var liveShareSnapshot = NoteShareSnapshot(title: "", body: "")
    @State private var lastSelectedNote: Note?
    @State private var splitColumnVisibility: NavigationSplitViewVisibility = .all
    @State private var showSearch = false
    @State private var showInspector = false
    @State private var threadNavPath = NavigationPath()
    @State private var importSummaryPayload: HarvousVaultImportSummaryPayload?

    @Environment(\.modelContext) private var context
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore

    var body: some View {
        padRootChrome
    }

    // MARK: - Split layout

    private var padNavigationSplit: some View {
        NavigationSplitView(columnVisibility: $splitColumnVisibility) {
            SidebarPanelView(
                selectedNote: $selectedNote,
                splitColumnVisibility: $splitColumnVisibility,
                onCreateNewNote: createNewNote
            )
            .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 320)
        } detail: {
            NavigationStack(path: $threadNavPath) {
                ZStack {
                    NoteEditorView(
                        note: $selectedNote,
                        onNavigateToLinkedNotes: { threadNavPath.append($0) },
                        showInspector: $showInspector
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
                .onPreferenceChange(NoteShareSnapshotPreferenceKey.self) { liveShareSnapshot = $0 }
                .toolbar { padDetailToolbar }
                .navigationDestination(for: UUID.self) { threadID in
                    LinkedNotesView(linkedNoteMarkerId: threadID)
                }
            }
        }
    }

    // MARK: - Detail column toolbar

    @ToolbarContentBuilder
    private var padDetailToolbar: some ToolbarContent {
        if splitColumnVisibility == .detailOnly {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    splitColumnVisibility = .all
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
                        .foregroundStyle(.primary)
                    }
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.bordered)
                .accessibilityLabel("Show sidebar")
            }
        }

        ToolbarItem(placement: .topBarLeading) {
            Button(action: createNewNote) {
                HarvousFAGlyph(assetName: "Harvous.Pencil")
                    .fixedSize(horizontal: true, vertical: true)
                    .foregroundStyle(.primary)
            }
            .buttonStyle(.bordered)
            .help("New Note")
        }

        if let note = selectedNote {
            ToolbarItem(placement: .principal) {
                NoteFolderChip(
                    note: note,
                    isFolderContextUpdating: false,
                    showFolderToolbarText: true,
                    scriptureTheme: spaceStore.scriptureTheme
                )
            }
        }

        if let note = selectedNote {
            MacNoteShareMoreToolbar(
                note: note,
                liveShareSnapshot: liveShareSnapshot,
                onDeleteConfirmed: {
                    let nid = note.id
                    HarvousVaultExporter.removeMirrorFiles(for: note, modelContext: context)
                    HarvousNoteSpotlightIndexer.removeNote(id: nid)
                    ThreadStore.purgeLinkedNoteMarkers(referencingDeletedNote: nid, modelContext: context)
                    selectedNote = nil
                    HarvousSyncingDelete.delete(note: note, context: context)
                    try? context.saveWithLogging()
                }
            )
        }

        // Inspector + profile come AFTER share/more in declaration order so the trailing-cluster
        // reads left→right as: share, ellipsis, inspector toggle, avatar — matching macOS.
        ToolbarItem(placement: .primaryAction) {
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
                        .foregroundStyle(.primary)
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
                        .foregroundStyle(.primary)
                    }
                }
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.bordered)
            .help(showInspector ? "Hide note details" : "Show note details")
            .disabled(selectedNote == nil)
        }

        ToolbarItem(placement: .primaryAction) {
            padProfileButton
        }
    }

    // MARK: - Profile button (sheet-based, since iPad has no separate windows)

    private var padProfileButton: some View {
        Button {
            appRouter.iosShowMore = true
        } label: {
            padAvatarDisc
        }
        .buttonStyle(.bordered)
        .help("Account, profile, and settings")
        .accessibilityLabel("Account, profile, and settings")
    }

    @AppStorage(HarvousSettingsStorageKeys.avatarColor)
    private var avatarColorRaw: String = HarvousAvatarColorToken.blue.rawValue

    @Environment(\.colorScheme) private var colorScheme

    private var padAvatarDisc: some View {
        let token = HarvousAvatarColorToken(rawValue: avatarColorRaw) ?? .blue
        let fill: Color
        let tint: Color
        switch token {
        case .paper:
            fill = colorScheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.07)
            tint = colorScheme == .dark ? Color.white.opacity(0.55) : Color.primary.opacity(0.55)
        default:
            fill = Color.thread(avatarColorRaw) ?? Color.harvousAccent.opacity(0.35)
            tint = Color.threadGlyph(avatarColorRaw) ?? Color.harvousAccent
        }
        return ZStack {
            Circle()
                .fill(fill)
                .frame(width: 28, height: 28)
            HarvousFAGlyph(assetName: "Harvous.UserFilled")
                .foregroundStyle(tint)
        }
        .overlay {
            Circle()
                .strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.18), lineWidth: 0.75)
        }
    }

    private var padSettingsSheet: some View {
        NavigationStack(path: $appRouter.youNavigationStack) {
            YouRootView()
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { appRouter.iosShowMore = false }
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

    // MARK: - Root chrome (modifiers, sheets, deep-link handling)

    private var padSplitStyled: some View {
        padNavigationSplit
            .navigationSplitViewStyle(.balanced)
            .environment(\.harvousIsIPadSplitLayout, true)
            .transaction(value: showInspector) { $0.disablesAnimations = true }
            .transaction(value: selectedNote?.id) { $0.disablesAnimations = true }
            .onChange(of: selectedNote?.id) { _, _ in
                if selectedNote != nil {
                    appRouter.dismissStandaloneScripturePassageDock()
                }
            }
    }

    private var padWithSheetsAndSearch: some View {
        padSplitStyled
            .overlay {
                if showSearch {
                    IOSNotesFilterSearchSheet()
                        .environmentObject(appRouter)
                }
            }
            .sheet(isPresented: $appRouter.iosShowMore, onDismiss: {
                appRouter.youNavigationStack.removeAll()
            }) {
                padSettingsSheet
            }
    }

    private var padWithFocusedValues: some View {
        padWithSheetsAndSearch
            .focusedSceneValue(\.newNoteAction, createNewNote)
            .focusedSceneValue(\.showSearchAction) { showSearch = true }
            .focusedSceneValue(\.dailyNoteAction, openDailyNote)
            .focusedSceneValue(\.randomRevisitAction, openRandomNote)
            .focusedSceneValue(\.insertWikiLinkAction) {
                NotificationCenter.default.post(name: .harvousRequestInsertWikiLink, object: nil)
            }
            .focusedSceneValue(
                \.toggleInspectorAction,
                selectedNote == nil ? nil : { showInspector.toggle() }
            )
            .focusedSceneValue(\.focusNoteListAction) { selectedNote = nil }
    }

    private var padRootChrome: some View {
        padWithFocusedValues
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
                        HarvousSyncingDelete.delete(note: prev, context: context)
                        try? context.saveWithLogging()
                    }
                    lastSelectedNote = newNote
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousRequestOpenNoteId)) { n in
                guard let raw = n.userInfo?[HarvousOpenNoteIdPayload.idKey] as? String,
                      let id = UUID(uuidString: raw) else { return }
                let target = id
                let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == target })
                if let found = try? context.fetch(fd).first { selectedNote = found }
            }
            .onDrop(of: [.fileURL], isTargeted: .constant(false)) { providers in
                HarvousVaultDropImport.handle(providers: providers, spaceId: spaceStore.activeSpaceUUID(), modelContext: context)
                return true
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousVaultImportSummary)) { n in
                importSummaryPayload = n.object as? HarvousVaultImportSummaryPayload
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
                if let p = importSummaryPayload { Text(importSummaryMessage(p)) }
            }
            .onAppear {
                HarvousCalendarStudyNotifier.requestAccessAndPrewarm(modelContext: context)
                appRouter.applyPendingDeepLink()
            }
    }

    // MARK: - Helpers

    private func importSummaryMessage(_ p: HarvousVaultImportSummaryPayload) -> String {
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

#Preview {
    iPadRootView()
        .environmentObject(HarvousAppRouter())
        .environmentObject(SpaceStore())
        .modelContainer(for: [Note.self, StudyThread.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
}

#endif
