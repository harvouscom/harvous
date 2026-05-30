import Foundation
import SwiftData

enum HarvousSpaceBootstrap {
    /// Stable id for the default personal space (migration + default notes).
    static let personalHomeSpaceId = UUID(uuidString: "A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D")!

    /// Legacy `SpaceSwitcherView` used this before spaces were UUID-backed.
    static let legacyMyHomeAppStorageId = "my-home"

    private static let selectedSpaceKey = "selectedSpaceId"

    /// Ensures personal home exists, migrates legacy note + selection state, and saves.
    @MainActor
    static func ensureBootstrap(modelContext: ModelContext) {
        let uid = HarvousLocalIdentity.userId
        let homeId = personalHomeSpaceId

        let spaceDescriptor = FetchDescriptor<Space>(predicate: #Predicate { $0.id == homeId })
        if (try? modelContext.fetch(spaceDescriptor).first) == nil {
            let created = Space(id: homeId, name: "My Home", visibility: .personal, ownerUserId: uid)
            modelContext.insert(created)
            let owner = SpaceMember(userId: uid, role: .owner, space: created)
            modelContext.insert(owner)
        }

        migrateLegacyNotes(modelContext: modelContext, homeId: homeId)
        migrateSelectedSpaceIdIfNeeded(homeId: homeId)
        try? modelContext.saveWithLogging()
    }

    private static func migrateLegacyNotes(modelContext: ModelContext, homeId: UUID) {
        let spaceDescriptor = FetchDescriptor<Space>()
        let knownSpaceIds = Set((try? modelContext.fetch(spaceDescriptor))?.map(\.id) ?? [])
        let noteDescriptor = FetchDescriptor<Note>()
        guard let notes = try? modelContext.fetch(noteDescriptor) else { return }
        for note in notes {
            // Legacy notes had no space id; scope them to personal home.
            if note.spaceId == nil {
                note.spaceId = homeId
                continue
            }
            // Defensive repair: if a note points at a missing space row, surface it again in My Home
            // instead of silently hiding it from active-space filters.
            if let sid = note.spaceId, !knownSpaceIds.contains(sid) {
                note.spaceId = homeId
            }
        }
    }

    /// Returns `note.spaceId` when that space row exists locally; otherwise personal home.
    /// Cross-environment sync (prod notes in a dev store) can leave orphan space UUIDs that
    /// make space-scoped thread fetches miss data and, in worst cases, stall note open.
    @MainActor
    static func validatedSpaceId(
        for note: Note,
        in context: ModelContext,
        defaultHome: UUID = personalHomeSpaceId
    ) -> UUID {
        let candidate = note.spaceId ?? defaultHome
        let sid = candidate
        let descriptor = FetchDescriptor<Space>(predicate: #Predicate { $0.id == sid })
        if (try? context.fetch(descriptor).first) != nil {
            return candidate
        }
        return defaultHome
    }

    /// Repairs notes whose `spaceId` points at a missing `Space` row (legacy drift / cross-env).
    @MainActor
    static func healNoteSpaceIfNeeded(_ note: Note, in context: ModelContext) {
        guard let sid = note.spaceId else { return }
        let descriptor = FetchDescriptor<Space>(predicate: #Predicate { $0.id == sid })
        if (try? context.fetch(descriptor).first) == nil {
            note.spaceId = personalHomeSpaceId
        }
    }

    private static func migrateSelectedSpaceIdIfNeeded(homeId: UUID) {
        let raw = UserDefaults.standard.string(forKey: selectedSpaceKey) ?? ""
        if raw.isEmpty || raw == legacyMyHomeAppStorageId {
            UserDefaults.standard.set(homeId.uuidString, forKey: selectedSpaceKey)
            return
        }
        if UUID(uuidString: raw) == nil {
            UserDefaults.standard.set(homeId.uuidString, forKey: selectedSpaceKey)
        }
    }
}

extension Note {
    /// Resolves note scope for display and filtering (no SwiftData lookup).
    func resolvedSpaceId(defaultHome: UUID = HarvousSpaceBootstrap.personalHomeSpaceId) -> UUID {
        spaceId ?? defaultHome
    }

    /// Like `resolvedSpaceId()`, but verifies the space row exists in the local store.
    @MainActor
    func resolvedSpaceId(
        in context: ModelContext,
        defaultHome: UUID = HarvousSpaceBootstrap.personalHomeSpaceId
    ) -> UUID {
        HarvousSpaceBootstrap.validatedSpaceId(for: self, in: context, defaultHome: defaultHome)
    }
}
