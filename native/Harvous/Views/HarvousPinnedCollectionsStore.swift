import Foundation

/// Space-scoped ordering for which collection bucket rows appear first in the sidebar / Library list.
/// Keys are `HarvousCollectionRow.id` strings (named collection title or `HarvousCollectionRow.ungroupedRowId`).
enum HarvousPinnedCollectionsStore {
    private static let prefix = "harvous.pinnedCollectionRowIds."

    static func userDefaultsKey(spaceId: UUID) -> String {
        prefix + spaceId.uuidString
    }

    static func loadOrderedIds(spaceId: UUID) -> [String] {
        guard let data = UserDefaults.standard.data(forKey: userDefaultsKey(spaceId: spaceId)),
              let decoded = try? JSONDecoder().decode([String].self, from: data)
        else {
            return []
        }
        return decoded
    }

    static func saveOrderedIds(_ ids: [String], spaceId: UUID) {
        if let data = try? JSONEncoder().encode(ids) {
            UserDefaults.standard.set(data, forKey: userDefaultsKey(spaceId: spaceId))
        }
    }

    static func isPinned(rowId: String, spaceId: UUID) -> Bool {
        loadOrderedIds(spaceId: spaceId).contains(rowId)
    }

    @discardableResult
    static func togglePin(rowId: String, spaceId: UUID) -> [String] {
        var ids = loadOrderedIds(spaceId: spaceId)
        if let i = ids.firstIndex(of: rowId) {
            ids.remove(at: i)
        } else {
            ids.append(rowId)
        }
        saveOrderedIds(ids, spaceId: spaceId)
        return ids
    }

    /// When renaming a collection, move pin preference from the old row id to the new one (deduped, order preserved).
    static func replacePinId(oldId: String, newId: String, spaceId: UUID) {
        var ids = loadOrderedIds(spaceId: spaceId)
        ids = ids.map { $0 == oldId ? newId : $0 }
        var result: [String] = []
        var seen = Set<String>()
        for id in ids where seen.insert(id).inserted {
            result.append(id)
        }
        saveOrderedIds(result, spaceId: spaceId)
    }

    static func removePinId(_ rowId: String, spaceId: UUID) {
        var ids = loadOrderedIds(spaceId: spaceId)
        ids.removeAll { $0 == rowId }
        saveOrderedIds(ids, spaceId: spaceId)
    }
}
