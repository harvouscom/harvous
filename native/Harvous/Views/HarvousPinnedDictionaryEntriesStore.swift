import Foundation

/// Device-wide ordering for pinned Easton's dictionary entries (slug strings).
/// Dictionary content is global (not space-scoped), so pins are too.
enum HarvousPinnedDictionaryEntriesStore {
    private static let key = "harvous.pinnedEastonsSlugs"

    static func loadOrderedSlugs() -> [String] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }
        return decoded
    }

    static func saveOrderedSlugs(_ slugs: [String]) {
        if let data = try? JSONEncoder().encode(slugs) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func isPinned(slug: String) -> Bool {
        loadOrderedSlugs().contains(slug)
    }

    @discardableResult
    static func togglePin(slug: String) -> [String] {
        var slugs = loadOrderedSlugs()
        if let i = slugs.firstIndex(of: slug) {
            slugs.remove(at: i)
        } else {
            slugs.append(slug)
        }
        saveOrderedSlugs(slugs)
        return slugs
    }
}
