import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#endif
#if os(macOS)
import AppKit
#endif
#if canImport(ClerkKit)
import ClerkKit
#endif
#if canImport(ClerkKitUI)
import ClerkKitUI
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

extension View {
    /// macOS Settings uses the system control accent; iOS You → Settings keeps Harvous blue.
    @ViewBuilder
    func harvousGroupedSettingsForm() -> some View {
        #if os(iOS)
        self
            .formStyle(.grouped)
            .tint(.harvousAccent)
            .harvousListMenuTypography()
        #else
        self
            .formStyle(.grouped)
            .harvousListMenuTypography()
        #endif
    }
}

#if os(iOS)
/// List / form row with Harvous catalog icon (replaces `Label` + SF Symbol in the You sheet).
private struct HarvousIOSSettingsGlyphRow: View {
    let title: String
    let assetName: String
    var iconEdgePt: CGFloat = HarvousFAIconMetrics.catalogGlyphBoxPt

    var body: some View {
        HStack(spacing: 12) {
            HarvousFAGlyph(assetName: assetName, edgePt: iconEdgePt)
                .foregroundStyle(Color.primary)
                .frame(width: 28, alignment: .center)
            Text(title)
                .font(HarvousTypography.settingsListRow)
                .foregroundStyle(Color.primary)
        }
    }
}
#endif

// MARK: - Populated settings (shared iOS + macOS)

// MARK: - Detail router

struct HarvousSettingsFormView: View {
    let item: HarvousSettingsSidebarItem

    var body: some View {
        Group {
            switch item {
            case .account:
                SettingsAccountView()
            case .subscription:
                SettingsSubscriptionView()
            case .defaultBible:
                SettingsDefaultBibleView()
            case .myChurch:
                SettingsMyChurchView()
            case .appearance:
                SettingsAppearanceView()
            case .lockPin:
                SettingsLockPINView()
            case .referral:
                SettingsReferralView()
            case .mySharing:
                SettingsSharingView()
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
        .background(item == .appearance ? Color.clear : Color.harvousSettingsDetailBackground)
        .navigationBarTitleDisplayMode(.inline)
        .harvousIOSGlassOverCanvasShell()
        #endif
        .navigationTitle(item.title)
    }
}

// MARK: - Account (identity header + in-place drill-down rows)

/// One row per account screen; tapping pushes the screen in place on the settings stack.
private struct SettingsAccountRow: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let route: HarvousAccountRoute
}

private let settingsAccountRows: [SettingsAccountRow] = [
    SettingsAccountRow(title: "Edit profile", subtitle: "Name and photo", route: .editProfile),
    SettingsAccountRow(title: "Email addresses", subtitle: "Add, verify, or set primary", route: .emails),
    SettingsAccountRow(title: "Change password", subtitle: "Update your password", route: .password),
    SettingsAccountRow(title: "Security", subtitle: "Active devices and account", route: .security),
]

/// Matches web `PrototypeAccountPage`: identity header + one-tap rows that drill into
/// account sub-screens **in place** (no modal). Log out lives in the profile menu root.
private struct SettingsAccountView: View {
    @AppStorage(HarvousSettingsStorageKeys.firstName) private var firstName = ""
    @AppStorage(HarvousSettingsStorageKeys.lastName) private var lastName = ""
    @State private var bridge = HarvousClerkBridge.shared

    private var profile: HarvousUserProfile? { bridge.currentProfile }

    private var displayName: String {
        if let p = profile, !p.displayName.isEmpty { return p.displayName }
        let parts = [
            firstName.trimmingCharacters(in: .whitespaces),
            lastName.trimmingCharacters(in: .whitespaces)
        ].filter { !$0.isEmpty }
        if !parts.isEmpty { return parts.joined(separator: " ") }
        return "Your account"
    }

    private var emailLine: String? {
        guard let email = profile?.primaryEmail?.trimmingCharacters(in: .whitespacesAndNewlines),
              !email.isEmpty
        else { return nil }
        return email
    }

    var body: some View {
        Group {
            #if os(macOS)
            macAccountBody
            #else
            iosAccountBody
            #endif
        }
        .background(Color.harvousSettingsDetailBackground)
        // One stack-wide registration covers every account push, including nested ones
        // (Emails → Add email → Verify) from the sub-screens.
        .navigationDestination(for: HarvousAccountRoute.self) { route in
            AccountRouteView(route: route)
        }
        .onAppear { bridge.refreshProfile() }
    }

    @ViewBuilder
    private var identityHeader: some View {
        HStack(spacing: 12) {
            HarvousProfileOrb(imageUrl: profile?.imageUrl, size: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(HarvousTypography.title)
                if let emailLine {
                    Text(emailLine)
                        .font(HarvousTypography.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    #if os(macOS)
    private var macAccountBody: some View {
        Form {
            Section {
                identityHeader
                    .padding(.vertical, 4)
            }
            Section {
                ForEach(settingsAccountRows) { row in
                    // macOS Form adds its own disclosure chevron, so hide the manual one.
                    NavigationLink(value: row.route) {
                        SettingsAccountRowLabel(title: row.title, subtitle: row.subtitle, showChevron: false)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
    #endif

    #if os(iOS)
    private var iosAccountBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                identityHeader
                    .padding(.horizontal, 4)

                VStack(spacing: 1) {
                    ForEach(settingsAccountRows) { row in
                        NavigationLink(value: row.route) {
                            SettingsAccountRowLabel(title: row.title, subtitle: row.subtitle)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(Color(uiColor: .secondarySystemGroupedBackground))
                        }
                        .buttonStyle(.plain)
                        .contentShape(Rectangle())
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
    #endif
}

private struct SettingsAccountRowLabel: View {
    let title: String
    let subtitle: String
    var showChevron: Bool = true

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(HarvousTypography.body)
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if showChevron {
                Image(systemName: "chevron.right")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }
}

// MARK: - Subscription

private struct SettingsSubscriptionView: View {
    var body: some View {
        Form {
            Section {
                Text("Manage your plan and payment methods in your account on the web.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section {
                Link(destination: URL(string: "https://app.harvous.com/profile")!) {
                    #if os(iOS)
                    HarvousIOSSettingsGlyphRow(title: "Manage subscription on the web", assetName: "Harvous.CreditCard")
                    #else
                    Label("Manage subscription on the web", systemImage: "creditcard")
                    #endif
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
                Picker(selection: $translationId) {
                    ForEach(HarvousTranslationChoice.ordered) { row in
                        Text("\(row.name) (\(row.id))").tag(row.id)
                    }
                } label: {
                    EmptyView()
                }
                .pickerStyle(.inline)
                .labelsHidden()
                .accessibilityLabel("Default translation")
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - My church

private struct SettingsMyChurchView: View {
    // Local cache so the form is populated offline and on first paint; the server
    // is authoritative when signed in (hydrated on appear, written back on save).
    @AppStorage(HarvousSettingsStorageKeys.churchName) private var churchName = ""
    @AppStorage(HarvousSettingsStorageKeys.churchCity) private var churchCity = ""
    @AppStorage(HarvousSettingsStorageKeys.churchState) private var churchState = ""
    @AppStorage(HarvousSettingsStorageKeys.churchCountry) private var churchCountry = ""

    @State private var bridge = HarvousClerkBridge.shared
    @State private var isHydrating = false
    @State private var didHydrate = false
    @State private var isSaving = false
    @State private var didSave = false
    @State private var saveError: String?

    private var isSignedIn: Bool { bridge.currentProfile != nil }

    var body: some View {
        Form {
            Section {
                Text(isSignedIn
                     ? "Optional details about your church. These sync across your devices."
                     : "Optional details about your church. Stored on this device only — sign in to sync them to your account.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
            }
            Section("Church") {
                TextField("Church name", text: $churchName)
                TextField("City", text: $churchCity)
                TextField("State / region", text: $churchState)
                TextField("Country", text: $churchCountry)
            }
            if isSignedIn {
                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            Text(didSave ? "Saved" : "Save")
                            if isSaving {
                                Spacer()
                                ProgressView().controlSize(.small)
                            }
                        }
                    }
                    .disabled(isSaving || isHydrating)
                    if let saveError {
                        Text(saveError)
                            .font(HarvousTypography.footnote)
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .harvousGroupedSettingsForm()
        .onChange(of: churchName) { _, _ in didSave = false }
        .onChange(of: churchCity) { _, _ in didSave = false }
        .onChange(of: churchState) { _, _ in didSave = false }
        .onChange(of: churchCountry) { _, _ in didSave = false }
        .task { await hydrate() }
        // Profile can finish loading after first paint — hydrate once it's available.
        .onChange(of: isSignedIn) { _, signedIn in
            if signedIn { Task { await hydrate() } }
        }
    }

    private func hydrate() async {
        guard isSignedIn, !isHydrating, !didHydrate else { return }
        isHydrating = true
        defer { isHydrating = false }
        guard let profile = try? await HarvousAPIClient.shared.getProfile() else { return }
        churchName = profile.churchName ?? ""
        churchCity = profile.churchCity ?? ""
        churchState = profile.churchState ?? ""
        churchCountry = profile.churchCountry ?? ""
        didHydrate = true
    }

    private func save() async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            _ = try await HarvousAPIClient.shared.updateChurch(
                name: churchName,
                city: churchCity,
                state: churchState,
                country: churchCountry
            )
            didSave = true
        } catch {
            saveError = error.localizedDescription
        }
    }
}

// MARK: - Lock PIN

private struct SettingsLockPINView: View {
    @State private var pinEntry = ""
    @State private var pinConfirm = ""

    var body: some View {
        Form {
            Section {
                Text("Your Harvous lock PIN is account-wide — the same four digits lock and unlock every protected note on your account.")
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
                    #if os(iOS)
                    HarvousIOSSettingsGlyphRow(title: "Open Refer My Friends on the web", assetName: "Harvous.Users")
                    #else
                    Label("Open Refer My Friends on the web", systemImage: "person.2.badge.gearshape")
                    #endif
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - My data

/// Wraps exported account bytes so `.fileExporter` can write them — presents the
/// macOS save panel and the iOS Files picker from one cross-platform API.
private struct HarvousExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.plainText, .commaSeparatedText] }
    static var writableContentTypes: [UTType] {
        [.plainText, .commaSeparatedText, UTType(filenameExtension: "md") ?? .plainText]
    }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

private struct VaultStatusCard: View {
    let mirrorEnabled: Bool
    let exportedNoteCount: Int
    let lastWrite: Date?

    private var lastSyncLabel: String {
        guard let d = lastWrite else { return "—" }
        return "Last saved \(d.formatted(date: .abbreviated, time: .shortened))"
    }

    private var statusTitle: String {
        if mirrorEnabled {
            if exportedNoteCount == 1 { return "Saving 1 note here" }
            return "Saving \(exportedNoteCount) notes here"
        }
        return "Not saving copies here"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(mirrorEnabled ? Color.green : Color.secondary.opacity(0.45))
                .frame(width: 10, height: 10)
                .padding(.top, 4)
            VStack(alignment: .leading, spacing: 4) {
                Text(statusTitle)
                    .font(HarvousTypography.settingsFormEnvironment)
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

    // Server-backed data actions (parity with the prototype My Data page).
    @State private var bridge = HarvousClerkBridge.shared
    @State private var exportBusy: HarvousAPIClient.ExportFormat?
    @State private var exportDocument: HarvousExportDocument?
    @State private var exportFilename = "harvous-export"
    @State private var exportContentType: UTType = .plainText
    @State private var showExporter = false
    @State private var showClearConfirm = false
    @State private var showDeleteConfirm = false
    @State private var isClearing = false
    @State private var isDeleting = false
    @State private var dataActionMessage: String?
    @State private var dataActionError: String?

    private var isSignedIn: Bool { bridge.currentProfile != nil }

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
                Section("Copy on this device") {
                    Toggle("Save a copy on my device", isOn: $mirrorEnabled)
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
                        Button("Show in Finder") {
                            HarvousVaultLocation.revealVaultRootInSystem()
                        }
                        #else
                        Button("Copy location") {
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
                        "Bring in notes from Obsidian, Notion, Evernote, and Apple Notes, plus Markdown, HTML, and Word files."
                    )
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
                }

                if isSignedIn {
                    Section("Export") {
                        Button {
                            Task { await exportData(.markdown) }
                        } label: {
                            HStack {
                                Text("Export as Markdown")
                                if exportBusy == .markdown { Spacer(); ProgressView().controlSize(.small) }
                            }
                        }
                        .disabled(exportBusy != nil)

                        Button {
                            Task { await exportData(.csvThreads) }
                        } label: {
                            HStack {
                                Text("Export as CSV")
                                if exportBusy == .csvThreads { Spacer(); ProgressView().controlSize(.small) }
                            }
                        }
                        .disabled(exportBusy != nil)

                        Text("Markdown is per-note with folders and highlights; CSV is a flat spreadsheet summary.")
                            .font(HarvousTypography.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .listRowBackground(Color.clear)
                }

                Section {
                    DisclosureGroup("Advanced") {
                        Button("Choose where copies are saved…") {
                            showVaultFolderImporter = true
                        }

                        if HarvousVaultLocation.isUsingExternalBookmark {
                            Button("Use the default location") {
                                HarvousVaultPreferences.clearExternalVaultBookmark()
                                if HarvousVaultPreferences.isMirrorEnabled {
                                    HarvousVaultExporter.rewriteAllNotes(modelContext: modelContext)
                                }
                            }
                            .foregroundStyle(.secondary)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Button("Rebuild from saved copies…", role: .destructive) {
                                showRebuildConfirm = true
                            }
                            Text(
                                "Reloads notes from the copies saved on your device. Nothing is deleted if a file is missing."
                            )
                            .font(HarvousTypography.footnote)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.top, 4)
                    }
                }

                if isSignedIn {
                    Section {
                        Button("Clear all data…", role: .destructive) {
                            dataActionError = nil; dataActionMessage = nil
                            showClearConfirm = true
                        }
                        .disabled(isClearing || isDeleting)

                        Button("Delete account…", role: .destructive) {
                            dataActionError = nil; dataActionMessage = nil
                            showDeleteConfirm = true
                        }
                        .disabled(isClearing || isDeleting)

                        if let dataActionMessage {
                            Text(dataActionMessage)
                                .font(HarvousTypography.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if let dataActionError {
                            Text(dataActionError)
                                .font(HarvousTypography.footnote)
                                .foregroundStyle(.red)
                        }
                    } header: {
                        Text("Danger zone")
                    } footer: {
                        Text("Clearing removes your notes, folders, and highlights but keeps your account. Deleting your account is permanent.")
                    }
                    .listRowBackground(Color.clear)
                }
            }
            .harvousGroupedSettingsForm()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear { mirrorEnabled = HarvousVaultPreferences.isMirrorEnabled }
        .fileExporter(
            isPresented: $showExporter,
            document: exportDocument,
            contentType: exportContentType,
            defaultFilename: exportFilename
        ) { result in
            if case .failure = result {
                dataActionError = "Couldn't save the export file."
            } else {
                dataActionMessage = "Export saved."
            }
            exportDocument = nil
        }
        .confirmationDialog(
            "Clear all notes, folders, and highlights? Your account stays. This can't be undone.",
            isPresented: $showClearConfirm,
            titleVisibility: .visible
        ) {
            Button("Clear all data", role: .destructive) { Task { await clearData() } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            "Permanently delete your account and all data? This can't be undone.",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) { Task { await deleteAccount() } }
            Button("Cancel", role: .cancel) {}
        }
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
            "This reloads notes from the copies saved on your device. Notes are added or updated; nothing is deleted if a file is missing.",
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

    // MARK: - Server-backed data actions

    private func exportData(_ format: HarvousAPIClient.ExportFormat) async {
        exportBusy = format
        dataActionError = nil; dataActionMessage = nil
        defer { exportBusy = nil }
        do {
            let result = try await HarvousAPIClient.shared.exportData(format: format)
            exportDocument = HarvousExportDocument(data: result.data)
            // `.fileExporter` appends the extension from `contentType`; pass the base only.
            exportFilename = (result.suggestedFilename as NSString).deletingPathExtension
            exportContentType = format == .csvThreads
                ? .commaSeparatedText
                : (UTType(filenameExtension: "md") ?? .plainText)
            showExporter = true
        } catch {
            dataActionError = error.localizedDescription
        }
    }

    private func clearData() async {
        isClearing = true
        dataActionError = nil; dataActionMessage = nil
        defer { isClearing = false }
        do {
            try await HarvousAPIClient.shared.clearData()
            HarvousSyncService.shared.wipeLocalStore(context: modelContext)
            dataActionMessage = "Your notes, folders, and highlights were cleared."
        } catch {
            dataActionError = error.localizedDescription
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        dataActionError = nil; dataActionMessage = nil
        defer { isDeleting = false }
        do {
            try await HarvousAPIClient.shared.deleteAccountData()
            HarvousSyncService.shared.wipeLocalStore(context: modelContext)
            await bridge.signOut() // flip SignInGate back to sign-in
        } catch {
            dataActionError = error.localizedDescription
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
                    #if os(iOS)
                    HarvousIOSSettingsGlyphRow(title: "Harvous website", assetName: "Harvous.Globe")
                    #else
                    Label("Harvous website", systemImage: "safari")
                    #endif
                }
                Link(destination: URL(string: "mailto:support@harvous.com")!) {
                    #if os(iOS)
                    HarvousIOSSettingsGlyphRow(title: "Email support", assetName: "Harvous.Envelope")
                    #else
                    Label("Email support", systemImage: "envelope")
                    #endif
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
                    #if os(iOS)
                    HarvousIOSSettingsGlyphRow(title: "Read the full letter on the web", assetName: "Harvous.Heart")
                    #else
                    Label("Read the full letter on the web", systemImage: "heart.text.square")
                    #endif
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

    #if os(macOS)
    private let nativeRows: [Row] = [
        Row(action: "New note", keys: "⇧N"),
        Row(action: "Search", keys: "⇧K"),
        Row(action: "Settings", keys: "⇧,"),
        Row(action: "Toggle sidebar", keys: "⇧B"),
        Row(action: "Focus note list", keys: "⇧J"),
        Row(action: "Find in note", keys: "⇧F"),
        Row(action: "Note details", keys: "⇧D"),
        Row(action: "Cycle list mode", keys: "⇧← / ⇧→"),
        Row(action: "Daily note", keys: "⌘T"),
        Row(action: "Random revisit", keys: "⌃⌘R"),
        Row(action: "Insert note wikilink", keys: "⇧⌘L"),
        Row(action: "New connected note", keys: "⌘⌥N"),
        Row(action: "Delete note", keys: "⌃⌘⌫"),
        Row(action: "Next note", keys: "⌃⌘↓"),
        Row(action: "Previous note", keys: "⌃⌘↑"),
        Row(action: "Bold", keys: "⌘B"),
        Row(action: "Italic", keys: "⌘I"),
        Row(action: "Strikethrough", keys: "⌘⇧X"),
        Row(action: "Heading 2", keys: "⌘⌥2"),
        Row(action: "Heading 3", keys: "⌘⌥3"),
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
        Row(action: "New note", keys: "⇧N"),
        Row(action: "Search", keys: "⇧K"),
        Row(action: "Settings", keys: "⇧,"),
        Row(action: "Toggle sidebar", keys: "⇧B"),
        Row(action: "Focus note list", keys: "⇧J"),
        Row(action: "Find in note", keys: "⇧F"),
        Row(action: "Note details", keys: "⇧D"),
        Row(action: "Cycle list mode", keys: "⇧← / ⇧→"),
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
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        HarvousShortcutKeycapsRow(keys: row.keys)
                    }
                }
            }
        }
        .harvousGroupedSettingsForm()
    }
}

// MARK: - iOS: You tab + grouped settings

#if os(iOS)
private func harvousYouSheetProfileInitials(firstName: String, lastName: String) -> String {
    let f = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
    let l = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
    let loc = Locale.current
    if f.isEmpty && l.isEmpty { return "HV" }
    let fi = f.first.map { String($0).uppercased(with: loc) } ?? ""
    let li = l.first.map { String($0).uppercased(with: loc) } ?? ""
    if !fi.isEmpty && !li.isEmpty {
        return fi + li
    }
    let single = f.isEmpty ? l : f
    return String(single.prefix(2)).uppercased(with: loc)
}

struct YouRootView: View {
    @AppStorage(HarvousSettingsStorageKeys.firstName) private var firstName = ""
    @AppStorage(HarvousSettingsStorageKeys.lastName) private var lastName = ""
    @State private var bridge = HarvousClerkBridge.shared
    @State private var isSigningOut = false

    private var profile: HarvousUserProfile? { bridge.currentProfile }

    private var headlineName: String {
        if let p = profile { return p.displayName }
        let parts = [
            firstName.trimmingCharacters(in: .whitespaces),
            lastName.trimmingCharacters(in: .whitespaces)
        ].filter { !$0.isEmpty }
        if !parts.isEmpty { return parts.joined(separator: " ") }
        return "You"
    }

    private var subheading: String {
        if let email = profile?.primaryEmail { return email }
        return "Harvous on this device"
    }

    private var profileInitials: String {
        if let p = profile { return p.initials }
        return harvousYouSheetProfileInitials(firstName: firstName, lastName: lastName)
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(.thinMaterial)
                            Text(profileInitials)
                                .font(HarvousFonts.font(size: 20, weight: .semibold, design: .rounded))
                                .foregroundStyle(.primary)
                                .minimumScaleFactor(0.5)
                                .lineLimit(1)
                        }
                        .frame(width: 56, height: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(headlineName)
                                .font(HarvousTypography.title)
                            Text(subheading)
                                .font(HarvousTypography.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }

            Section {
                NavigationLink(value: HarvousYouNavigation.settingsList) {
                    HarvousIOSSettingsGlyphRow(title: "Settings", assetName: "Harvous.Gear")
                }
                Button {
                    Task { await logOut() }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: HarvousFAIconMetrics.catalogGlyphBoxPt, weight: .regular))
                            .foregroundStyle(Color.primary)
                            .frame(width: 28, alignment: .center)
                        HStack(spacing: 8) {
                            Text(isSigningOut ? "Logging out…" : "Log out")
                                .font(HarvousTypography.settingsListRow)
                                .foregroundStyle(Color.primary)
                            if isSigningOut {
                                Spacer(minLength: 0)
                                ProgressView().controlSize(.small)
                            }
                        }
                    }
                }
                .disabled(isSigningOut)
            }
        }
        .harvousListMenuTypography()
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { bridge.refreshProfile() }
    }

    private func logOut() async {
        isSigningOut = true
        defer { isSigningOut = false }
        await bridge.signOut()
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
                    HarvousIOSSettingsGlyphRow(title: item.title, assetName: item.settingsListFAAssetName)
                }
            }
        }
        .harvousListMenuTypography()
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
/// `navigationTitle`, back/forward in `.navigation` (FA `Harvous.ChevronLeft` / `Harvous.ChevronRight`), sidebar list matches main-window toolbar transparency.
struct MacPreferencesRootView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @State private var history: [HarvousSettingsSidebarItem] = [.account]
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
                                HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt)
                                    .frame(
                                        width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                                        height: HarvousFAIconMetrics.catalogGlyphBoxPt
                                    )
                            }
                            .buttonStyle(.bordered)
                            .help("Back")
                            .disabled(historyIndex == 0)
                        }
                        ToolbarItem(placement: .navigation) {
                            Button(action: goForward) {
                                HarvousFAGlyph(assetName: "Harvous.ChevronRight", edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt)
                                    .frame(
                                        width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                                        height: HarvousFAIconMetrics.catalogGlyphBoxPt
                                    )
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
        .harvousListMenuTypography()
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
                HStack(spacing: 8) {
                    HarvousFAGlyph(assetName: item.settingsListFAAssetName, edgePt: 15)
                        .frame(width: 20, alignment: .center)
                    Text(item.title)
                        .font(HarvousTypography.settingsListRow)
                }
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
