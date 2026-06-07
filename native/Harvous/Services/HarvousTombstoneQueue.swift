import Foundation
import SwiftData
import os

/// Captures the server id of a deleted local row so the next sync flush can
/// propagate the deletion to the Hono backend. SwiftData removes the row
/// itself synchronously; without this queue the server would keep the row
/// indefinitely.
///
/// Storage: UserDefaults under `harvous.tombstones.v1` as JSON. Drained on
/// successful DELETE; failed rows stay queued for retry.
struct HarvousTombstone: Codable, Equatable {
    enum Kind: String, Codable {
        case note
        case studyThread
        case noteConnection
    }
    let kind: Kind
    let serverId: String
    /// Parent note server id for `.noteConnection` tombstones.
    let fromNoteServerId: String?
    /// Linked note server id for `.noteConnection` tombstones.
    let toNoteServerId: String?
    let queuedAt: Date
}

/// Pure routing for which tombstone to enqueue when a study thread is deleted locally.
enum HarvousTombstoneRouting {
    /// Returns tombstone fields for a deleted study thread, or nil when nothing should sync.
    static func plan(
        serverId: String?,
        entryKindRaw: String,
        fromNoteServerId: String?,
        toNoteServerId: String?
    ) -> (kind: HarvousTombstone.Kind, serverId: String, fromNoteServerId: String?, toNoteServerId: String?)? {
        guard let serverId, !serverId.isEmpty else { return nil }
        let entryKind = StudyThread.EntryKind(rawValue: entryKindRaw)
        if entryKind == .linkedNote, serverId.hasPrefix("nc_") {
            guard let from = fromNoteServerId, !from.isEmpty,
                  let to = toNoteServerId, !to.isEmpty else { return nil }
            return (.noteConnection, "", from, to)
        }
        return (.studyThread, serverId, nil, nil)
    }
}

enum HarvousTombstoneQueue {
    private static let storageKey = "harvous.tombstones.v1"

    static func enqueue(_ tombstone: HarvousTombstone) {
        var current = all()
        if current.contains(tombstone) { return }
        current.append(tombstone)
        write(current)
    }

    static func remove(_ tombstone: HarvousTombstone) {
        var current = all()
        current.removeAll { $0 == tombstone }
        write(current)
    }

    static func all() -> [HarvousTombstone] {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return [] }
        return (try? JSONDecoder().decode([HarvousTombstone].self, from: data)) ?? []
    }

    static func clearAll() {
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    private static func write(_ list: [HarvousTombstone]) {
        if let data = try? JSONEncoder().encode(list) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}

/// Audit tag for note/study-thread deletion (Console filter: `DeleteAudit`).
enum HarvousDeleteTrigger: String {
    case autoSwitch
    case menu
    case swipe
    case spaceDelete
    case syncPrune
    case studyThread
    case explicit
}

/// Helpers that capture `serverId` before removing a row from SwiftData.
/// Use these in place of `context.delete(...)` at user-visible deletion sites.
enum HarvousSyncingDelete {
    private static let deleteAuditLogger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.harvous.app", category: "DeleteAudit")

    @MainActor
    static func delete(note: Note, context: ModelContext, trigger: HarvousDeleteTrigger = .explicit) {
        let localId = note.id.uuidString
        let serverId = note.serverId ?? ""
        deleteAuditLogger.info(
            "note delete trigger=\(trigger.rawValue, privacy: .public) localId=\(localId, privacy: .public) serverId=\(serverId, privacy: .public)"
        )
        if !serverId.isEmpty {
            HarvousTombstoneQueue.enqueue(
                HarvousTombstone(
                    kind: .note,
                    serverId: serverId,
                    fromNoteServerId: nil,
                    toNoteServerId: nil,
                    queuedAt: Date()
                )
            )
        }
        context.delete(note)
        HarvousSyncScheduler.scheduleFullSync()
    }

    @MainActor
    static func delete(thread: StudyThread, context: ModelContext, trigger: HarvousDeleteTrigger = .studyThread) {
        if let plan = tombstonePlan(for: thread, context: context) {
            HarvousTombstoneQueue.enqueue(
                HarvousTombstone(
                    kind: plan.kind,
                    serverId: plan.serverId,
                    fromNoteServerId: plan.fromNoteServerId,
                    toNoteServerId: plan.toNoteServerId,
                    queuedAt: Date()
                )
            )
        }
        let serverId = thread.serverId ?? ""
        deleteAuditLogger.info(
            "studyThread delete trigger=\(trigger.rawValue, privacy: .public) serverId=\(serverId, privacy: .public)"
        )
        context.delete(thread)
        HarvousSyncScheduler.scheduleFullSync()
    }

    @MainActor
    private static func tombstonePlan(
        for thread: StudyThread,
        context: ModelContext
    ) -> (kind: HarvousTombstone.Kind, serverId: String, fromNoteServerId: String?, toNoteServerId: String?)? {
        let fromServerId = noteServerId(forLocalId: thread.parentNoteId, context: context)
        let toServerId = thread.linkedNoteId.flatMap { noteServerId(forLocalId: $0, context: context) }
        return HarvousTombstoneRouting.plan(
            serverId: thread.serverId,
            entryKindRaw: thread.entryKindRaw,
            fromNoteServerId: fromServerId,
            toNoteServerId: toServerId
        )
    }

    @MainActor
    private static func noteServerId(forLocalId id: UUID, context: ModelContext) -> String? {
        let pred = #Predicate<Note> { $0.id == id }
        guard let note = try? context.fetch(FetchDescriptor<Note>(predicate: pred)).first else { return nil }
        return note.serverId
    }
}
