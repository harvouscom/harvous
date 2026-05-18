import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// iCloud container id (must match entitlements and Info.plist `NSUbiquitousContainers`).
enum HarvousVaultICloud {
    static let containerIdentifier = "iCloud.com.harvous.app"
}

/// UserDefaults-backed preferences and security-scoped bookmark resolution for the Markdown vault.
enum HarvousVaultPreferences {
    private static let mirrorKey = "harvous.vault.mirrorEnabled"
    private static let bookmarkKey = "harvous.vault.externalFolderBookmark"
    private static let lastWriteKey = "harvous.vault.lastWriteAt"
    private static let noteCountKey = "harvous.vault.exportedNoteCount"

    static var isMirrorEnabled: Bool {
        get {
            if UserDefaults.standard.object(forKey: mirrorKey) == nil { return true }
            return UserDefaults.standard.bool(forKey: mirrorKey)
        }
        set { UserDefaults.standard.set(newValue, forKey: mirrorKey) }
    }

    static var lastVaultWriteAt: Date? {
        get { UserDefaults.standard.object(forKey: lastWriteKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: lastWriteKey) }
    }

    static var cachedExportedNoteCount: Int {
        get { UserDefaults.standard.integer(forKey: noteCountKey) }
        set { UserDefaults.standard.set(newValue, forKey: noteCountKey) }
    }

    /// When set, vault reads/writes use this security-scoped folder instead of iCloud Documents.
    static var externalVaultBookmarkData: Data? {
        get { UserDefaults.standard.data(forKey: bookmarkKey) }
        set { UserDefaults.standard.set(newValue, forKey: bookmarkKey) }
    }

    static func clearExternalVaultBookmark() {
        UserDefaults.standard.removeObject(forKey: bookmarkKey)
    }
}

enum HarvousVaultError: Error {
    case noApplicationSupportDirectory
}

/// Resolves the root URL of the Harvous vault (`Harvous/` …) and ensures admin folders exist.
enum HarvousVaultLocation {
    private static let vaultRootFolderName = "Harvous"

    static var isUsingExternalBookmark: Bool {
        HarvousVaultPreferences.externalVaultBookmarkData != nil
    }

    static var isUsingICloud: Bool {
        if isUsingExternalBookmark { return false }
        return FileManager.default.url(forUbiquityContainerIdentifier: HarvousVaultICloud.containerIdentifier) != nil
    }

    /// Picked folder URL (macOS / iOS document scope). Does not include the inner `Harvous/` directory name.
    static func externalScopeBaseURL() -> URL? {
        resolveBookmarkedExternalURL()
    }

    /// Top-level vault root containing space folders and `_harvous`.
    static func vaultRootURL() throws -> URL {
        if let bookmarked = resolveBookmarkedExternalURL() {
            return try ensureVaultTree(under: bookmarked)
        }
        if let cloud = FileManager.default.url(forUbiquityContainerIdentifier: HarvousVaultICloud.containerIdentifier) {
            let docs = cloud.appendingPathComponent("Documents", isDirectory: true)
            return try ensureVaultTree(under: docs)
        }
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw HarvousVaultError.noApplicationSupportDirectory
        }
        let fallback = base
            .appendingPathComponent("Harvous", isDirectory: true)
            .appendingPathComponent("VaultMirror", isDirectory: true)
        return try ensureVaultTree(under: fallback)
    }

    private static func ensureVaultTree(under base: URL) throws -> URL {
        let fm = FileManager.default
        let root = base.appendingPathComponent(vaultRootFolderName, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        let admin = root.appendingPathComponent("_harvous", isDirectory: true)
        try fm.createDirectory(at: admin, withIntermediateDirectories: true)
        let highlights = admin.appendingPathComponent("highlights", isDirectory: true)
        try fm.createDirectory(at: highlights, withIntermediateDirectories: true)
        let inbox = admin.appendingPathComponent("inbox", isDirectory: true)
        try fm.createDirectory(at: inbox, withIntermediateDirectories: true)
        return root
    }

    private static func resolveBookmarkedExternalURL() -> URL? {
        guard let data = HarvousVaultPreferences.externalVaultBookmarkData else { return nil }
        var stale = false
        #if os(macOS)
        guard let url = try? URL(
            resolvingBookmarkData: data,
            options: [.withSecurityScope],
            relativeTo: nil,
            bookmarkDataIsStale: &stale
        ) else { return nil }
        #else
        guard let url = try? URL(
            resolvingBookmarkData: data,
            options: [],
            relativeTo: nil,
            bookmarkDataIsStale: &stale
        ) else { return nil }
        #endif
        _ = stale
        return url
    }

    /// Persist security-scoped bookmark for a user-picked folder (should be a directory URL).
    static func setExternalVaultFolder(_ url: URL) throws {
        #if os(macOS)
        let data = try url.bookmarkData(
            options: [.withSecurityScope],
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
        #else
        let data = try url.bookmarkData(
            options: [],
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
        #endif
        HarvousVaultPreferences.externalVaultBookmarkData = data
    }

    /// Human-readable label for settings (short).
    static func vaultKindDescription() -> String {
        if isUsingExternalBookmark { return "External folder" }
        if isUsingICloud { return "iCloud Drive" }
        #if os(iOS)
        return "On this device (App Support)"
        #else
        return "On this Mac (App Support)"
        #endif
    }

    /// Run file work with security scope when the user picked an external vault folder (macOS / iOS).
    static func withSecurityScopeIfNeeded<T>(_ body: () throws -> T) rethrows -> T {
        guard let scope = externalScopeBaseURL() else {
            return try body()
        }
        let ok = scope.startAccessingSecurityScopedResource()
        defer {
            if ok { scope.stopAccessingSecurityScopedResource() }
        }
        return try body()
    }

    /// Opens the vault root folder in Finder (macOS) or copies its path on iOS (for pasting in Files).
    static func revealVaultRootInSystem() {
        withSecurityScopeIfNeeded {
            guard let url = try? vaultRootURL() else { return }
            #if os(macOS)
            NSWorkspace.shared.activateFileViewerSelecting([url])
            #else
            UIPasteboard.general.string = url.path
            #endif
        }
    }
}
