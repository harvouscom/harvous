import Foundation
import SwiftData
import SwiftUI

private let pendingSpaceJoinTokenKey = "harvous_pending_space_join_token"

@MainActor
final class SpaceStore: ObservableObject {
    private let selectedSpaceKey = "selectedSpaceId"

    @Published var selectedSpaceId: String {
        didSet {
            UserDefaults.standard.set(selectedSpaceId, forKey: selectedSpaceKey)
        }
    }

    @Published var showCreateSpaceSheet = false
    @Published var createSpaceInitialVisibility: SpaceVisibility = .privateShared
    @Published var showManageSpaceSheet = false
    @Published var showJoinSpaceSheet = false
    /// Accent for scripture pills and related UI for the active space (see `Space.scriptureThemeRaw`).
    @Published var scriptureTheme: HarvousColors.ThemeVariant = .blue

    init() {
        let initial = UserDefaults.standard.string(forKey: "selectedSpaceId") ?? ""
        _selectedSpaceId = Published(initialValue: initial)
    }

    func activeSpaceUUID() -> UUID {
        if let u = UUID(uuidString: selectedSpaceId) { return u }
        return HarvousSpaceBootstrap.personalHomeSpaceId
    }

    func setActiveSpace(id: UUID, modelContext: ModelContext) {
        selectedSpaceId = id.uuidString
        refreshScriptureTheme(modelContext: modelContext)
    }

    func refreshScriptureTheme(modelContext: ModelContext) {
        let id = activeSpaceUUID()
        let fd = FetchDescriptor<Space>(predicate: #Predicate { $0.id == id && !$0.isArchived })
        if let space = try? modelContext.fetch(fd).first {
            scriptureTheme = space.scriptureTheme
        } else {
            scriptureTheme = .blue
        }
    }

    func bootstrapIfNeeded(modelContext: ModelContext) {
        HarvousSpaceBootstrap.ensureBootstrap(modelContext: modelContext)
        if let synced = UserDefaults.standard.string(forKey: selectedSpaceKey) {
            selectedSpaceId = synced
        }
        repairSelection(modelContext: modelContext)
        refreshScriptureTheme(modelContext: modelContext)
    }

    func repairSelection(modelContext: ModelContext) {
        let id = activeSpaceUUID()
        let fd = FetchDescriptor<Space>(predicate: #Predicate { $0.id == id && !$0.isArchived })
        if (try? modelContext.fetch(fd).first) != nil { return }
        setActiveSpace(id: HarvousSpaceBootstrap.personalHomeSpaceId, modelContext: modelContext)
    }

    // MARK: - Permissions

    func role(for userId: String, space: Space) -> SpaceMemberRole? {
        space.members.first { $0.userId == userId }?.role
    }

    func roleForCurrentUser(space: Space) -> SpaceMemberRole? {
        role(for: HarvousLocalIdentity.userId, space: space)
    }

    func canManageSettings(space: Space) -> Bool {
        guard let r = roleForCurrentUser(space: space) else { return false }
        return r == .owner || r == .admin
    }

    func isOwner(space: Space) -> Bool {
        roleForCurrentUser(space: space) == .owner
    }

    // MARK: - Create

    func createSpace(
        name: String,
        visibility: SpaceVisibility,
        modelContext: ModelContext
    ) -> Space? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard visibility == .privateShared || visibility == .publicShared else { return nil }

        let uid = HarvousLocalIdentity.userId
        let space = Space(name: trimmed, visibility: visibility, ownerUserId: uid)
        modelContext.insert(space)
        let member = SpaceMember(userId: uid, role: .owner, space: space)
        modelContext.insert(member)

        if visibility == .publicShared {
            let link = SpaceJoinLink(space: space)
            modelContext.insert(link)
        }

        try? modelContext.saveWithLogging()
        setActiveSpace(id: space.id, modelContext: modelContext)
        return space
    }

    // MARK: - Invites (private shared)

    func createInvite(for space: Space, modelContext: ModelContext) -> String? {
        guard space.visibility == .privateShared else { return nil }
        guard canManageSettings(space: space) else { return nil }
        let invite = SpaceInvite(createdByUserId: HarvousLocalIdentity.userId, space: space)
        modelContext.insert(invite)
        try? modelContext.saveWithLogging()
        return invite.token
    }

    // MARK: - Public link

    func activeJoinLink(for space: Space) -> SpaceJoinLink? {
        space.joinLinks.filter(\.isActive).max(by: { $0.createdAt < $1.createdAt })
    }

    func regeneratePublicLink(for space: Space, modelContext: ModelContext) -> String? {
        guard space.visibility == .publicShared else { return nil }
        guard canManageSettings(space: space) else { return nil }
        let now = Date()
        for link in space.joinLinks where link.isActive {
            link.revokedAt = now
        }
        let link = SpaceJoinLink(space: space)
        modelContext.insert(link)
        try? modelContext.saveWithLogging()
        return link.token
    }

    // MARK: - Join

    static func queueJoinTokenFromURL(_ url: URL) {
        guard url.scheme?.lowercased() == "harvous" else { return }
        let host = (url.host ?? "").lowercased()
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let parts = path.split(separator: "/").map { String($0).lowercased() }
        let isJoinPath =
            (host == "space" && parts.first == "join") ||
            (parts.count >= 2 && parts[0] == "space" && parts[1] == "join")
        guard isJoinPath else { return }
        if let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
           let token = items.first(where: { $0.name.lowercased() == "token" })?.value,
           !token.isEmpty {
            UserDefaults.standard.set(token, forKey: pendingSpaceJoinTokenKey)
        }
    }

    func consumePendingJoinToken(modelContext: ModelContext) -> String? {
        let token = UserDefaults.standard.string(forKey: pendingSpaceJoinTokenKey)
        UserDefaults.standard.removeObject(forKey: pendingSpaceJoinTokenKey)
        guard let token, !token.isEmpty else { return nil }
        _ = applyJoinToken(token, modelContext: modelContext)
        return token
    }

    @discardableResult
    func applyJoinToken(_ token: String, modelContext: ModelContext) -> Bool {
        let uid = HarvousLocalIdentity.userId

        let inviteDescriptor = FetchDescriptor<SpaceInvite>()
        if let invites = try? modelContext.fetch(inviteDescriptor),
           let invite = invites.first(where: { $0.token == token && $0.consumedAt == nil }),
           let space = invite.space,
           !space.isArchived {
            if space.members.contains(where: { $0.userId == uid }) {
                setActiveSpace(id: space.id, modelContext: modelContext)
                return true
            }
            invite.consumedAt = Date()
            invite.consumedByUserId = uid
            let member = SpaceMember(userId: uid, role: .member, space: space)
            modelContext.insert(member)
            try? modelContext.saveWithLogging()
            setActiveSpace(id: space.id, modelContext: modelContext)
            return true
        }

        let linkDescriptor = FetchDescriptor<SpaceJoinLink>()
        if let links = try? modelContext.fetch(linkDescriptor),
           let link = links.first(where: { $0.token == token && $0.isActive }),
           let space = link.space,
           space.visibility == .publicShared,
           !space.isArchived {
            if !space.members.contains(where: { $0.userId == uid }) {
                let member = SpaceMember(userId: uid, role: .member, space: space)
                modelContext.insert(member)
            }
            try? modelContext.saveWithLogging()
            setActiveSpace(id: space.id, modelContext: modelContext)
            return true
        }

        return false
    }

    // MARK: - Membership admin

    func setRole(_ role: SpaceMemberRole, member: SpaceMember, space: Space, modelContext: ModelContext) -> Bool {
        guard canManageSettings(space: space) else { return false }
        if member.userId == space.ownerUserId && role != .owner { return false }
        if member.role == .owner && role != .owner { return false }
        if !isOwner(space: space), role == .owner { return false }
        if role == .admin || member.role == .admin {
            guard isOwner(space: space) else { return false }
        }
        member.role = role
        space.updatedAt = Date()
        try? modelContext.saveWithLogging()
        return true
    }

    func removeMember(_ member: SpaceMember, space: Space, modelContext: ModelContext) -> Bool {
        guard canManageSettings(space: space) else { return false }
        guard member.userId != space.ownerUserId else { return false }
        if member.role == .owner { return false }
        let current = roleForCurrentUser(space: space) ?? .member
        if member.role == .admin, current != .owner { return false }
        modelContext.delete(member)
        space.updatedAt = Date()
        try? modelContext.saveWithLogging()
        return true
    }

    // MARK: - Space lifecycle

    func renameSpace(_ space: Space, to name: String, modelContext: ModelContext) -> Bool {
        guard canManageSettings(space: space) else { return false }
        guard space.visibility != .personal else { return false }
        let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return false }
        space.name = t
        space.updatedAt = Date()
        try? modelContext.saveWithLogging()
        return true
    }

    func archiveSpace(_ space: Space, modelContext: ModelContext) -> Bool {
        guard canManageSettings(space: space) else { return false }
        guard space.id != HarvousSpaceBootstrap.personalHomeSpaceId else { return false }
        space.isArchived = true
        space.updatedAt = Date()
        try? modelContext.saveWithLogging()
        if activeSpaceUUID() == space.id {
            setActiveSpace(id: HarvousSpaceBootstrap.personalHomeSpaceId, modelContext: modelContext)
        }
        return true
    }

    func deleteSpace(_ space: Space, modelContext: ModelContext) -> Bool {
        guard canManageSettings(space: space) else { return false }
        guard space.id != HarvousSpaceBootstrap.personalHomeSpaceId else { return false }
        let sid = space.id
        let noteDescriptor = FetchDescriptor<Note>()
        if let notes = try? modelContext.fetch(noteDescriptor) {
            for n in notes where n.resolvedSpaceId() == sid {
                HarvousVaultExporter.removeMirrorFiles(for: n, modelContext: modelContext)
                HarvousNoteSpotlightIndexer.removeNote(id: n.id)
                modelContext.delete(n)
            }
        }
        modelContext.delete(space)
        try? modelContext.saveWithLogging()
        if activeSpaceUUID() == sid {
            setActiveSpace(id: HarvousSpaceBootstrap.personalHomeSpaceId, modelContext: modelContext)
        }
        return true
    }

    func setScriptureTheme(_ theme: HarvousColors.ThemeVariant, for space: Space, modelContext: ModelContext) -> Bool {
        guard canManageSettings(space: space) else { return false }
        space.scriptureTheme = theme
        space.updatedAt = Date()
        try? modelContext.saveWithLogging()
        if space.id == activeSpaceUUID() {
            scriptureTheme = theme
        }
        return true
    }
}
