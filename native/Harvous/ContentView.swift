import SwiftUI
import SwiftData

struct ContentView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
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
        .onOpenURL { url in
            HarvousPendingRoute.applyURL(url)
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
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        NavigationSplitView {
            SidebarPanelView(selectedNote: $selectedNote)
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 340)
        } detail: {
            NavigationStack {
                NoteEditorView(note: $selectedNote, showInspector: $showInspector as Binding<Bool>)
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
                        // `.confirmationAction` maps to the trailing toolbar cluster on macOS (vs `.primaryAction`
                        // grouping with `.navigation` on the leading side). macOS 26+ can use `ToolbarSpacer` too.
                        ToolbarItemGroup(placement: .confirmationAction) {
                            Menu {
                                Button {
                                    withAnimation(HarvousAnimation.spring) { showInspector = true }
                                } label: {
                                    Label("Note details", systemImage: "sidebar.right")
                                }
                                .disabled(selectedNote == nil || showInspector)

                                Button {
                                    withAnimation(HarvousAnimation.spring) { showInspector = false }
                                } label: {
                                    Label("Hide note details", systemImage: "sidebar.left")
                                }
                                .disabled(selectedNote == nil || !showInspector)
                            } label: {
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 16, weight: .medium))
                            }
                            .buttonStyle(.bordered)
                            .menuIndicator(.hidden)
                            .help("More")
                            .disabled(selectedNote == nil)

                            HarvousMacProfileToolbarMenu()
                        }
                    }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .focusedSceneValue(\.newNoteAction, createNewNote)
        .focusedSceneValue(\.showSearchAction, { showSearch = true })
        .onChange(of: selectedNote?.id) { _, _ in
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
            HarvousPendingRoute.applyURL(url)
            applyMacDeepLink()
        }
        .onAppear {
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
        let note = Note()
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

// MARK: - iOS: Tab bar with overlay FAB

#if os(iOS)
struct iOSRootView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView(selection: $appRouter.iosSelectedTab) {
                NavigationStack {
                    NoteListColumn(
                        selectedNote: .constant(nil),
                        onNewNote: { appRouter.iosShowCompose = true }
                    )
                    .navigationTitle("Harvous")
                }
                .tabItem { Label("Notes", systemImage: "note.text") }
                .tag(0)

                NavigationStack {
                    SearchView()
                        .navigationTitle("Search")
                }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(1)

                NavigationStack {
                    LibraryView()
                        .navigationTitle("Library")
                }
                .tabItem { Label("Library", systemImage: "books.vertical") }
                .tag(2)

                NavigationStack(path: $appRouter.youNavigationStack) {
                    YouRootView()
                        .navigationDestination(for: HarvousYouNavigation.self) { nav in
                            switch nav {
                            case .settingsList:
                                IOSSettingsGroupedListView()
                            case .settingsDetail(let item):
                                HarvousSettingsFormView(item: item)
                            }
                        }
                }
                .tabItem { Label("You", systemImage: "person.circle") }
                .tag(3)
            }
            .tint(.harvousAccent)

            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                appRouter.iosShowCompose = true
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.harvousAccent, in: Circle())
                    .shadow(color: Color.harvousAccent.opacity(0.4), radius: 12, y: 4)
            }
            .padding(.trailing, 20)
            .padding(.bottom, 80)
        }
        .sheet(isPresented: $appRouter.iosShowCompose) {
            ComposeView()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .onAppear {
            HarvousRecallOSIntegration.onAppLaunch(modelContext: modelContext)
            HarvousCalendarStudyNotifier.requestAccessAndPrewarm(modelContext: modelContext)
            appRouter.applyPendingDeepLink()
        }
    }
}
#endif

#Preview {
    ContentView()
        .environmentObject(HarvousAppRouter())
        .modelContainer(for: [Note.self], inMemory: true)
}
