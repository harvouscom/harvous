#if canImport(ClerkKit)
import ClerkKit
import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// In-app Clerk account management (iOS + macOS). Avoids ClerkKitUI `UserProfileView` on iOS, whose
/// edit-profile photo UI can spin forever after remove when `imageUrl` stays populated until reload.
struct HarvousMacUserProfileSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable private var bridge = HarvousClerkBridge.shared

    var body: some View {
        NavigationStack {
            HarvousMacUserProfileRootView()
                .navigationTitle("Account")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 560)
        #endif
        .onDisappear { bridge.refreshProfile() }
    }
}

private enum HarvousManageAccountColors {
    static var sheetBackground: Color {
        #if os(iOS)
        Color(uiColor: .systemGroupedBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }

    static var rowBackground: Color {
        #if os(iOS)
        Color(uiColor: .secondarySystemGroupedBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}

// MARK: - Routes

private enum HarvousMacUserProfileRoute: Hashable {
    case profileDetails
    case security
    case updateProfile
    case changePassword
    case addEmail
    case verifyEmail(String)
}

// MARK: - Root

private struct HarvousMacUserProfileRootView: View {
    #if canImport(ClerkKit)
    @Environment(Clerk.self) private var clerk
    #endif
    @Bindable private var bridge = HarvousClerkBridge.shared
    @State private var loadError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                header
                VStack(spacing: 1) {
                    profileRow(
                        title: "Profile details",
                        subtitle: "Email addresses and username",
                        destination: .profileDetails
                    )
                    profileRow(
                        title: "Security",
                        subtitle: "Password and account",
                        destination: .security
                    )
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .padding(.horizontal, 20)
                .padding(.top, 8)

                if let loadError {
                    Text(loadError)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.red)
                        .padding(.top, 12)
                        .padding(.horizontal, 20)
                }

                Text("Secured by Clerk")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 24)
                    .padding(.bottom, 16)
            }
        }
        .background(HarvousManageAccountColors.sheetBackground)
        .navigationDestination(for: HarvousMacUserProfileRoute.self) { route in
            switch route {
            #if canImport(ClerkKit)
            case .profileDetails:
                HarvousMacUserProfileDetailsView()
            case .security:
                HarvousMacUserProfileSecurityView()
            case .addEmail:
                HarvousMacUserProfileAddEmailView()
            case .verifyEmail(let emailId):
                HarvousMacUserProfileVerifyEmailView(emailAddressId: emailId)
            #endif
            case .updateProfile:
                HarvousMacUserProfileEditView()
            case .changePassword:
                HarvousMacUserProfileChangePasswordView()
            }
        }
        .task {
            await refreshClerkState()
        }
    }

    @ViewBuilder
    private var header: some View {
        #if canImport(ClerkKit)
        if let user = clerk.user {
            VStack(spacing: 12) {
                HarvousProfileOrb(imageUrl: bridge.currentProfile?.imageUrl, size: 88)
                VStack(spacing: 2) {
                    if let name = macClerkDisplayName(user: user), !name.isEmpty {
                        Text(name)
                            .font(HarvousTypography.title)
                    }
                    if let username = user.username, !username.trimmingCharacters(in: .whitespaces).isEmpty {
                        Text(username)
                            .font(HarvousTypography.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let email = user.primaryEmailAddress?.emailAddress {
                        Text(email)
                            .font(HarvousTypography.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                NavigationLink(value: HarvousMacUserProfileRoute.updateProfile) {
                    Text("Edit profile")
                        .font(HarvousTypography.body)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(.vertical, 28)
            .frame(maxWidth: .infinity)
        }
        #else
        EmptyView()
        #endif
    }

    private func profileRow(
        title: String,
        subtitle: String,
        destination: HarvousMacUserProfileRoute
    ) -> some View {
        NavigationLink(value: destination) {
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
                Image(systemName: "chevron.right")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(HarvousManageAccountColors.rowBackground)
        }
        .buttonStyle(.plain)
    }

    private func refreshClerkState() async {
        loadError = nil
        #if canImport(ClerkKit)
        do {
            _ = try await Clerk.shared.refreshEnvironment()
            try await bridge.reloadClerkUser()
        } catch {
            loadError = error.localizedDescription
        }
        #endif
    }
}

// MARK: - Edit profile

private struct HarvousMacUserProfileEditView: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    #if canImport(ClerkKit)
    @Environment(Clerk.self) private var clerk
    #endif

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var isSaving = false
    @State private var isPhotoBusy = false
    @State private var errorMessage: String?
    @State private var showImageImporter = false

    var body: some View {
        Form {
            Section {
                HStack {
                    Spacer()
                    HarvousProfileOrb(
                        imageUrl: bridge.currentProfile?.imageUrl,
                        size: 72
                    )
                    Spacer()
                }
                .listRowBackground(Color.clear)
                HStack(spacing: 12) {
                    Button("Upload photo") { showImageImporter = true }
                        .disabled(isPhotoBusy)
                    if bridge.currentProfile?.hasImage == true {
                        Button("Remove photo", role: .destructive) {
                            Task { await removePhoto() }
                        }
                        .disabled(isPhotoBusy)
                    }
                    if isPhotoBusy {
                        ProgressView().controlSize(.small)
                    }
                }
            }
            Section("Name") {
                TextField("First name", text: $firstName)
                TextField("Last name", text: $lastName)
            }
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.red)
                }
            }
            Section {
                Button(isSaving ? "Saving…" : "Save") {
                    Task { await save() }
                }
                .disabled(isSaving)
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Edit profile")
        .onAppear { hydrateFields() }
        .fileImporter(
            isPresented: $showImageImporter,
            allowedContentTypes: [.png, .jpeg, .heic],
            allowsMultipleSelection: false
        ) { result in
            Task { await importPhoto(result) }
        }
    }

    private func hydrateFields() {
        #if canImport(ClerkKit)
        firstName = clerk.user?.firstName ?? ""
        lastName = clerk.user?.lastName ?? ""
        #endif
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            try await bridge.updateProfile(
                firstName: firstName.trimmingCharacters(in: .whitespaces).nilIfEmpty,
                lastName: lastName.trimmingCharacters(in: .whitespaces).nilIfEmpty
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

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

// MARK: - Profile details (emails)

#if canImport(ClerkKit)
private struct HarvousMacUserProfileDetailsView: View {
    @Environment(Clerk.self) private var clerk
    @Bindable private var bridge = HarvousClerkBridge.shared

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
                    Text("No email addresses on this account.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sortedEmails) { email in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(email.emailAddress)
                                if email.verification?.status == .verified {
                                    Text("Verified")
                                        .font(HarvousTypography.caption)
                                        .foregroundStyle(.secondary)
                                } else {
                                    Text("Needs verification")
                                        .font(HarvousTypography.caption)
                                        .foregroundStyle(.orange)
                                }
                            }
                            Spacer()
                            if email.id == clerk.user?.primaryEmailAddressId {
                                Text("Primary")
                                    .font(HarvousTypography.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if email.verification?.status != .verified {
                            NavigationLink(value: HarvousMacUserProfileRoute.verifyEmail(email.id)) {
                                Text("Verify")
                            }
                        }
                    }
                }
                NavigationLink(value: HarvousMacUserProfileRoute.addEmail) {
                    Text("Add email address")
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Profile details")
        .task { try? await bridge.reloadClerkUser() }
    }
}
#endif

// MARK: - Add / verify email

#if canImport(ClerkKit)
private struct HarvousMacUserProfileAddEmailView: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    @State private var email = ""
    @State private var isBusy = false
    @State private var errorMessage: String?
    @State private var verifyEmailId: String?

    var body: some View {
        Form {
            Section {
                Text("You'll need to verify this email before it is added to your account.")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
                TextField("Email address", text: $email)
                    .textContentType(.emailAddress)
            }
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.red)
                }
            }
            Section {
                Button(isBusy ? "Continuing…" : "Continue") {
                    Task { await addEmail() }
                }
                .disabled(isBusy || email.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Add email")
        .navigationDestination(isPresented: Binding(
            get: { verifyEmailId != nil },
            set: { if !$0 { verifyEmailId = nil } }
        )) {
            if let verifyEmailId {
                HarvousMacUserProfileVerifyEmailView(emailAddressId: verifyEmailId)
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
#endif

#if canImport(ClerkKit)
private struct HarvousMacUserProfileVerifyEmailView: View {
    let emailAddressId: String
    @Bindable private var bridge = HarvousClerkBridge.shared
    #if canImport(ClerkKit)
    @Environment(Clerk.self) private var clerk
    #endif

    @State private var code = ""
    @State private var isBusy = false
    @State private var errorMessage: String?

    private var emailAddress: EmailAddress? {
        #if canImport(ClerkKit)
        clerk.user?.emailAddresses.first { $0.id == emailAddressId }
        #else
        nil
        #endif
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
            }
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.red)
                }
            }
            Section {
                Button(isBusy ? "Verifying…" : "Verify") {
                    Task { await verify() }
                }
                .disabled(isBusy || code.trimmingCharacters(in: .whitespaces).isEmpty)
                Button("Resend code") {
                    Task { await resend() }
                }
                .disabled(isBusy)
            }
        }
        .formStyle(.grouped)
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
#endif

// MARK: - Security

#if canImport(ClerkKit)
private struct HarvousMacUserProfileSecurityView: View {
    @Environment(Clerk.self) private var clerk

    private var passwordSectionEnabled: Bool {
        clerk.environment?.userSettings.attributes["password"]?.enabled == true
    }

    private var deleteSelfEnabled: Bool {
        clerk.environment?.userSettings.actions.deleteSelf == true
    }

    var body: some View {
        Form {
            if passwordSectionEnabled {
                Section {
                    NavigationLink(value: HarvousMacUserProfileRoute.changePassword) {
                        Text("Change password")
                    }
                }
            }
            if deleteSelfEnabled {
                Section {
                    HarvousMacUserProfileDeleteAccountRow()
                } footer: {
                    Text("Permanently deletes your Clerk account. Your Harvous study data must be removed separately from My Data.")
                        .font(HarvousTypography.footnote)
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Security")
    }
}
#endif

private struct HarvousMacUserProfileChangePasswordView: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    #if canImport(ClerkKit)
    @Environment(Clerk.self) private var clerk
    #endif

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var signOutOthers = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var didSave = false

    private var isAddingPassword: Bool {
        #if canImport(ClerkKit)
        clerk.user?.passwordEnabled != true
        #else
        false
        #endif
    }

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
                Text("Password must be at least 8 characters.")
                    .font(HarvousTypography.footnote)
            }
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.red)
                }
            }
            Section {
                Button(isSaving ? "Saving…" : "Save password") {
                    Task { await save() }
                }
                .disabled(isSaving || !canSave)
            }
            if didSave {
                Section {
                    Text("Password updated.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
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

private struct HarvousMacUserProfileDeleteAccountRow: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    @State private var showConfirm = false
    @State private var isDeleting = false
    @State private var errorMessage: String?

    var body: some View {
        Button("Delete Clerk account…", role: .destructive) {
            showConfirm = true
        }
        .disabled(isDeleting)
        .confirmationDialog(
            "Delete your Clerk account? You will be signed out. This cannot be undone.",
            isPresented: $showConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) {
                Task { await deleteAccount() }
            }
            Button("Cancel", role: .cancel) {}
        }
        if let errorMessage {
            Text(errorMessage)
                .font(HarvousTypography.footnote)
                .foregroundStyle(.red)
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

#if canImport(ClerkKit)
private func macClerkDisplayName(user: User) -> String? {
    let parts = [user.firstName, user.lastName]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    if !parts.isEmpty { return parts.joined(separator: " ") }
    return user.username?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
}
#endif

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
#endif
