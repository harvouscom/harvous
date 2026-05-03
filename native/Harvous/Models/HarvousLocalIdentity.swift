import Foundation

/// Stable on-device identity for native-only collaboration (no backend).
enum HarvousLocalIdentity {
    private static let userDefaultsKey = "harvousLocalUserId"

    static var userId: String {
        if let existing = UserDefaults.standard.string(forKey: userDefaultsKey), !existing.isEmpty {
            return existing
        }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: userDefaultsKey)
        return id
    }
}
