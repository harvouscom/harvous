import SwiftUI
#if os(iOS)
import UIKit
#endif

// MARK: - Avatar swatches (SwiftUI)

extension HarvousAvatarColorToken {
    @ViewBuilder
    func swatchFill(colorScheme: ColorScheme) -> some View {
        switch self {
        case .paper:
            RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                .fill(colorScheme == .dark ? Color.white.opacity(0.10) : Color.black.opacity(0.06))
                .overlay {
                    RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
                }
        case .blue, .yellow, .orange, .pink, .purple, .green:
            if let c = Color.thread(rawValue) {
                RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                    .fill(c)
            } else {
                RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                    .fill(Color.gray.opacity(0.3))
            }
        }
    }
}

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

// MARK: - Name & color

private struct SettingsEditProfileView: View {
    @AppStorage(HarvousSettingsStorageKeys.firstName) private var firstName = ""
    @AppStorage(HarvousSettingsStorageKeys.lastName) private var lastName = ""
    @AppStorage(HarvousSettingsStorageKeys.avatarColor) private var avatarColorRaw = HarvousAvatarColorToken.blue.rawValue

    @Environment(\.colorScheme) private var colorScheme

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
            Section("Avatar color") {
                Text("Same palette as spaces and threads on the web.")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 10)], spacing: 10) {
                    ForEach(HarvousAvatarColorToken.allCases) { token in
                        Button {
                            avatarColorRaw = token.rawValue
                        } label: {
                            VStack(spacing: 6) {
                                ZStack {
                                    token.swatchFill(colorScheme: colorScheme)
                                        .frame(width: 44, height: 44)
                                    if token.rawValue == avatarColorRaw {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.system(size: 18, weight: .semibold))
                                            .foregroundStyle(Color.accentColor)
                                            .shadow(color: .black.opacity(0.2), radius: 1, y: 1)
                                    }
                                }
                                Text(token.displayName)
                                    .font(HarvousTypography.footnote)
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(.primary)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 4)
            }
            Section {
                Text("Changes here are stored on this device. Open harvous.com and use Edit Name & Color to sync to the cloud.")
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
                Link(destination: URL(string: "https://harvous.com/sign-in")!) {
                    Label("Open Harvous sign-in", systemImage: "safari")
                }
                Link(destination: URL(string: "https://harvous.com/profile")!) {
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
                Link(destination: URL(string: "https://harvous.com/profile")!) {
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
                Link(destination: URL(string: "https://harvous.com/profile")!) {
                    Label("Open Refer My Friends on the web", systemImage: "person.2.badge.gearshape")
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - My data

private struct SettingsMyDataView: View {
    var body: some View {
        Form {
            Section {
                Text("Export your notes and account data, import backups, or delete your account. Destructive actions require confirmation on the web.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Open on the web") {
                Link(destination: URL(string: "https://harvous.com/profile")!) {
                    Label("My Data (export / import / delete)", systemImage: "externaldrive")
                }
            }
            Section("On this device") {
                Text("SwiftData notes live in this app’s container. Use the note list to manage individual notes; full account export follows the same tools as the web app once linked.")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .harvousGroupedSettingsForm()
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
                Link(destination: URL(string: "https://harvous.com")!) {
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
                Link(destination: URL(string: "https://harvous.com/profile")!) {
                    Label("Read the full letter on the web", systemImage: "heart.text.square")
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - Keyboard shortcuts

private struct SettingsKeyboardShortcutsView: View {
    private struct Row: Identifiable {
        let action: String
        let keys: String
        var id: String { action }
    }

    private let nativeRows: [Row] = [
        Row(action: "New note", keys: "⌘N"),
        Row(action: "Search", keys: "⌘K"),
    ]

    private let webStudyRows: [Row] = [
        Row(action: "New note (web)", keys: "⌘‘"),
        Row(action: "New thread (web)", keys: "⌘;"),
        Row(action: "Spotlight search (web)", keys: "⌘K"),
        Row(action: "Find page (web)", keys: "⌘F"),
        Row(action: "Close panel (web)", keys: "Esc"),
        Row(action: "Home / dashboard (web)", keys: "⇧⌘H"),
        Row(action: "Back / dismiss (web)", keys: "⌘←"),
        Row(action: "Space switcher (web)", keys: "⌥⌘S"),
        Row(action: "Details panel (web)", keys: "⇧⌘D"),
        Row(action: "Edit (web)", keys: "⇧⌘E"),
        Row(action: "Save (web)", keys: "⌘S"),
    ]

    var body: some View {
        Form {
            Section("Native Harvous (this app)") {
                Text("Shortcuts follow macOS conventions where they match the main window.")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
                ForEach(nativeRows) { row in
                    LabeledContent(row.action) {
                        Text(row.keys)
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Section("Harvous web (harvous.com)") {
                Text("When you study in the browser, these shortcuts match the web app’s keyboard layer (Cmd on Mac, Ctrl on Windows).")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
                ForEach(webStudyRows) { row in
                    LabeledContent(row.action) {
                        Text(row.keys)
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(.secondary)
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
            Section("Account") {
                ForEach(HarvousSettingsSidebarItem.accountItems) { item in
                    NavigationLink(value: HarvousYouNavigation.settingsDetail(item)) {
                        Label(item.title, systemImage: item.systemImage)
                    }
                }
            }
            Section("Study") {
                ForEach(HarvousSettingsSidebarItem.studyItems) { item in
                    NavigationLink(value: HarvousYouNavigation.settingsDetail(item)) {
                        Label(item.title, systemImage: item.systemImage)
                    }
                }
            }
            Section {
                NavigationLink(value: HarvousYouNavigation.settingsDetail(.referral)) {
                    Label(HarvousSettingsSidebarItem.referral.title, systemImage: HarvousSettingsSidebarItem.referral.systemImage)
                }
            }
            Section("Data & privacy") {
                NavigationLink(value: HarvousYouNavigation.settingsDetail(.myData)) {
                    Label(HarvousSettingsSidebarItem.myData.title, systemImage: HarvousSettingsSidebarItem.myData.systemImage)
                }
            }
            Section("Support & about") {
                ForEach(HarvousSettingsSidebarItem.supportItems) { item in
                    NavigationLink(value: HarvousYouNavigation.settingsDetail(item)) {
                        Label(item.title, systemImage: item.systemImage)
                    }
                }
            }
            if HarvousSettingsSidebarItem.keyboardShortcutsVisible(isPhone: isPhone) {
                Section("Advanced") {
                    NavigationLink(value: HarvousYouNavigation.settingsDetail(.keyboardShortcuts)) {
                        Label(HarvousSettingsSidebarItem.keyboardShortcuts.title, systemImage: HarvousSettingsSidebarItem.keyboardShortcuts.systemImage)
                    }
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
        Section("Account") {
            ForEach(HarvousSettingsSidebarItem.accountItems) { item in
                Label(item.title, systemImage: item.systemImage)
                    .tag(item)
            }
        }
        Section("Study") {
            ForEach(HarvousSettingsSidebarItem.studyItems) { item in
                Label(item.title, systemImage: item.systemImage)
                    .tag(item)
            }
        }
        Section("Referral") {
            Label(HarvousSettingsSidebarItem.referral.title, systemImage: HarvousSettingsSidebarItem.referral.systemImage)
                .tag(HarvousSettingsSidebarItem.referral)
        }
        Section("Data & privacy") {
            Label(HarvousSettingsSidebarItem.myData.title, systemImage: HarvousSettingsSidebarItem.myData.systemImage)
                .tag(HarvousSettingsSidebarItem.myData)
        }
        Section("Support & about") {
            ForEach(HarvousSettingsSidebarItem.supportItems) { item in
                Label(item.title, systemImage: item.systemImage)
                    .tag(item)
            }
        }
        Section("Advanced") {
            Label(HarvousSettingsSidebarItem.keyboardShortcuts.title, systemImage: HarvousSettingsSidebarItem.keyboardShortcuts.systemImage)
                .tag(HarvousSettingsSidebarItem.keyboardShortcuts)
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
