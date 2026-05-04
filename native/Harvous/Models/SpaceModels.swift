import Foundation
import SwiftData

/// Personal home vs shareable space kinds.
enum SpaceVisibility: String, Codable, CaseIterable {
    case personal
    case privateShared
    case publicShared

    var menuLabel: String {
        switch self {
        case .personal: return "Personal"
        case .privateShared: return "Private shared"
        case .publicShared: return "Public shared"
        }
    }

    var systemImage: String {
        switch self {
        case .personal: return "rectangle.on.rectangle"
        case .privateShared: return "lock.fill"
        case .publicShared: return "link"
        }
    }
}

enum SpaceMemberRole: String, Codable, CaseIterable {
    case owner
    case admin
    case member

    var menuLabel: String {
        switch self {
        case .owner: return "Owner"
        case .admin: return "Admin"
        case .member: return "Member"
        }
    }
}

@Model
final class Space {
    @Attribute(.unique) var id: UUID
    var name: String
    var visibilityRaw: String
    var ownerUserId: String
    var createdAt: Date
    var updatedAt: Date
    var isArchived: Bool
    /// `HarvousColors.ThemeVariant.rawValue` — accent for scripture pills and related chrome in this space.
    var scriptureThemeRaw: String = "blue"
    /// Server UUID when syncing (v2). Always `nil` in v1.
    var cloudId: UUID?
    /// Tracks rows pending upload in v2. Unused locally in v1.
    var needsSync: Bool = false

    @Relationship(deleteRule: .cascade, inverse: \SpaceMember.space)
    var members: [SpaceMember] = []

    @Relationship(deleteRule: .cascade, inverse: \SpaceInvite.space)
    var invites: [SpaceInvite] = []

    @Relationship(deleteRule: .cascade, inverse: \SpaceJoinLink.space)
    var joinLinks: [SpaceJoinLink] = []

    init(
        id: UUID = UUID(),
        name: String,
        visibility: SpaceVisibility,
        ownerUserId: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        isArchived: Bool = false,
        scriptureThemeRaw: String = "blue",
        cloudId: UUID? = nil,
        needsSync: Bool = false
    ) {
        self.id = id
        self.name = name
        self.visibilityRaw = visibility.rawValue
        self.ownerUserId = ownerUserId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isArchived = isArchived
        self.scriptureThemeRaw = scriptureThemeRaw
        self.cloudId = cloudId
        self.needsSync = needsSync
    }

    var visibility: SpaceVisibility {
        get { SpaceVisibility(rawValue: visibilityRaw) ?? .personal }
        set { visibilityRaw = newValue.rawValue }
    }

}

extension Space: Identifiable {
    var scriptureTheme: HarvousColors.ThemeVariant {
        get { HarvousColors.ThemeVariant(rawValue: scriptureThemeRaw) ?? .blue }
        set { scriptureThemeRaw = newValue.rawValue }
    }
}

@Model
final class SpaceMember {
    @Attribute(.unique) var id: UUID
    var userId: String
    var roleRaw: String
    var joinedAt: Date

    var space: Space?

    init(id: UUID = UUID(), userId: String, role: SpaceMemberRole, joinedAt: Date = Date(), space: Space? = nil) {
        self.id = id
        self.userId = userId
        self.roleRaw = role.rawValue
        self.joinedAt = joinedAt
        self.space = space
    }

    var role: SpaceMemberRole {
        get { SpaceMemberRole(rawValue: roleRaw) ?? .member }
        set { roleRaw = newValue.rawValue }
    }
}

@Model
final class SpaceInvite {
    @Attribute(.unique) var token: String
    var createdAt: Date
    var createdByUserId: String
    var consumedAt: Date?
    var consumedByUserId: String?

    var space: Space?

    init(
        token: String = UUID().uuidString.replacingOccurrences(of: "-", with: ""),
        createdAt: Date = Date(),
        createdByUserId: String,
        space: Space? = nil
    ) {
        self.token = token
        self.createdAt = createdAt
        self.createdByUserId = createdByUserId
        self.space = space
    }
}

@Model
final class SpaceJoinLink {
    @Attribute(.unique) var token: String
    var createdAt: Date
    var revokedAt: Date?

    var space: Space?

    init(token: String = UUID().uuidString.replacingOccurrences(of: "-", with: ""), createdAt: Date = Date(), space: Space? = nil) {
        self.token = token
        self.createdAt = createdAt
        self.space = space
    }

    var isActive: Bool { revokedAt == nil }
}
