import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#endif

// MARK: - Settings detail background

private extension Color {
    static var harvousSettingsDetailBackground: Color {
        #if os(iOS)
        Color(uiColor: .systemGroupedBackground)
        #else
        Color.clear
        #endif
    }
}

// MARK: - Settings form chrome

private extension View {
    /// macOS Settings uses the system control accent; iOS You → Settings keeps Harvous blue.
    @ViewBuilder
    func harvousGroupedSettingsForm() -> some View {
        #if os(iOS)
        self
            .formStyle(.grouped)
            .tint(.harvousAccent)
        #else
        self.formStyle(.grouped)
        #endif
    }
}

// MARK: - Populated settings (shared iOS + macOS)

// MARK: - Detail router

struct HarvousSettingsFormView: View {
    let item: HarvousSettingsSidebarItem

    var body: some View {
        Group {
            switch item {
            case .editProfile:
                SettingsEditProfileView()
            case .emailPassword:
                SettingsEmailPasswordView()
            case .subscription:
                SettingsSubscriptionView()
            case .defaultBible:
                SettingsDefaultBibleView()
            case .myChurch:
                SettingsMyChurchView()
            case .lockPin:
                SettingsLockPINView()
            case .referral:
                SettingsReferralView()
            case .myData:
                SettingsMyDataView()
            case .support:
                SettingsSupportView()
            case .aboutFounder:
                SettingsAboutFounderView()
            case .keyboardShortcuts:
                SettingsKeyboardShortcutsView()
            }
        }
        #if os(iOS)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.harvousSettingsDetailBackground)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .navigationTitle(item.title)
    }
}

// MARK: - Name

private struct SettingsEditProfileView: View {
    @AppStorage(HarvousSettingsStorageKeys.firstName) private var firstName = ""
    @AppStorage(HarvousSettingsStorageKeys.lastName) private var lastName = ""

    var body: some View {
        Form {
            Section {
                Text("How you appear in Harvous. When you use the web app while signed in, these fields sync to your account.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Name") {
                TextField("First name", text: $firstName)
                    .textContentType(.givenName)
                TextField("Last name", text: $lastName)
                    .textContentType(.familyName)
            }
            Section {
                Text("Changes here are stored on this device. Open app.harvous.com and use Profile to sync to the cloud.")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - Email & password

private struct SettingsEmailPasswordView: View {
    var body: some View {
        Form {
            Section {
                Text("Harvous uses Clerk for sign-in, email verification, and password changes. The native app does not embed the full account flow yet.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Manage on the web") {
                Link(destination: URL(string: "https://app.harvous.com/sign-in")!) {
                    Label("Open Harvous sign-in", systemImage: "safari")
                }
                Link(destination: URL(string: "https://app.harvous.com/profile")!) {
                    Label("Open profile on the web", systemImage: "person.crop.circle")
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - Subscription

private struct SettingsSubscriptionView: View {
    var body: some View {
        Form {
            Section {
                Text("Plans and payment methods are managed in your Harvous account on the web (Clerk + billing).")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section {
                Link(destination: URL(string: "https://app.harvous.com/profile")!) {
                    Label("Manage subscription on the web", systemImage: "creditcard")
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - Default Bible

private struct SettingsDefaultBibleView: View {
    @AppStorage(HarvousStudyDefaults.defaultTranslationStorageKey) private var translationId = "NET"

    var body: some View {
        Form {
            Section {
                Text("Used for scripture pills, featured content, and defaults when you study on the web. Matches `UserMetadata.defaultTranslation`.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Translation") {
                Picker("Preferred translation", selection: $translationId) {
                    ForEach(HarvousTranslationChoice.ordered) { row in
                        Text("\(row.name) (\(row.id))").tag(row.id)
                    }
                }
                .pickerStyle(.inline)
            }
            Section {
                Text("Stored locally until the native app connects to your Harvous API. On the web, changes save immediately from My Preferences.")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - My church

private struct SettingsMyChurchView: View {
    @AppStorage(HarvousSettingsStorageKeys.churchName) private var churchName = ""
    @AppStorage(HarvousSettingsStorageKeys.churchCity) private var churchCity = ""
    @AppStorage(HarvousSettingsStorageKeys.churchState) private var churchState = ""
    @AppStorage(HarvousSettingsStorageKeys.churchCountry) private var churchCountry = ""

    var body: some View {
        Form {
            Section {
                Text("Optional context for your study life. On the web, these fields sync with My Church in preferences.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Church") {
                TextField("Church name", text: $churchName)
                TextField("City", text: $churchCity)
                TextField("State / region", text: $churchState)
                TextField("Country", text: $churchCountry)
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - Lock PIN

private struct SettingsLockPINView: View {
    @State private var pinEntry = ""
    @State private var pinConfirm = ""

    var body: some View {
        Form {
            Section {
                Text("A PIN can protect locked notes in Harvous. On the web, your PIN is hashed on the server; the native app will use the same API when sign-in is connected.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Set PIN (preview)") {
                SecureField("New PIN", text: $pinEntry)
                    .textContentType(.newPassword)
                SecureField("Confirm PIN", text: $pinConfirm)
                Text("Not saved yet — wiring to `/api/user/...` comes with account linking.")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - Referral

private struct SettingsReferralView: View {
    var body: some View {
        Form {
            Section {
                Text("Invite friends to Harvous. When they join and study, you can earn bonus notes (see referral terms on the web).")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section {
                Link(destination: URL(string: "https://app.harvous.com/profile")!) {
                    Label("Open Refer My Friends on the web", systemImage: "person.2.badge.gearshape")
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - My data

private struct VaultStatusCard: View {
    let mirrorEnabled: Bool
    let exportedNoteCount: Int
    let lastWrite: Date?

    private var lastSyncLabel: String {
        guard let d = lastWrite else { return "—" }
        return "Last synced \(d.formatted(date: .abbreviated, time: .shortened))"
    }

    private var statusTitle: String {
        if mirrorEnabled {
            if exportedNoteCount == 1 { return "Mirroring active — 1 note" }
            return "Mirroring active — \(exportedNoteCount) notes"
        }
        return "Mirroring off"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(mirrorEnabled ? Color.green : Color.secondary.opacity(0.45))
                .frame(width: 10, height: 10)
                .padding(.top, 4)
            VStack(alignment: .leading, spacing: 4) {
                Text(statusTitle)
                    .font(HarvousTypography.body)
                Text(lastSyncLabel)
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.secondary.opacity(0.12))
        }
    }
}

private struct SettingsMyDataView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore

    @State private var mirrorEnabled = HarvousVaultPreferences.isMirrorEnabled
    @State private var showVaultFolderImporter = false
    @State private var showFileImporter = false
    @State private var showRebuildConfirm = false
    @State private var rebuildResultMessage: String?
    @State private var showRebuildResult = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VaultStatusCard(
                mirrorEnabled: mirrorEnabled,
                exportedNoteCount: HarvousVaultPreferences.cachedExportedNoteCount,
                lastWrite: HarvousVaultPreferences.lastVaultWriteAt
            )
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            Form {
                Section("Vault mirror") {
                    Toggle("Mirror notes to Markdown", isOn: $mirrorEnabled)
                        .onChange(of: mirrorEnabled) { _, on in
                            HarvousVaultPreferences.isMirrorEnabled = on
                            if on {
                                HarvousVaultExporter.rewriteAllNotes(modelContext: modelContext)
                            }
                        }

                    if mirrorEnabled {
                        LabeledContent("Location") {
                            Text(HarvousVaultLocation.vaultKindDescription())
                                .foregroundStyle(.secondary)
                        }

                        #if os(macOS)
                        Button("Open vault in Finder") {
                            HarvousVaultLocation.revealVaultRootInSystem()
                        }
                        #else
                        Button("Copy vault path") {
                            HarvousVaultLocation.revealVaultRootInSystem()
                        }
                        #endif
                    }
                }

                Section("Import") {
                    Button("Import files or folders…") {
                        showFileImporter = true
                    }

                    Text(
                        "Accepts Markdown, HTML, ENEX, DOCX, RTF (ZIP on Mac). Obsidian vaults, Notion Markdown zips, Evernote ENEX, and Apple Notes (via HTML/Markdown export) work too."
                    )
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
                }

                Section {
                    DisclosureGroup("Advanced") {
                        Button("Choose external vault folder…") {
                            showVaultFolderImporter = true
                        }

                        if HarvousVaultLocation.isUsingExternalBookmark {
                            Button("Stop using external folder") {
                                HarvousVaultPreferences.clearExternalVaultBookmark()
                                if HarvousVaultPreferences.isMirrorEnabled {
                                    HarvousVaultExporter.rewriteAllNotes(modelContext: modelContext)
                                }
                            }
                            .foregroundStyle(.secondary)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Button("Rebuild library from vault…", role: .destructive) {
                                showRebuildConfirm = true
                            }
                            Text(
                                "Re-reads vault Markdown into this library. Missing files on disk do not remove notes from this library."
                            )
                            .font(HarvousTypography.footnote)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.top, 4)
                    }
                }

                Section("On the web") {
                    Link(destination: URL(string: "https://app.harvous.com/profile")!) {
                        Label("My Data (export / import / delete)", systemImage: "externaldrive")
                    }
                }
            }
            .harvousGroupedSettingsForm()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear { mirrorEnabled = HarvousVaultPreferences.isMirrorEnabled }
        .fileImporter(
            isPresented: $showVaultFolderImporter,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                let ok = url.startAccessingSecurityScopedResource()
                defer { if ok { url.stopAccessingSecurityScopedResource() } }
                do {
                    try HarvousVaultLocation.setExternalVaultFolder(url)
                    if HarvousVaultPreferences.isMirrorEnabled {
                        HarvousVaultExporter.rewriteAllNotes(modelContext: modelContext)
                    }
                } catch {
                    print("[Settings] vault folder bookmark failed: \(error)")
                }
            case .failure(let err):
                print("[Settings] vault folder pick failed: \(err)")
            }
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls):
                var accesses: [URL] = []
                for u in urls {
                    if u.startAccessingSecurityScopedResource() {
                        accesses.append(u)
                    }
                }
                defer {
                    for u in accesses {
                        u.stopAccessingSecurityScopedResource()
                    }
                }
                _ = HarvousVaultImporter.importItems(
                    urls: urls,
                    targetSpaceId: spaceStore.activeSpaceUUID(),
                    modelContext: modelContext,
                    surfaceImportSummary: true
                )
            case .failure(let err):
                print("[Settings] import pick failed: \(err)")
            }
        }
        .confirmationDialog(
            "Rebuild merges vault Markdown and highlight sidecars into this device library. Notes on disk update or add rows; nothing is deleted if a file is missing.",
            isPresented: $showRebuildConfirm,
            titleVisibility: .visible
        ) {
            Button("Rebuild", role: .destructive) {
                let report = HarvousVaultImporter.rebuildLibraryFromVault(modelContext: modelContext)
                rebuildResultMessage = report.summaryLine
                showRebuildResult = true
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Rebuild finished", isPresented: $showRebuildResult) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(rebuildResultMessage ?? "")
        }
    }
}

// MARK: - Support

private struct SettingsSupportView: View {
    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""
        return b.isEmpty ? v : "\(v) (\(b))"
    }

    var body: some View {
        Form {
            Section("This app") {
                LabeledContent("Version", value: appVersion)
            }
            Section("Help") {
                Link(destination: URL(string: "https://app.harvous.com")!) {
                    Label("Harvous website", systemImage: "safari")
                }
                Link(destination: URL(string: "mailto:support@harvous.com")!) {
                    Label("Email support", systemImage: "envelope")
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - About / founder letter

private struct SettingsAboutFounderView: View {
    var body: some View {
        Form {
            Section {
                Text(
                    "Harvous exists to help you dwell on Scripture and remember what God is teaching you—without losing your notes in a feed. "
                        + "Thank you for studying with us."
                )
                .font(HarvousTypography.subheadline)
                .foregroundStyle(.primary)
            }
            Section {
                Link(destination: URL(string: "https://app.harvous.com/profile")!) {
                    Label("Read the full letter on the web", systemImage: "heart.text.square")
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - Keyboard shortcuts

/// Per-key “keycap” styling for settings shortcut rows (matches compact macOS key legend affordance).
private struct SettingsShortcutKeycapsRow: View {
    let keys: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(keys.enumerated()), id: \.offset) { _, ch in
                keyCap(String(ch))
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    @ViewBuilder
    private func keyCap(_ symbol: String) -> some View {
        Text(symbol)
            .font(.system(size: 12.5, weight: .medium, design: .rounded))
            .foregroundStyle(.primary.opacity(0.88))
            .multilineTextAlignment(.center)
            .frame(minWidth: 24, minHeight: 22)
            .padding(.horizontal, 5)
            .padding(.vertical, 3)
            .background {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(keyCapFill)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .strokeBorder(keyCapBorder, lineWidth: 1)
            }
            .shadow(color: Color.black.opacity(0.07), radius: 0, x: 0, y: 1)
    }

    private var keyCapFill: Color {
        #if os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color(uiColor: .secondarySystemGroupedBackground)
        #endif
    }

    private var keyCapBorder: Color {
        #if os(macOS)
        Color(nsColor: .separatorColor).opacity(0.9)
        #else
        Color(uiColor: .separator).opacity(0.85)
        #endif
    }
}

private struct SettingsKeyboardShortcutsView: View {
    private struct Row: Identifiable {
        let action: String
        let keys: String
        var id: String { action }
    }

    #if os(macOS)
    private let nativeRows: [Row] = [
        Row(action: "New note", keys: "⌘N"),
        Row(action: "Search", keys: "⌘K"),
        Row(action: "Settings", keys: "⌘,"),
        Row(action: "Focus note list", keys: "⌘0"),
        Row(action: "Daily note", keys: "⌘T"),
        Row(action: "Random revisit", keys: "⌃⌘R"),
        Row(action: "Insert note wikilink", keys: "⇧⌘L"),
        Row(action: "New connected note", keys: "⌘⌥N"),
        Row(action: "Delete note", keys: "⌃⌘⌫"),
        Row(action: "Toggle note details", keys: "⌘⌥I"),
        Row(action: "Next note", keys: "⌃⌘↓"),
        Row(action: "Previous note", keys: "⌃⌘↑"),
        Row(action: "Strikethrough", keys: "⌘⇧X"),
        Row(action: "Heading 2", keys: "⌘⌥2"),
        Row(action: "Heading 3", keys: "⌘⌥3"),
        Row(action: "Heading 4", keys: "⌘⌥4"),
        Row(action: "Body text", keys: "⌘⌥0"),
        Row(action: "Bulleted list", keys: "⌘⇧8"),
        Row(action: "Numbered list", keys: "⌘⇧7"),
        Row(action: "Add link", keys: "⌘L"),
        Row(action: "Inline code", keys: "⌘⌥C"),
        Row(action: "Next scripture pill", keys: "⌃⌘]"),
        Row(action: "Previous scripture pill", keys: "⌃⌘["),
        Row(action: "Toggle scripture pill dock", keys: "⌘⌥P"),
        Row(action: "Next study highlight", keys: "⌃⌘⇧]"),
        Row(action: "Previous study highlight", keys: "⌃⌘⇧["),
        Row(action: "Toggle highlight dock", keys: "⌘⌥H"),
        Row(action: "Remove highlight", keys: "⌘⌥⌫"),
    ]
    #else
    private let nativeRows: [Row] = [
        Row(action: "New note", keys: "⌘N"),
        Row(action: "Search", keys: "⌘K"),
        Row(action: "Daily note", keys: "⌘T"),
        Row(action: "Random revisit", keys: "⌃⌘R"),
        Row(action: "Insert note wikilink", keys: "⇧⌘L"),
    ]
    #endif

    var body: some View {
        Form {
            Section {
                ForEach(nativeRows) { row in
                    HStack(alignment: .center, spacing: 12) {
                        Text(row.action)
                            .font(HarvousTypography.body)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        SettingsShortcutKeycapsRow(keys: row.keys)
                    }
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - iOS: You tab + grouped settings

#if os(iOS)
struct YouRootView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.harvousAccent.opacity(0.2))
                            Text("HV")
                                .font(.system(size: 20, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color.harvousAccent)
                        }
                        .frame(width: 56, height: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("You")
                                .font(.title2.weight(.semibold))
                            Text("Harvous on this device")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }

            Section("Go to") {
                Button {
                    appRouter.selectIOSListSurface(.notes)
                } label: {
                    Label("Notes", systemImage: "note.text")
                }
                Button {
                    appRouter.selectIOSListSurface(.notes)
                    appRouter.iosNotesFilterSearchPresented = true
                } label: {
                    Label("Search", systemImage: "magnifyingglass")
                }
                Button {
                    appRouter.selectIOSListSurface(.collections)
                } label: {
                    Label("Collections", systemImage: "rectangle.stack")
                }
                Button {
                    appRouter.selectIOSListSurface(.highlights)
                } label: {
                    Label("Highlights", systemImage: "highlighter")
                }
                Button {
                    appRouter.selectIOSListSurface(.scripture)
                } label: {
                    Label("Scripture", systemImage: "book.closed.fill")
                }
            }

            Section {
                NavigationLink(value: HarvousYouNavigation.settingsList) {
                    Label("Settings", systemImage: "gearshape")
                }
            }
        }
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct IOSSettingsGroupedListView: View {
    private var isPhone: Bool {
        UIDevice.current.userInterfaceIdiom == .phone
    }

    var body: some View {
        List {
            ForEach(
                HarvousSettingsSidebarItem.allSettingsRows(
                    includeKeyboardShortcuts: HarvousSettingsSidebarItem.keyboardShortcutsVisible(isPhone: isPhone)
                )
            ) { item in
                NavigationLink(value: HarvousYouNavigation.settingsDetail(item)) {
                    Label(item.title, systemImage: item.systemImage)
                }
            }
        }
        .navigationTitle("Settings")
    }
}

#endif

// MARK: - macOS: Preferences (`Window` scene)

#if os(macOS)
/// macOS 15+: hides the extra toolbar slab under traffic lights (matches document window treatment).
private struct MacPreferencesWindowToolbarChrome: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) {
            content
                .toolbarBackground(.clear, for: .windowToolbar)
                .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
        } else {
            content
        }
    }
}

/// Preferences `Window` (see `HarvousApp`): same chrome as the document window, unified title bar with pane
/// `navigationTitle`, back/forward in `.navigation`, sidebar list matches main-window toolbar transparency.
struct MacPreferencesRootView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @State private var history: [HarvousSettingsSidebarItem] = [.editProfile]
    @State private var historyIndex: Int = 0

    private var currentItem: HarvousSettingsSidebarItem { history[historyIndex] }

    private var sidebarSelection: Binding<HarvousSettingsSidebarItem> {
        Binding(
            get: { history[historyIndex] },
            set: { selectPane($0) }
        )
    }

    var body: some View {
        NavigationSplitView {
            List(selection: sidebarSelection) {
                settingsSections
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 280)
            .navigationTitle("")
            .toolbar(removing: .sidebarToggle)
            .toolbarBackground(.clear, for: .automatic)
            .modifier(HarvousSidebarTransparentWindowToolbar())
        } detail: {
            NavigationStack {
                HarvousSettingsFormView(item: currentItem)
                    .toolbar {
                        ToolbarItem(placement: .navigation) {
                            Button(action: goBack) {
                                Image(systemName: "chevron.backward")
                            }
                            .buttonStyle(.bordered)
                            .help("Back")
                            .disabled(historyIndex == 0)
                        }
                        ToolbarItem(placement: .navigation) {
                            Button(action: goForward) {
                                Image(systemName: "chevron.forward")
                            }
                            .buttonStyle(.bordered)
                            .help("Forward")
                            .disabled(historyIndex >= history.count - 1)
                        }
                        if #available(macOS 26.0, *) {
                            ToolbarSpacer(.flexible)
                        }
                    }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .modifier(MacPreferencesWindowToolbarChrome())
        .onChange(of: appRouter.macSettingsDeepLink) { _, newVal in
            guard let detail = newVal else { return }
            selectPane(detail)
            appRouter.macSettingsDeepLink = nil
        }
    }

    @ViewBuilder
    private var settingsSections: some View {
        Section {
            ForEach(HarvousSettingsSidebarItem.allSettingsRows(includeKeyboardShortcuts: true)) { item in
                Label(item.title, systemImage: item.systemImage)
                    .tag(item)
            }
        }
    }

    private func selectPane(_ item: HarvousSettingsSidebarItem) {
        guard item != currentItem else { return }
        if historyIndex < history.count - 1 {
            history.removeSubrange((historyIndex + 1)...)
        }
        history.append(item)
        historyIndex = history.count - 1
    }

    private func goBack() {
        guard historyIndex > 0 else { return }
        historyIndex -= 1
    }

    private func goForward() {
        guard historyIndex < history.count - 1 else { return }
        historyIndex += 1
    }
}
#endif
