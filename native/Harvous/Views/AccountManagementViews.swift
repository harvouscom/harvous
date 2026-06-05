import SwiftUI
#if canImport(ClerkKit)
import ClerkKit
import PhotosUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif
#endif

/// In-app Clerk account management screens (iOS + macOS), pushed **in place** onto the
/// settings `NavigationStack` (iOS You stack / macOS preferences detail). No modal, no
/// redundant hub — `SettingsAccountView` is the single hub; these are its sub-screens.
///
/// `AccountRouteView` is always compiled (its body is ClerkKit-guarded) so the shared
/// `.navigationDestination(for: HarvousAccountRoute.self)` can reference it without the SDK.
struct AccountRouteView: View {
    let route: HarvousAccountRoute

    var body: some View {
        #if canImport(ClerkKit)
        switch route {
        case .editProfile: AccountEditProfileView()
        case .emails: AccountEmailsView()
        case .password: AccountChangePasswordView()
        case .security: AccountSecurityView()
        case .addEmail: AccountAddEmailView()
        case .verifyEmail(let id): AccountVerifyEmailView(emailAddressId: id)
        }
        #else
        ContentUnavailableView("Sign in required", systemImage: "person.crop.circle")
        #endif
    }
}

#if canImport(ClerkKit)

// MARK: - Shared bits

/// Page/background color behind grouped account forms (matches the settings detail).
private var accountFormBackground: Color {
    #if os(iOS)
    Color(uiColor: .systemGroupedBackground)
    #else
    Color(nsColor: .windowBackgroundColor)
    #endif
}

/// Small capsule tag (Primary / Verified / Unverified) — mirrors the web badge tags.
private struct AccountTag: View {
    let text: String
    var tint: Color = .secondary

    var body: some View {
        Text(text)
            .font(HarvousTypography.caption)
            .foregroundStyle(tint)
            .padding(.horizontal, 7)
            .padding(.vertical, 1)
            .overlay(Capsule().stroke(tint.opacity(0.45), lineWidth: 0.5))
    }
}

// MARK: - Edit profile

private struct AccountEditProfileView: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    @Environment(Clerk.self) private var clerk

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var isSaving = false
    @State private var isPhotoBusy = false
    @State private var errorMessage: String?
    @State private var didSave = false
    #if os(iOS)
    @State private var showPhotoPicker = false
    @State private var photoPickerItem: PhotosPickerItem?
    #elseif os(macOS)
    @State private var showImageImporter = false
    #endif

    private var hasPhoto: Bool { bridge.currentProfile?.hasImage == true }

    var body: some View {
        Form {
            Section {
                VStack(spacing: 14) {
                    // Tap the orb itself to change the photo (camera badge hints at it).
                    Button(action: startPhotoPick) {
                        ZStack(alignment: .bottomTrailing) {
                            HarvousProfileOrb(imageUrl: bridge.currentProfile?.imageUrl, size: 88)
                            Image(systemName: "camera.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(Color.accentColor))
                                .overlay(Circle().stroke(accountFormBackground, lineWidth: 2))
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(isPhotoBusy)

                    HStack(spacing: 16) {
                        Button(hasPhoto ? "Change photo" : "Add photo", action: startPhotoPick)
                            .disabled(isPhotoBusy)
                        if hasPhoto {
                            Button("Remove", role: .destructive) { Task { await removePhoto() } }
                                .disabled(isPhotoBusy)
                        }
                    }
                    .font(HarvousTypography.body)

                    if isPhotoBusy { ProgressView().controlSize(.small) }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
                .listRowBackground(Color.clear)
            }
            Section("Name") {
                TextField("First name", text: $firstName)
                TextField("Last name", text: $lastName)
            }
            if let errorMessage {
                Section {
                    Text(errorMessage).font(HarvousTypography.footnote).foregroundStyle(.red)
                }
            }
            Section {
                Button(isSaving ? "Saving…" : "Save") { Task { await save() } }
                    .disabled(isSaving)
                if didSave {
                    Text("Saved.").font(HarvousTypography.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .harvousGroupedSettingsForm()
        .navigationTitle("Edit profile")
        .onAppear { hydrateFields() }
        #if os(iOS)
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoPickerItem, matching: .images)
        .onChange(of: photoPickerItem) { _, item in
            guard let item else { return }
            Task { await importPickedPhoto(item) }
        }
        #elseif os(macOS)
        .fileImporter(
            isPresented: $showImageImporter,
            allowedContentTypes: [.png, .jpeg, .heic],
            allowsMultipleSelection: false
        ) { result in
            Task { await importPhoto(result) }
        }
        #endif
    }

    private func startPhotoPick() {
        #if os(iOS)
        showPhotoPicker = true
        #elseif os(macOS)
        showImageImporter = true
        #endif
    }

    private func hydrateFields() {
        firstName = clerk.user?.firstName ?? ""
        lastName = clerk.user?.lastName ?? ""
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        didSave = false
        defer { isSaving = false }
        do {
            try await bridge.updateProfile(
                firstName: firstName.trimmingCharacters(in: .whitespaces).nilIfEmpty,
                lastName: lastName.trimmingCharacters(in: .whitespaces).nilIfEmpty
            )
            didSave = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    #if os(iOS)
    private func importPickedPhoto(_ item: PhotosPickerItem) async {
        isPhotoBusy = true
        errorMessage = nil
        defer { isPhotoBusy = false; photoPickerItem = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                errorMessage = "Could not read the selected photo."
                return
            }
            try await bridge.setProfileImage(data: data)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    #elseif os(macOS)
    private func importPhoto(_ result: Result<[URL], Error>) async {
        isPhotoBusy = true
        errorMessage = nil
        defer { isPhotoBusy = false }
        guard case .success(let urls) = result, let url = urls.first else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            try await bridge.setProfileImage(data: data)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    #endif

    private func removePhoto() async {
        isPhotoBusy = true
        errorMessage = nil
        defer { isPhotoBusy = false }
        do {
            try await bridge.deleteProfileImage()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Email addresses

private struct AccountEmailsView: View {
    @Environment(Clerk.self) private var clerk
    @Bindable private var bridge = HarvousClerkBridge.shared
    @State private var busyId: String?
    @State private var errorMessage: String?

    private var primaryId: String? { clerk.user?.primaryEmailAddressId }

    private var sortedEmails: [EmailAddress] {
        guard let user = clerk.user else { return [] }
        return user.emailAddresses.sorted { lhs, rhs in
            if lhs.id == user.primaryEmailAddressId { return true }
            if rhs.id == user.primaryEmailAddressId { return false }
            return lhs.createdAt < rhs.createdAt
        }
    }

    var body: some View {
        Form {
            Section("Email addresses") {
                if sortedEmails.isEmpty {
                    Text("No email addresses on this account.").foregroundStyle(.secondary)
                } else {
                    ForEach(sortedEmails) { email in
                        emailRow(email)
                    }
                }
                NavigationLink(value: HarvousAccountRoute.addEmail) {
                    Text("Add email address")
                }
            }
            if let errorMessage {
                Section {
                    Text(errorMessage).font(HarvousTypography.footnote).foregroundStyle(.red)
                }
            }
        }
        .harvousGroupedSettingsForm()
        .navigationTitle("Email addresses")
        .task { try? await bridge.reloadClerkUser() }
    }

    @ViewBuilder
    private func emailRow(_ email: EmailAddress) -> some View {
        let isPrimary = email.id == primaryId
        let isVerified = email.verification?.status == .verified
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(email.emailAddress)
                    .font(HarvousTypography.body)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 8)
                if isPrimary { AccountTag(text: "Primary") }
                AccountTag(text: isVerified ? "Verified" : "Unverified", tint: isVerified ? .secondary : .orange)
            }
            HStack(spacing: 18) {
                if !isVerified {
                    NavigationLink("Verify", value: HarvousAccountRoute.verifyEmail(email.id))
                }
                if !isPrimary && isVerified {
                    Button("Set as primary") { Task { await setPrimary(email.id) } }
                }
                if !isPrimary {
                    Button("Remove", role: .destructive) { Task { await remove(email) } }
                }
            }
            .font(HarvousTypography.footnote)
            .buttonStyle(.borderless)
            .controlSize(.small)
            .disabled(busyId == email.id)
        }
        .padding(.vertical, 2)
    }

    private func setPrimary(_ id: String) async {
        busyId = id
        errorMessage = nil
        defer { busyId = nil }
        do {
            try await bridge.setPrimaryEmail(id: id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func remove(_ email: EmailAddress) async {
        busyId = email.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            try await bridge.deleteEmailAddress(email)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Add / verify email

private struct AccountAddEmailView: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    @State private var email = ""
    @State private var isBusy = false
    @State private var errorMessage: String?
    @State private var verifyEmailId: String?

    var body: some View {
        Form {
            Section {
                Text("You'll verify this email with a code before it's added to your account.")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
                TextField("Email address", text: $email)
                    .textContentType(.emailAddress)
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    #endif
            }
            if let errorMessage {
                Section {
                    Text(errorMessage).font(HarvousTypography.footnote).foregroundStyle(.red)
                }
            }
            Section {
                Button(isBusy ? "Continuing…" : "Continue") { Task { await addEmail() } }
                    .disabled(isBusy || email.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .harvousGroupedSettingsForm()
        .navigationTitle("Add email")
        .navigationDestination(isPresented: Binding(
            get: { verifyEmailId != nil },
            set: { if !$0 { verifyEmailId = nil } }
        )) {
            if let verifyEmailId {
                AccountVerifyEmailView(emailAddressId: verifyEmailId)
            }
        }
    }

    private func addEmail() async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            let created = try await bridge.createEmailAddress(email.trimmingCharacters(in: .whitespaces))
            _ = try await created.sendCode()
            verifyEmailId = created.id
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct AccountVerifyEmailView: View {
    let emailAddressId: String
    @Bindable private var bridge = HarvousClerkBridge.shared
    @Environment(Clerk.self) private var clerk

    @State private var code = ""
    @State private var isBusy = false
    @State private var errorMessage: String?

    private var emailAddress: EmailAddress? {
        clerk.user?.emailAddresses.first { $0.id == emailAddressId }
    }

    var body: some View {
        Form {
            Section {
                if let emailAddress {
                    Text("Enter the code sent to \(emailAddress.emailAddress).")
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.secondary)
                }
                TextField("Verification code", text: $code)
                    #if os(iOS)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    #endif
            }
            if let errorMessage {
                Section {
                    Text(errorMessage).font(HarvousTypography.footnote).foregroundStyle(.red)
                }
            }
            Section {
                Button(isBusy ? "Verifying…" : "Verify") { Task { await verify() } }
                    .disabled(isBusy || code.trimmingCharacters(in: .whitespaces).isEmpty)
                Button("Resend code") { Task { await resend() } }
                    .disabled(isBusy)
            }
        }
        .harvousGroupedSettingsForm()
        .navigationTitle("Verify email")
        .task {
            if emailAddress?.verification?.status != .verified {
                try? await emailAddress?.sendCode()
            }
        }
    }

    private func verify() async {
        guard let emailAddress else { return }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            _ = try await emailAddress.verifyCode(code.trimmingCharacters(in: .whitespaces))
            try await bridge.reloadClerkUser()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func resend() async {
        guard let emailAddress else { return }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            _ = try await emailAddress.sendCode()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Security (active devices + password + delete)

private struct AccountSecurityView: View {
    @Environment(Clerk.self) private var clerk
    @Bindable private var bridge = HarvousClerkBridge.shared

    @State private var sessions: [Session] = []
    @State private var busySessionId: String?
    @State private var sessionError: String?

    private var passwordSectionEnabled: Bool {
        clerk.environment?.userSettings.attributes["password"]?.enabled == true
    }

    private var deleteSelfEnabled: Bool {
        clerk.environment?.userSettings.actions.deleteSelf == true
    }

    var body: some View {
        Form {
            Section {
                if sessions.isEmpty {
                    Text("No other active devices.").foregroundStyle(.secondary)
                } else {
                    ForEach(sessions, id: \.id) { session in
                        sessionRow(session)
                    }
                }
                if let sessionError {
                    Text(sessionError).font(HarvousTypography.footnote).foregroundStyle(.red)
                }
            } header: {
                Text("Active devices")
            }

            if passwordSectionEnabled {
                Section {
                    NavigationLink(value: HarvousAccountRoute.password) {
                        Text("Change password")
                    }
                }
            }

            if deleteSelfEnabled {
                Section {
                    AccountDeleteAccountRow()
                } footer: {
                    Text("Permanently deletes your account and sign-in. Your Harvous study data must be removed separately from My Data.")
                        .font(HarvousTypography.footnote)
                }
            }
        }
        .harvousGroupedSettingsForm()
        .navigationTitle("Security")
        .task { await loadSessions() }
    }

    @ViewBuilder
    private func sessionRow(_ session: Session) -> some View {
        let isCurrent = session.id == bridge.currentSessionId
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(deviceLabel(session)).font(HarvousTypography.body)
                    if isCurrent {
                        Text("This device").font(HarvousTypography.caption).foregroundStyle(.secondary)
                    }
                }
                if let location = locationLabel(session) {
                    Text(location).font(HarvousTypography.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            if !isCurrent {
                Button("Sign out", role: .destructive) { Task { await revoke(session) } }
                    .buttonStyle(.borderless)
                    .controlSize(.small)
                    .disabled(busySessionId == session.id)
            }
        }
        .padding(.vertical, 2)
    }

    private func deviceLabel(_ session: Session) -> String {
        let a = session.latestActivity
        let browser = [a?.browserName, a?.browserVersion].compactMap { $0 }.joined(separator: " ")
        let device = (a?.isMobile == true) ? "Mobile" : (a?.deviceType ?? "Desktop")
        let parts = [device, browser].filter { !$0.isEmpty }
        return parts.isEmpty ? "Unknown device" : parts.joined(separator: " · ")
    }

    private func locationLabel(_ session: Session) -> String? {
        let a = session.latestActivity
        let loc = [a?.city, a?.country].compactMap { $0 }.joined(separator: ", ")
        let parts = [loc, a?.ipAddress].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func loadSessions() async {
        sessionError = nil
        do {
            sessions = try await bridge.activeSessions()
        } catch {
            sessionError = error.localizedDescription
        }
    }

    private func revoke(_ session: Session) async {
        busySessionId = session.id
        sessionError = nil
        defer { busySessionId = nil }
        do {
            try await bridge.revokeSession(session)
            await loadSessions()
        } catch {
            sessionError = error.localizedDescription
        }
    }
}

private struct AccountChangePasswordView: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    @Environment(Clerk.self) private var clerk

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var signOutOthers = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var didSave = false

    private var isAddingPassword: Bool { clerk.user?.passwordEnabled != true }

    var body: some View {
        Form {
            Section {
                if !isAddingPassword {
                    SecureField("Current password", text: $currentPassword)
                }
                SecureField("New password", text: $newPassword)
                SecureField("Confirm new password", text: $confirmPassword)
                Toggle("Sign out of all other devices", isOn: $signOutOthers)
            } footer: {
                Text("Password must be at least 8 characters.").font(HarvousTypography.footnote)
            }
            if let errorMessage {
                Section {
                    Text(errorMessage).font(HarvousTypography.footnote).foregroundStyle(.red)
                }
            }
            Section {
                Button(isSaving ? "Saving…" : "Save password") { Task { await save() } }
                    .disabled(isSaving || !canSave)
            }
            if didSave {
                Section {
                    Text("Password updated.").foregroundStyle(.secondary)
                }
            }
        }
        .harvousGroupedSettingsForm()
        .navigationTitle(isAddingPassword ? "Set password" : "Change password")
    }

    private var canSave: Bool {
        let new = newPassword.trimmingCharacters(in: .whitespaces)
        let confirm = confirmPassword.trimmingCharacters(in: .whitespaces)
        guard new.count >= 8, new == confirm else { return false }
        if isAddingPassword { return true }
        return !currentPassword.isEmpty
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            try await bridge.updatePassword(
                currentPassword: isAddingPassword ? nil : currentPassword,
                newPassword: newPassword,
                signOutOfOtherSessions: signOutOthers
            )
            didSave = true
            currentPassword = ""
            newPassword = ""
            confirmPassword = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct AccountDeleteAccountRow: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    @State private var showConfirm = false
    @State private var isDeleting = false
    @State private var errorMessage: String?

    var body: some View {
        Button("Delete account…", role: .destructive) { showConfirm = true }
            .disabled(isDeleting)
            .confirmationDialog(
                "Delete your account? You will be signed out. This cannot be undone.",
                isPresented: $showConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete account", role: .destructive) { Task { await deleteAccount() } }
                Button("Cancel", role: .cancel) {}
            }
        if let errorMessage {
            Text(errorMessage).font(HarvousTypography.footnote).foregroundStyle(.red)
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            try await bridge.deleteAccount()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Helpers

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

#endif
