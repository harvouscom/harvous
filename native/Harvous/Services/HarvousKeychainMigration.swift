import Foundation
#if os(macOS)
import Security
#endif

/// One-time cleanup for ClerkKit keychain rows created before the app used a
/// Keychain Access Group. Those legacy items pin ACLs to a specific code signature;
/// every Xcode rebuild then triggers the login-keychain password dialog on read.
enum HarvousKeychainMigration {
    private static let migratedDefaultsKey = "harvous.clerkKeychainAccessGroupMigrated"

    /// Best-effort delete of legacy Clerk rows (service = bundle id, no access group).
    /// Uses `kSecUseAuthenticationUISkip` so macOS does not show the login-keychain dialog.
    static func clearLegacyClerkKeychainIfNeeded(service: String) {
        #if os(macOS)
        guard !UserDefaults.standard.bool(forKey: migratedDefaultsKey) else { return }
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        query[kSecUseAuthenticationUI as String] = kSecUseAuthenticationUISkip
        SecItemDelete(query as CFDictionary)
        UserDefaults.standard.set(true, forKey: migratedDefaultsKey)
        #endif
    }
}
