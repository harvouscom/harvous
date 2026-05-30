import Foundation
import Observation
import os

#if canImport(ClerkKit)
import ClerkKit
#endif

/// Reads CLERK_PUBLISHABLE_KEY / HARVOUS_API_BASE_URL from Info.plist (which
/// substitutes them from `Harvous-Env.xcconfig` at build time). Crashes loudly
/// in DEBUG if the publishable key is missing or still the `_REPLACE_ME`
/// placeholder — silent fallthrough to a no-auth state would be confusing.
enum HarvousEnvironment {
    static let publishableKey: String = {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "HarvousClerkPublishableKey") as? String) ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        #if DEBUG
        if trimmed.isEmpty || trimmed.hasSuffix("_REPLACE_ME") {
            Logger.app.fault("HarvousClerkPublishableKey missing or unset; edit Configuration/Harvous-Env.xcconfig")
        }
        #endif
        return trimmed
    }()

    static let apiBaseURL: URL = {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "HarvousAPIBaseURL") as? String) ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        if let url = URL(string: trimmed), url.scheme != nil { return url }
        return URL(string: "https://app.harvous.com")!
    }()

    /// Distinguishes the Clerk environment (test vs live) from the publishable key
    /// prefix. Used to give dev (`pk_test_…`) and prod (`pk_live_…`) builds *separate*
    /// local SwiftData stores so notes synced under one environment never appear under
    /// the other (which renders unresolvable cross-environment data and can hang the UI).
    static let storeEnvironmentSlug: String = {
        let key = publishableKey.lowercased()
        if key.hasPrefix("pk_live_") { return "live" }
        if key.hasPrefix("pk_test_") { return "test" }
        return "default"
    }()
}

/// Thin wrapper over the Clerk Swift SDK so that Swift files outside of
/// `HarvousApp.swift` and `SignInGate.swift` don't need a direct `import ClerkKit`.
/// Once `Clerk` is added via SPM (see `native/Harvous/CLERK_SETUP.md`),
/// `#if canImport(ClerkKit)` is satisfied and the real implementation kicks in.
/// Without the SPM dep, `isAuthenticated` is always false and `bearerToken()`
/// returns nil — the app builds but won't pass the sign-in gate.
@MainActor
@Observable
final class HarvousClerkBridge {
    static let shared = HarvousClerkBridge()

    private(set) var isLoaded: Bool = false

    private init() {}

    /// Call once from `HarvousApp.init()` (synchronous configure) and
    /// from a `.task` modifier on the root view (async load).
    func configure() {
        #if canImport(ClerkKit)
        Clerk.configure(publishableKey: HarvousEnvironment.publishableKey)
        #endif
    }

    func load() async {
        #if canImport(ClerkKit)
        // ClerkKit 1.1.x has no public `load()`; `configure()` bootstraps the
        // SDK asynchronously and flips `Clerk.shared.isLoaded` when ready
        // (typically a few hundred ms). Poll with a generous timeout so we
        // never block the gate forever on a flaky network.
        let deadline = Date().addingTimeInterval(10)
        while !Clerk.shared.isLoaded && Date() < deadline {
            try? await Task.sleep(nanoseconds: 50_000_000) // 50 ms
        }
        if !Clerk.shared.isLoaded {
            Logger.app.error("Clerk load timed out; falling through to sign-in UI")
        }
        refreshProfile()
        #endif
        isLoaded = true
    }

    /// True once Clerk has loaded AND a user session is active.
    var isAuthenticated: Bool {
        #if canImport(ClerkKit)
        return Clerk.shared.user != nil
        #else
        return false
        #endif
    }

    /// Stable Clerk user id (`user_…`) for the signed-in session, or nil.
    var userId: String? {
        #if canImport(ClerkKit)
        return Clerk.shared.user?.id
        #else
        return nil
        #endif
    }

    /// Short-lived JWT for Authorization: Bearer headers. Clerk caches and
    /// rotates this internally, so call on every request.
    /// In ClerkKit 1.1.x, `Session.getToken()` returns `String?` directly.
    func bearerToken() async -> String? {
        #if canImport(ClerkKit)
        do {
            return try await Clerk.shared.session?.getToken()
        } catch {
            Logger.app.error("Clerk token fetch failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        #else
        return nil
        #endif
    }

    func signOut() async {
        #if canImport(ClerkKit)
        // SignOut is exposed via the `auth` namespace in ClerkKit 1.1.x.
        try? await Clerk.shared.auth.signOut()
        currentProfile = nil
        #endif
    }

    // MARK: - Profile snapshot

    /// Plain-Swift profile snapshot so settings views never need a direct
    /// `import ClerkKit`. Updated explicitly via `refreshProfile()`.
    private(set) var currentProfile: HarvousUserProfile?

    /// Re-reads `Clerk.shared.user` into the value-type snapshot. Call after
    /// sign-in completes, after `updateProfile()`, and on focus changes that
    /// might have produced a server-side change.
    func refreshProfile() {
        #if canImport(ClerkKit)
        currentProfile = HarvousUserProfile(user: Clerk.shared.user)
        #endif
    }

    /// Update first/last name on the Clerk user.
    func updateProfile(firstName: String?, lastName: String?) async throws {
        #if canImport(ClerkKit)
        guard let user = Clerk.shared.user else {
            throw HarvousProfileError.notSignedIn
        }
        _ = try await user.update(.init(firstName: firstName, lastName: lastName))
        refreshProfile()
        #else
        throw HarvousProfileError.notSignedIn
        #endif
    }

    /// Replace the Clerk profile image with PNG/JPEG bytes.
    func setProfileImage(data: Data) async throws {
        #if canImport(ClerkKit)
        guard let user = Clerk.shared.user else {
            throw HarvousProfileError.notSignedIn
        }
        _ = try await user.setProfileImage(imageData: data)
        refreshProfile()
        #else
        throw HarvousProfileError.notSignedIn
        #endif
    }

    /// Permanently delete the Clerk user account. Caller should confirm first.
    func deleteAccount() async throws {
        #if canImport(ClerkKit)
        guard let user = Clerk.shared.user else {
            throw HarvousProfileError.notSignedIn
        }
        _ = try await user.delete()
        #else
        throw HarvousProfileError.notSignedIn
        #endif
    }

    /// Clerk Account Portal URL for the signed-in user's profile page (macOS fallback when
    /// `UserProfileView` is unavailable). Derived from the publishable key's Frontend API host.
    static func clerkAccountPortalUserURL() -> URL? {
        guard let frontend = clerkFrontendAPIURL(from: HarvousEnvironment.publishableKey),
              var components = URLComponents(url: frontend, resolvingAgainstBaseURL: false),
              let host = components.host
        else { return nil }

        let portalHost: String
        if host.hasSuffix(".clerk.accounts.dev") {
            portalHost = host.replacingOccurrences(of: ".clerk.accounts.dev", with: ".accounts.dev")
        } else if host.hasPrefix("clerk.") {
            portalHost = "accounts." + host.dropFirst("clerk.".count)
        } else {
            portalHost = "accounts." + host
        }

        components.host = portalHost
        components.path = "/user"
        components.query = nil
        components.fragment = nil
        return components.url
    }

    /// Decode `pk_*_<base64>` → Frontend API URL (mirrors ClerkKit `ConfigurationManager`).
    private static func clerkFrontendAPIURL(from publishableKey: String) -> URL? {
        let trimmed = publishableKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("pk_live_") || trimmed.hasPrefix("pk_test_") else { return nil }
        let encoded = trimmed
            .replacingOccurrences(of: "pk_live_", with: "")
            .replacingOccurrences(of: "pk_test_", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "$"))
        guard let data = Data(base64Encoded: encoded),
              var host = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !host.isEmpty
        else { return nil }
        if host.hasSuffix("$") { host.removeLast() }
        guard !host.isEmpty else { return nil }
        return URL(string: "https://\(host)")
    }
}

enum HarvousProfileError: LocalizedError {
    case notSignedIn
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "You're not signed in."
        }
    }
}

/// Value-type mirror of `Clerk.User` so settings views and previews can use it
/// without importing ClerkKit and without holding a reference to the live SDK
/// model. Refresh via `HarvousClerkBridge.shared.refreshProfile()`.
struct HarvousUserProfile: Equatable {
    let userId: String
    let firstName: String?
    let lastName: String?
    let primaryEmail: String?
    let imageUrl: String?
    let hasImage: Bool

    var displayName: String {
        let composed = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces).nilIfEmpty }
            .joined(separator: " ")
        if !composed.isEmpty { return composed }
        if let email = primaryEmail, !email.isEmpty { return email }
        return "Your account"
    }

    /// "First L." — the canonical short label shown anywhere the user's name surfaces
    /// outside the Account editor (toolbars, profile menus, You sheet header).
    /// Falls back to first name only, then full display name.
    var compactDisplayName: String {
        let first = firstName?.trimmingCharacters(in: .whitespaces).nilIfEmpty
        let last = lastName?.trimmingCharacters(in: .whitespaces).nilIfEmpty
        if let first {
            if let initial = last?.first.map({ String($0).uppercased() }) {
                return "\(first) \(initial)."
            }
            return first
        }
        return displayName
    }

    var initials: String {
        let f = firstName?.first.map(String.init) ?? ""
        let l = lastName?.first.map(String.init) ?? ""
        let combined = (f + l).uppercased()
        if !combined.isEmpty { return combined }
        if let email = primaryEmail, let c = email.first {
            return String(c).uppercased()
        }
        return "?"
    }

    #if canImport(ClerkKit)
    init?(user: User?) {
        guard let user else { return nil }
        self.userId = user.id
        self.firstName = user.firstName
        self.lastName = user.lastName
        self.primaryEmail = user.primaryEmailAddress?.emailAddress
        self.imageUrl = user.hasImage ? user.imageUrl : nil
        self.hasImage = user.hasImage
    }
    #endif
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
