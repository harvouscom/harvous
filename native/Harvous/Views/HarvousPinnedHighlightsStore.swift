import Foundation

/// Space-scoped ordering for pinned `StudyThread` rows in the Highlights list.
/// Keys are `StudyThread.id.uuidString`.
enum HarvousPinnedHighlightsStore {
    private static let prefix = "harvous.pinnedHighlightThreadIds."

    static func userDefaultsKey(spaceId: UUID) -> String {
        prefix + spaceId.uuidString
    }

    static func loadOrderedIds(spaceId: UUID) -> [String] {
        let key = userDefaultsKey(spaceId: spaceId)
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }
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

    static func removePinId(_ rowId: String, spaceId: UUID) {
        var ids = loadOrderedIds(spaceId: spaceId)
        ids.removeAll { $0 == rowId }
        saveOrderedIds(ids, spaceId: spaceId)
    }
}
