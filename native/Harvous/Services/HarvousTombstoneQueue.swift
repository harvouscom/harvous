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
    }
    let kind: Kind
    let serverId: String
    let queuedAt: Date
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

/// Helpers that capture `serverId` before removing a row from SwiftData.
/// Use these in place of `context.delete(...)` at user-visible deletion sites.
enum HarvousSyncingDelete {
    @MainActor
    static func delete(note: Note, context: ModelContext) {
        if let serverId = note.serverId, !serverId.isEmpty {
            HarvousTombstoneQueue.enqueue(
                HarvousTombstone(kind: .note, serverId: serverId, queuedAt: Date())
            )
        }
        context.delete(note)
        HarvousSyncScheduler.scheduleFullSync()
    }

    @MainActor
    static func delete(thread: StudyThread, context: ModelContext) {
        if let serverId = thread.serverId, !serverId.isEmpty {
            HarvousTombstoneQueue.enqueue(
                HarvousTombstone(kind: .studyThread, serverId: serverId, queuedAt: Date())
            )
        }
        context.delete(thread)
        HarvousSyncScheduler.scheduleFullSync()
    }
}
