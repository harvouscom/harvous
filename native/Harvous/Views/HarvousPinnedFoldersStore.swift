import Foundation

/// Space-scoped ordering for which folder bucket rows appear first in the sidebar / Library list.
/// Keys are `HarvousFolderRow.id` strings (named folder title or `HarvousFolderRow.ungroupedRowId`).
enum HarvousPinnedFoldersStore {
    private static let prefix = "harvous.pinnedFolderRowIds."
    private static let legacyPrefix = "harvous.pinnedCollectionRowIds."

    static func userDefaultsKey(spaceId: UUID) -> String {
        prefix + spaceId.uuidString
    }

    private static func legacyUserDefaultsKey(spaceId: UUID) -> String {
        legacyPrefix + spaceId.uuidString
    }

    static func loadOrderedIds(spaceId: UUID) -> [String] {
        let key = userDefaultsKey(spaceId: spaceId)
        if let data = UserDefaults.standard.data(forKey: key),
           let decoded = try? JSONDecoder().decode([String].self, from: data) {
            return decoded
        }
        let legacyKey = legacyUserDefaultsKey(spaceId: spaceId)
        guard let legacyData = UserDefaults.standard.data(forKey: legacyKey),
              let decoded = try? JSONDecoder().decode([String].self, from: legacyData)
        else {
            return []
        }
        saveOrderedIds(decoded, spaceId: spaceId)
        return decoded
    }

    static func saveOrderedIds(_ ids: [String], spaceId: UUID) {
        let key = userDefaultsKey(spaceId: spaceId)
        if let data = try? JSONEncoder().encode(ids) {
            UserDefaults.standard.set(data, forKey: key)
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

    /// When renaming a folder, move pin preference from the old row id to the new one (deduped, order preserved).
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
