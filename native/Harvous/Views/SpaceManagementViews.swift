import SwiftData
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

// MARK: - Create

struct CreateSpaceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore

    @State private var name = ""
    @State private var visibility: SpaceVisibility = .privateShared
    #if os(macOS)
    @FocusState private var nameFieldFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    #endif

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canCreate: Bool { !trimmedName.isEmpty }

    var body: some View {
        NavigationStack {
            Group {
                #if os(macOS)
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        spaceMacCaption("Space name")
                        TextField("My study space", text: $name)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14))
                        .focused($nameFieldFocused)
                        .padding(10)
                        .background(macFieldFill)
                        .background(
                            RoundedRectangle(cornerRadius: SpaceSheetMac.fieldCorner, style: .continuous)
                                .strokeBorder(macFieldStroke(isFocused: nameFieldFocused), lineWidth: nameFieldFocused ? 2.5 : 1)
                        )
                        .onSubmit {}

                    spaceMacCaption("Who can join")
                    HStack {
                        Picker("Who can join", selection: $visibility) {
                            Text(SpaceVisibility.privateShared.menuLabel).tag(SpaceVisibility.privateShared)
                            Text(SpaceVisibility.publicShared.menuLabel).tag(SpaceVisibility.publicShared)
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        Spacer(minLength: 0)
                    }
                    .padding(10)
                    .background(macFieldFill)
                    .background(
                        RoundedRectangle(cornerRadius: SpaceSheetMac.fieldCorner, style: .continuous)
                            .strokeBorder(Color(nsColor: .separatorColor).opacity(0.85), lineWidth: 1)
                    )

                    Text(visibility == .privateShared
                        ? "Only people you invite can join this space."
                        : "Anyone with the link can join and edit notes in this space.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: SpaceSheetMac.outerCorner, style: .continuous)
                        .fill(SpaceSheetMac.cardBackground(colorScheme: colorScheme))
                        .shadow(color: .black.opacity(0.12), radius: 20, y: 8)
                )
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                #else
                Form {
                    Section("Details") {
                        TextField("Space name", text: $name)
                    }

                    Section {
                        Picker("Who can join", selection: $visibility) {
                            Text(SpaceVisibility.privateShared.menuLabel).tag(SpaceVisibility.privateShared)
                            Text(SpaceVisibility.publicShared.menuLabel).tag(SpaceVisibility.publicShared)
                        }
                        .pickerStyle(.menu)
                    } header: {
                        Text("Sharing")
                    } footer: {
                        Text(visibility == .privateShared
                            ? "Only people you invite can join this space."
                            : "Anyone with the link can join and edit notes in this space.")
                            .font(HarvousTypography.caption)
                    }
                }
                .formStyle(.grouped)
                #endif
            }
            .navigationTitle("New Space")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .onAppear {
                visibility = spaceStore.createSpaceInitialVisibility
                #if os(macOS)
                nameFieldFocused = true
                #endif
            }
            .onChange(of: spaceStore.showCreateSpaceSheet) { _, show in
                if show {
                    visibility = spaceStore.createSpaceInitialVisibility
                    name = ""
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    #if os(macOS)
                    Button("Cancel") { dismiss() }
                        .buttonStyle(CompactModalToolbarButtonStyle(role: .cancel))
                    #else
                    Button("Cancel") { dismiss() }
                    #endif
                }
                ToolbarItem(placement: .confirmationAction) {
                    #if os(macOS)
                    Button {
                        if spaceStore.createSpace(name: trimmedName, visibility: visibility, modelContext: modelContext) != nil {
                            dismiss()
                        }
                    } label: {
                        Text("Create")
                    }
                    .disabled(!canCreate)
                    .buttonStyle(CompactModalToolbarButtonStyle(role: .primary))
                    #else
                    Button {
                        if spaceStore.createSpace(name: trimmedName, visibility: visibility, modelContext: modelContext) != nil {
                            dismiss()
                        }
                    } label: {
                        Text("Create")
                    }
                    .disabled(!canCreate)
                    #endif
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 320)
        #endif
    }

    #if os(macOS)
    private var macFieldFill: Color {
        Color(nsColor: .textBackgroundColor).opacity(0.55)
    }

    private func macFieldStroke(isFocused: Bool) -> Color {
        isFocused ? Color.harvousAccent : Color(nsColor: .separatorColor).opacity(0.85)
    }

    private func spaceMacCaption(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.secondary)
            .padding(.bottom, 3)
    }
    #endif
}

// MARK: - Join

struct JoinSpaceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore

    @State private var token = ""
    @State private var joinFailed = false
    #if os(macOS)
    @FocusState private var tokenFieldFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    #endif

    private var trimmedToken: String { token.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canJoin: Bool { !trimmedToken.isEmpty }

    var body: some View {
        NavigationStack {
            Group {
                #if os(macOS)
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        joinMacCaption("Invite token or link")
                        TextField("Paste token or harvous:// URL", text: $token)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14))
                        .focused($tokenFieldFocused)
                        .padding(10)
                        .background(joinMacFieldFill)
                        .background(
                            RoundedRectangle(cornerRadius: SpaceSheetMac.fieldCorner, style: .continuous)
                                .strokeBorder(joinMacFieldStroke(isFocused: tokenFieldFocused), lineWidth: tokenFieldFocused ? 2.5 : 1)
                        )

                    Text("Paste the token from a private invite, or a harvous:// link from a public space.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if joinFailed {
                        Text("Could not join with that token. Check for typos and try again.")
                            .font(.system(size: 12))
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: SpaceSheetMac.outerCorner, style: .continuous)
                        .fill(SpaceSheetMac.cardBackground(colorScheme: colorScheme))
                        .shadow(color: .black.opacity(0.12), radius: 20, y: 8)
                )
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                #else
                Form {
                    Section {
                        TextField("Token or URL", text: $token)
                        #if os(iOS)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                        #endif
                    } header: {
                        Text("Invite")
                    } footer: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Paste the token from a private invite, or a harvous:// link from a public space.")
                                .font(HarvousTypography.caption)
                            if joinFailed {
                                Text("Could not join with that token. Check for typos and try again.")
                                    .font(HarvousTypography.caption)
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                }
                .formStyle(.grouped)
                #endif
            }
            .navigationTitle("Join Space")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .onAppear {
                #if os(macOS)
                tokenFieldFocused = true
                #endif
            }
            .onChange(of: token) { _, _ in
                joinFailed = false
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    #if os(macOS)
                    Button("Cancel") { dismiss() }
                        .buttonStyle(CompactModalToolbarButtonStyle(role: .cancel))
                    #else
                    Button("Cancel") { dismiss() }
                    #endif
                }
                ToolbarItem(placement: .confirmationAction) {
                    #if os(macOS)
                    Button {
                        joinFailed = !spaceStore.applyJoinToken(trimmedToken, modelContext: modelContext)
                        if !joinFailed { dismiss() }
                    } label: {
                        Text("Join")
                    }
                    .disabled(!canJoin)
                    .buttonStyle(CompactModalToolbarButtonStyle(role: .primary))
                    #else
                    Button {
                        joinFailed = !spaceStore.applyJoinToken(trimmedToken, modelContext: modelContext)
                        if !joinFailed { dismiss() }
                    } label: {
                        Text("Join")
                    }
                    .disabled(!canJoin)
                    #endif
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 280)
        #endif
    }

    #if os(macOS)
    private var joinMacFieldFill: Color {
        Color(nsColor: .textBackgroundColor).opacity(0.55)
    }

    private func joinMacFieldStroke(isFocused: Bool) -> Color {
        isFocused ? Color.harvousAccent : Color(nsColor: .separatorColor).opacity(0.85)
    }

    private func joinMacCaption(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.secondary)
            .padding(.bottom, 3)
    }
    #endif
}

// MARK: - Manage

struct ManageSpaceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore

    let space: Space

    @State private var renameText = ""
    @State private var scriptureAccent: HarvousColors.ThemeVariant = .blue
    @State private var confirmArchive = false
    @State private var confirmDelete = false
    #if os(macOS)
    @FocusState private var renameFieldFocused: Bool
    @Environment(\.colorScheme) private var colorScheme
    #endif

    private var canManage: Bool { spaceStore.canManageSettings(space: space) }
    private var trimmedRenameText: String { renameText.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSaveName: Bool { canManage && !trimmedRenameText.isEmpty && trimmedRenameText != space.name }
    private var joinURL: URL? {
        guard let t = spaceStore.activeJoinLink(for: space)?.token else { return nil }
        return URL(string: "harvous://space/join?token=\(t)")
    }

    private var orderedMembers: [SpaceMember] {
        space.members.sorted(by: { $0.joinedAt < $1.joinedAt })
    }

    /// Personal home (“My Home”) — name is fixed; members section is omitted.
    private var isPersonalHomeSpace: Bool {
        space.id == HarvousSpaceBootstrap.personalHomeSpaceId || space.visibility == .personal
    }

    var body: some View {
        NavigationStack {
            Group {
                #if os(macOS)
                manageMacStack
                #else
                Form {
                Section("Name") {
                    if canManage, !isPersonalHomeSpace {
                        VStack(alignment: .leading, spacing: 10) {
                            TextField("Space name", text: $renameText)
                            HStack {
                                Spacer()
                                Button("Save name") {
                                    _ = spaceStore.renameSpace(space, to: trimmedRenameText, modelContext: modelContext)
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(!canSaveName)
                            }
                        }
                    } else {
                        LabeledContent("Space name", value: space.name)
                    }
                }

                Section("Appearance") {
                    if canManage {
                        Picker("Scripture accent", selection: $scriptureAccent) {
                            ForEach(HarvousColors.ThemeVariant.allCases) { variant in
                                Text(variant.pickerLabel).tag(variant)
                            }
                        }
                        .pickerStyle(.menu)
                        .onChange(of: scriptureAccent) { _, new in
                            guard new != space.scriptureTheme else { return }
                            _ = spaceStore.setScriptureTheme(new, for: space, modelContext: modelContext)
                        }

                        HStack(spacing: 8) {
                            HarvousFAGlyph(assetName: "Harvous.Bookmark", edgePt: 9)
                            Text("John 3:16 NASB")
                                .font(HarvousTypography.inspectorCompactMedium)
                        }
                        .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureAccent).opacity(HarvousScripturePillStyle.labelOpacity))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                                .fill(HarvousColors.scriptureChipBackground(scriptureAccent))
                                .overlay(
                                    LinearGradient(
                                        colors: [
                                            HarvousColors.scriptureChipGradientTop(scriptureAccent),
                                            HarvousColors.scriptureChipGradientBottom(scriptureAccent)
                                        ],
                                        startPoint: HarvousColors.scriptureChipGradientStartPoint(scriptureAccent),
                                        endPoint: HarvousColors.scriptureChipGradientEndPoint(scriptureAccent)
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous))
                                )
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                                .strokeBorder(HarvousColors.scriptureChipBorder(scriptureAccent), lineWidth: 0.5)
                        )
                        .accessibilityHidden(true)

                        Text("Scripture pills, list chips, and the scripture bar use this accent while this space is active.")
                            .font(HarvousTypography.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        LabeledContent("Scripture accent", value: space.scriptureTheme.pickerLabel)
                    }
                }

                if space.visibility == .privateShared && canManage {
                    Section("Private invites") {
                        Button {
                            if let token = spaceStore.createInvite(for: space, modelContext: modelContext) {
                                let url = "harvous://space/join?token=\(token)"
                                #if os(iOS)
                                UIPasteboard.general.string = url
                                #elseif os(macOS)
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(url, forType: .string)
                                #endif
                            }
                        } label: {
                            Label("Copy new invite link", image: "Harvous.UserPlus")
                        }
                        Text("Send the link to someone so they can join this space on their device.")
                            .font(HarvousTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if space.visibility == .publicShared && canManage {
                    Section("Public link") {
                        if let url = joinURL {
                            LabeledContent("Link") {
                                Text(url.absoluteString)
                                    .font(.caption)
                                    .lineLimit(3)
                            }
                        }
                        Button {
                            if spaceStore.activeJoinLink(for: space) == nil {
                                _ = spaceStore.regeneratePublicLink(for: space, modelContext: modelContext)
                            }
                            if let url = joinURL {
                                #if os(iOS)
                                UIPasteboard.general.string = url.absoluteString
                                #elseif os(macOS)
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(url.absoluteString, forType: .string)
                                #endif
                            }
                        } label: {
                            Label("Copy link", image: "Harvous.Link")
                        }
                        Button(role: .destructive) {
                            _ = spaceStore.regeneratePublicLink(for: space, modelContext: modelContext)
                        } label: {
                            Label("Regenerate link", image: "Harvous.ArrowsRotate")
                        }
                    }
                }

                if !isPersonalHomeSpace {
                    Section("Members") {
                        ForEach(orderedMembers, id: \.id) { member in
                            memberRow(member)
                        }
                    }
                }

                if canManage, space.visibility != .personal {
                    Section("Danger Zone") {
                        Button(role: .destructive) {
                            confirmArchive = true
                        } label: {
                            Label("Archive space", image: "Harvous.BoxArchive")
                        }
                        Button(role: .destructive) {
                            confirmDelete = true
                        } label: {
                            Label("Delete space and notes", image: "Harvous.Trash")
                        }
                    }
                }
                }
                .formStyle(.grouped)
                #endif
            }
            .navigationTitle("Manage Space")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    #if os(macOS)
                    Button("Done") { dismiss() }
                        .buttonStyle(CompactModalToolbarButtonStyle(role: .primary))
                    #else
                    Button("Done") { dismiss() }
                    #endif
                }
            }
            .onAppear {
                renameText = space.name
                scriptureAccent = space.scriptureTheme
            }
            .alert("Archive this space?", isPresented: $confirmArchive) {
                Button("Cancel", role: .cancel) {}
                Button("Archive") {
                    _ = spaceStore.archiveSpace(space, modelContext: modelContext)
                    dismiss()
                }
            } message: {
                Text("You can still open other spaces. Notes in this space stay on device until you delete the space.")
            }
            .alert("Delete this space?", isPresented: $confirmDelete) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    _ = spaceStore.deleteSpace(space, modelContext: modelContext)
                    dismiss()
                }
            } message: {
                Text("All notes in this space will be permanently removed.")
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, minHeight: isPersonalHomeSpace ? 360 : 560)
        #endif
    }

    @ViewBuilder
    private func memberRow(_ member: SpaceMember) -> some View {
        let isYou = member.userId == HarvousLocalIdentity.userId
        let currentRole = spaceStore.roleForCurrentUser(space: space) ?? .member
        let canEditRoles = spaceStore.isOwner(space: space)
        let canRemove = currentRole == .owner || (currentRole == .admin && member.role == .member)
        let showMenu =
            canManage && member.userId != space.ownerUserId && member.role != .owner && (canEditRoles || canRemove)

        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(isYou ? "You" : shortUserLabel(member.userId))
                    .font(HarvousTypography.body)
                Text(member.role.menuLabel)
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if showMenu {
                Menu {
                    if canEditRoles {
                        ForEach([SpaceMemberRole.admin, SpaceMemberRole.member], id: \.self) { r in
                            Button {
                                _ = spaceStore.setRole(r, member: member, space: space, modelContext: modelContext)
                            } label: {
                                Text(r.menuLabel)
                            }
                        }
                    }
                    if canRemove {
                        if canEditRoles { Divider() }
                        Button("Remove", role: .destructive) {
                            _ = spaceStore.removeMember(member, space: space, modelContext: modelContext)
                        }
                    }
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.CircleDot", edgePt: 18)
                }
            }
        }
    }

    private func shortUserLabel(_ userId: String) -> String {
        let p = String(userId.prefix(8))
        return "Member (\(p)…)"
    }
}

#if os(macOS)

// MARK: - Manage Space (macOS — Add Link–style cards)

extension ManageSpaceSheet {
    @ViewBuilder
    private var manageMacStack: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                manageMacNameCard
                manageMacAppearanceCard
                if space.visibility == .privateShared && canManage {
                    manageMacPrivateInvitesCard
                }
                if space.visibility == .publicShared && canManage {
                    manageMacPublicLinkCard
                }
                if !isPersonalHomeSpace {
                    manageMacMembersCard
                }
                if canManage && space.visibility != .personal {
                    manageMacDangerCard
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func manageMacWrappedCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SpaceSheetMac.outerCorner, style: .continuous)
                    .fill(SpaceSheetMac.cardBackground(colorScheme: colorScheme))
                    .shadow(color: .black.opacity(0.08), radius: 16, y: 6)
            )
    }

    private func manageMacSectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold))
    }

    private func manageMacCaption(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.secondary)
            .padding(.bottom, 3)
    }

    private var manageMacFieldFill: Color {
        Color(nsColor: .textBackgroundColor).opacity(0.55)
    }

    private func manageMacFieldStroke(isFocused: Bool) -> Color {
        isFocused ? Color.harvousAccent : Color(nsColor: .separatorColor).opacity(0.85)
    }

    @ViewBuilder
    private var manageMacNameCard: some View {
        manageMacWrappedCard {
            VStack(alignment: .leading, spacing: 12) {
                manageMacSectionHeader("Name")
                if canManage, !isPersonalHomeSpace {
                    manageMacCaption("Space name")
                    TextField("Space name", text: $renameText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14))
                        .focused($renameFieldFocused)
                        .padding(10)
                        .background(manageMacFieldFill)
                        .background(
                            RoundedRectangle(cornerRadius: SpaceSheetMac.fieldCorner, style: .continuous)
                                .strokeBorder(
                                    manageMacFieldStroke(isFocused: renameFieldFocused),
                                    lineWidth: renameFieldFocused ? 2.5 : 1
                                )
                        )
                    HStack {
                        Spacer()
                        Button("Save name") {
                            _ = spaceStore.renameSpace(space, to: trimmedRenameText, modelContext: modelContext)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!canSaveName)
                    }
                } else {
                    LabeledContent("Space name", value: space.name)
                }
            }
        }
    }

    @ViewBuilder
    private var manageMacAppearanceCard: some View {
        manageMacWrappedCard {
            VStack(alignment: .leading, spacing: 12) {
                manageMacSectionHeader("Appearance")
                if canManage {
                    manageMacCaption("Scripture accent")
                    HStack {
                        Picker("Scripture accent", selection: $scriptureAccent) {
                            ForEach(HarvousColors.ThemeVariant.allCases) { variant in
                                Text(variant.pickerLabel).tag(variant)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .onChange(of: scriptureAccent) { _, new in
                            guard new != space.scriptureTheme else { return }
                            _ = spaceStore.setScriptureTheme(new, for: space, modelContext: modelContext)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(10)
                    .background(manageMacFieldFill)
                    .background(
                        RoundedRectangle(cornerRadius: SpaceSheetMac.fieldCorner, style: .continuous)
                            .strokeBorder(Color(nsColor: .separatorColor).opacity(0.85), lineWidth: 1)
                    )

                    HStack(spacing: 8) {
                        HarvousFAGlyph(assetName: "Harvous.Bookmark", edgePt: 9)
                        Text("John 3:16 NASB")
                            .font(HarvousTypography.inspectorCompactMedium)
                    }
                    .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureAccent).opacity(HarvousScripturePillStyle.labelOpacity))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                            .fill(HarvousColors.scriptureChipBackground(scriptureAccent))
                            .overlay(
                                LinearGradient(
                                    colors: [
                                        HarvousColors.scriptureChipGradientTop(scriptureAccent),
                                        HarvousColors.scriptureChipGradientBottom(scriptureAccent)
                                    ],
                                    startPoint: HarvousColors.scriptureChipGradientStartPoint(scriptureAccent),
                                    endPoint: HarvousColors.scriptureChipGradientEndPoint(scriptureAccent)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous))
                            )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                            .strokeBorder(HarvousColors.scriptureChipBorder(scriptureAccent), lineWidth: 0.5)
                    )
                    .accessibilityHidden(true)

                    Text("Scripture pills, list chips, and the scripture bar use this accent while this space is active.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                } else {
                    LabeledContent("Scripture accent", value: space.scriptureTheme.pickerLabel)
                }
            }
        }
    }

    @ViewBuilder
    private var manageMacPrivateInvitesCard: some View {
        manageMacWrappedCard {
            VStack(alignment: .leading, spacing: 12) {
                manageMacSectionHeader("Private invites")
                Button {
                    if let token = spaceStore.createInvite(for: space, modelContext: modelContext) {
                        let url = "harvous://space/join?token=\(token)"
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(url, forType: .string)
                    }
                } label: {
                    Label("Copy new invite link", image: "Harvous.UserPlus")
                }
                Text("Send the link to someone so they can join this space on their device.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var manageMacPublicLinkCard: some View {
        manageMacWrappedCard {
            VStack(alignment: .leading, spacing: 12) {
                manageMacSectionHeader("Public link")
                if let url = joinURL {
                    manageMacCaption("Link")
                    Text(url.absoluteString)
                        .font(.system(size: 12))
                        .lineLimit(4)
                        .textSelection(.enabled)
                }
                Button {
                    if spaceStore.activeJoinLink(for: space) == nil {
                        _ = spaceStore.regeneratePublicLink(for: space, modelContext: modelContext)
                    }
                    if let url = joinURL {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(url.absoluteString, forType: .string)
                    }
                } label: {
                    Label("Copy link", image: "Harvous.Link")
                }
                Button(role: .destructive) {
                    _ = spaceStore.regeneratePublicLink(for: space, modelContext: modelContext)
                } label: {
                    Label("Regenerate link", image: "Harvous.ArrowsRotate")
                }
            }
        }
    }

    @ViewBuilder
    private var manageMacMembersCard: some View {
        manageMacWrappedCard {
            VStack(alignment: .leading, spacing: 12) {
                manageMacSectionHeader("Members")
                let members = orderedMembers
                ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
                    VStack(spacing: 0) {
                        memberRow(member)
                        if index < members.count - 1 {
                            Divider()
                                .padding(.vertical, 6)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var manageMacDangerCard: some View {
        manageMacWrappedCard {
            VStack(alignment: .leading, spacing: 12) {
                manageMacSectionHeader("Danger Zone")
                Button(role: .destructive) {
                    confirmArchive = true
                } label: {
                    Label("Archive space", image: "Harvous.BoxArchive")
                }
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Delete space and notes", image: "Harvous.Trash")
                }
            }
        }
    }
}

// MARK: - Space sheet chrome (matches Add Link sheet)

private enum SpaceSheetMac {
    static let fieldCorner: CGFloat = 10
    static let outerCorner: CGFloat = 22

    static func cardBackground(colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color(nsColor: .windowBackgroundColor).opacity(0.96) : Color(white: 0.99)
    }
}

private struct CompactModalToolbarButtonStyle: ButtonStyle {
    enum Role { case cancel, primary }
    var role: Role
    var accent: Color = Color.harvousAccent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                Group {
                    switch role {
                    case .cancel:
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color(nsColor: .quaternaryLabelColor).opacity(0.35))
                    case .primary:
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(accent)
                    }
                }
            )
            .foregroundStyle(role == .primary ? Color.white : Color.primary)
            .opacity(configuration.isPressed ? 0.88 : 1)
    }
}

#endif
