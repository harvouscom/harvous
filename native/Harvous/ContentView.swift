import SwiftUI
import SwiftData
#if os(iOS)
import UIKit
#endif

struct ContentView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.modelContext) private var modelContext
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
        .environment(\.harvousScriptureTheme, spaceStore.scriptureTheme)
        .task {
            spaceStore.bootstrapIfNeeded(modelContext: modelContext)
            _ = spaceStore.consumePendingJoinToken(modelContext: modelContext)
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
    @State private var showSearch = false
    @State private var showInspector = false
    @State private var threadNavPath = NavigationPath()
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        NavigationSplitView {
            SidebarPanelView(selectedNote: $selectedNote)
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 340)
        } detail: {
            NavigationStack(path: $threadNavPath) {
                NoteEditorView(
                    note: $selectedNote,
                    onNavigateToStudyThread: { threadNavPath.append($0) },
                    showInspector: $showInspector as Binding<Bool>
                )
                    .toolbar {
                        // `.navigation` is its own slot (like the space switcher). `.primaryAction` groups trailing controls.
                        ToolbarItem(placement: .navigation) {
                            Button(action: createNewNote) {
                                Image(systemName: "square.and.pencil")
                            }
                            .buttonStyle(.bordered)
                            .help("New Note (⌘N)")
                        }
                        if #available(macOS 26.0, *) {
                            ToolbarSpacer(.flexible)
                        }
                        // Note details: direct toggle (no ellipsis menu). Profile stays in the trailing cluster.
                        // `.confirmationAction` maps to the trailing toolbar cluster on macOS (vs `.primaryAction`
                        // grouping with `.navigation` on the leading side). macOS 26+ can use `ToolbarSpacer` too.
                        ToolbarItemGroup(placement: .confirmationAction) {
                            Button {
                                withAnimation(HarvousAnimation.spring) { showInspector.toggle() }
                            } label: {
                                if showInspector {
                                    Label("Hide note details", systemImage: "sidebar.left")
                                } else {
                                    Label("Note details", systemImage: "sidebar.right")
                                }
                            }
                            .buttonStyle(.bordered)
                            .help(showInspector ? "Hide note details" : "Show note details")
                            .disabled(selectedNote == nil)

                            HarvousMacProfileToolbarMenu()
                        }
                    }
                    .navigationDestination(for: UUID.self) { threadID in
                        ThreadWorkspaceView(threadID: threadID)
                    }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .focusedSceneValue(\.newNoteAction, createNewNote)
        .focusedSceneValue(\.showSearchAction, { showSearch = true })
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
                    context.delete(prev)
                    try? context.save()
                    HarvousRecallOSIntegration.afterNoteDeleted(id: pid, modelContext: context)
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
        .onAppear {
            spaceStore.bootstrapIfNeeded(modelContext: context)
            HarvousRecallOSIntegration.onAppLaunch(modelContext: context)
            HarvousCalendarStudyNotifier.requestAccessAndPrewarm(modelContext: context)
            applyMacDeepLink()
        }
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
            break
        }
    }

    private func createNewNote() {
        let note = Note(spaceId: spaceStore.activeSpaceUUID())
        context.insert(note)
        try? context.save()
        HarvousRecallOSIntegration.afterNotePersisted(note: note, modelContext: context)
        selectedNote = note
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

    /// Foreground for the toolbar person glyph (follows Name & color; readable on pastel disk).
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
                Label("Settings…", systemImage: "gearshape")
            }

            Button {
                appRouter.macSettingsDeepLink = .editProfile
                openWindow(id: HarvousMacPreferencesWindow.sceneID)
            } label: {
                Label("Name & color…", systemImage: "person.crop.circle")
            }

            Divider()

            Button {
                openURL(URL(string: "https://harvous.com/profile")!)
            } label: {
                Label("Manage account on the web…", systemImage: "safari")
            }
        } label: {
            ZStack {
                Circle()
                    .fill(avatarFill)
                    .frame(width: 28, height: 28)
                Image(systemName: "person.fill")
                    .font(.system(size: 12, weight: .medium))
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

    var body: some View {
        NavigationStack {
            Group {
                switch appRouter.iosListSurface {
                case .notes:
                    HomeHubView(onNewNote: { appRouter.iosShowCompose = true })
                case .collections:
                    LibraryView(
                        externalSearchText: $appRouter.iosInlineSearchText,
                        externalSearchPresented: $appRouter.iosInlineSearchPresented
                    )
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            SpaceSwitcherView()
                        }
                    }
                case .more:
                    // .more is now presented as a sheet; this branch is a fallback only.
                    HomeHubView(onNewNote: { appRouter.iosShowCompose = true })
                }
            }
        }
        .tint(.harvousAccent)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Group {
                if let p = appRouter.iosActiveNoteEditorChromeProxy,
                   p.isBodyFirstResponder,
                   p.activeScripturePill == nil {
                    NoteToolbar(proxy: p)
                } else {
                    HarvousIOSInlineBottomChromeRow()
                        .environmentObject(appRouter)
                }
            }
        }
        .sheet(isPresented: $appRouter.iosShowCompose) {
            ComposeView()
                .environmentObject(spaceStore)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
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
            // Notes uses the bottom search pill + Notes sheet only (no inline `.searchable` presentation).
            if newSurface == .notes {
                appRouter.iosInlineSearchPresented = false
            }
        }
        .onAppear {
            HarvousRecallOSIntegration.onAppLaunch(modelContext: modelContext)
            HarvousCalendarStudyNotifier.requestAccessAndPrewarm(modelContext: modelContext)
            appRouter.applyPendingDeepLink()
        }
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
                        Image(systemName: "magnifyingglass")
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

private struct HarvousIOSInlineBottomChromeRow: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var searchFocused: Bool

    private var hasSearchText: Bool {
        !appRouter.iosInlineSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            listPickerOrb
            searchPill
            composeOrb
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }

    private var listPickerOrb: some View {
        Menu {
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.notes)
            } label: {
                Label("Notes", systemImage: "note.text")
            }
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.collections)
            } label: {
                Label("Collections", systemImage: "rectangle.stack")
            }
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.more)
            } label: {
                Label("More", systemImage: "ellipsis.circle")
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease")
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(Color.primary.opacity(0.85))
                .frame(width: 44, height: 44)
                .background { floatingChromeBackground(shape: Circle()) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("List and filters")
    }

    @ViewBuilder
    private var searchPill: some View {
        if appRouter.iosListSurface == .notes {
            inlineSearchPill
        } else {
            collectionsSearchPillButton
        }
    }

    private var inlineSearchPill: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .regular))
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
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 17, weight: .regular))
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
    }

    private var collectionsSearchPillButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            if appRouter.iosListSurface == .more {
                appRouter.selectIOSListSurface(.notes)
                searchFocused = true
                return
            }
            appRouter.iosInlineSearchPresented = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(Color.primary.opacity(0.6))
                Text(hasSearchText ? appRouter.iosInlineSearchText : "Search")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(hasSearchText ? Color.primary.opacity(0.9) : Color.primary.opacity(0.55))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .frame(maxWidth: .infinity)
            .background { floatingChromeBackground(shape: Capsule(style: .continuous)) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Search")
    }

    private var composeOrb: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            appRouter.iosShowCompose = true
        } label: {
            Image(systemName: "square.and.pencil")
                .font(.system(size: 20, weight: .regular))
                .foregroundStyle(Color.primary.opacity(0.9))
                .frame(width: 44, height: 44)
                .background { floatingChromeBackground(shape: Circle()) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("New note")
    }

    @ViewBuilder
    private func floatingChromeBackground<S: InsettableShape>(shape: S) -> some View {
        if #available(iOS 26.0, *) {
            shape
                .fill(Color.clear)
                .glassEffect(in: shape)
        } else {
            shape
                .fill(.ultraThinMaterial)
                .overlay {
                    shape.strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.08 : 0.06), lineWidth: 0.5)
                }
                .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.35 : 0.08), radius: 6, x: 0, y: 2)
        }
    }
}
#endif

#Preview {
    ContentView()
        .environmentObject(HarvousAppRouter())
        .environmentObject(SpaceStore())
        .modelContainer(for: [Note.self, StudyThread.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
}
