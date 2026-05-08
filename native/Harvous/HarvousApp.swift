import SwiftData
import SwiftUI
import os

#if os(iOS)
import UIKit
#endif

extension Logger {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.harvous.app"

    static let app       = Logger(subsystem: subsystem, category: "app")
    static let editor    = Logger(subsystem: subsystem, category: "editor")
    static let highlight = Logger(subsystem: subsystem, category: "highlight")
    static let vault     = Logger(subsystem: subsystem, category: "vault")
    static let settings  = Logger(subsystem: subsystem, category: "settings")
}

@main
struct HarvousApp: App {
    /// Wake Netlify function + Postgres before the user taps a scripture pill (non-blocking).
    init() {
        if !HarvousLaunchArguments.isUITesting {
            ScriptureVerseFetch.warmBackendForVerseFetch()
        }
    }

    @StateObject private var appRouter = HarvousAppRouter()
    @StateObject private var spaceStore = SpaceStore()
    #if os(macOS)
    @StateObject private var macNoteListSelectionCoordinator = MacNoteListSelectionCoordinator()
    #endif

    /// Built once, explicitly, so we can log migration failures instead of silently
    /// falling back to an in-memory store (which is what `.modelContainer(for:)` does
    /// when auto-migration can't reconcile a schema change).
    private let modelContainer: ModelContainer = HarvousApp.makeModelContainer()


    private static func makeModelContainer() -> ModelContainer {
        let schema = Schema([
            Note.self,
            NoteSnapshot.self,
            StudyThread.self,
            Space.self,
            SpaceMember.self,
            SpaceInvite.self,
            SpaceJoinLink.self,
        ])

        // Pin the store to a stable Application Support URL so the location can't
        // move between build configs or Xcode versions.
        let storeURL: URL? = {
            let fm = FileManager.default
            guard let dir = try? fm.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            ) else { return nil }
            let appDir = dir.appendingPathComponent("Harvous", isDirectory: true)
            try? fm.createDirectory(at: appDir, withIntermediateDirectories: true)
            return appDir.appendingPathComponent("Harvous.store")
        }()

        let config: ModelConfiguration
        if let storeURL {
            config = ModelConfiguration(schema: schema, url: storeURL)
        } else {
            config = ModelConfiguration(schema: schema)
        }

        do {
            let container = try ModelContainer(for: schema, configurations: [config])
            Logger.app.info("SwiftData store ready at \(storeURL?.path ?? "<default>", privacy: .public)")
            return container
        } catch {
            // If we let this fall through to an in-memory container, every launch
            // would silently start empty. Log loudly so we can see the real reason
            // (typically: an unsupported lightweight migration). Then crash so we
            // never silently destroy the user's persisted notes.
            Logger.app.fault("Failed to open SwiftData store: \(error.localizedDescription, privacy: .public)")
            Logger.app.fault("Store url: \(storeURL?.path ?? "<default>", privacy: .public)")
            #if DEBUG
            if let storeURL {
                Logger.app.debug("Attempting one-time relocation of persisted store artifacts, then retrying…")
                if relocateCorruptedStoreBundle(primarySQLiteURL: storeURL) {
                    do {
                        let container = try ModelContainer(for: schema, configurations: [config])
                        Logger.app.info("SwiftData store recovered after relocating prior files; opened at \(storeURL.path, privacy: .public)")
                        return container
                    } catch let retryErr {
                        Logger.app.error("Retry after relocation also failed: \(retryErr.localizedDescription, privacy: .public)")
                    }
                }
            }
            Logger.app.error("To reset local data: quit the app and remove ~/Library/Application Support/Harvous/")
            #endif
            fatalError("SwiftData store failed to open; see console for details: \(error)")
        }
    }

    /// Moves the primary SwiftData SQLite file plus common sidecars into a timestamped sibling folder so a fresh store can be created at the original URL (DEBUG-only recovery path).
    private static func relocateCorruptedStoreBundle(primarySQLiteURL: URL) -> Bool {
        let fm = FileManager.default
        let dir = primarySQLiteURL.deletingLastPathComponent()
        let baseName = primarySQLiteURL.lastPathComponent
        guard fm.fileExists(atPath: primarySQLiteURL.path) else { return false }
        guard let entries = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return false
        }
        let related = entries.filter { url in
            let name = url.lastPathComponent
            return name == baseName || name.hasPrefix(baseName + "-")
        }
        guard !related.isEmpty else { return false }
        let stamp = String(Int(Date().timeIntervalSince1970))
        let backupDir = dir.appendingPathComponent("\(baseName).corrupt-bundle.\(stamp)", isDirectory: true)
        do {
            try fm.createDirectory(at: backupDir, withIntermediateDirectories: true)
            for url in related {
                let dest = backupDir.appendingPathComponent(url.lastPathComponent)
                try fm.moveItem(at: url, to: dest)
                Logger.app.info("Relocated corrupt store file: \(url.lastPathComponent, privacy: .public) → \(backupDir.lastPathComponent, privacy: .public)/")
            }
            return true
        } catch {
            Logger.app.error("Could not relocate store bundle: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appRouter)
                .environmentObject(spaceStore)
                #if os(macOS)
                .environmentObject(macNoteListSelectionCoordinator)
                .frame(minWidth: 980)
                #endif
        }
        #if os(macOS)
        // Unified title bar + traffic lights: same as document window (glass reads under the toolbar).
        .windowToolbarStyle(.unified(showsTitle: false))
        .defaultSize(width: 1100, height: 720)
        .windowResizability(.contentMinSize)
        #endif
        .modelContainer(modelContainer)
        #if os(macOS)
        .commands {
            HarvousCommands(macNoteListCoordinator: macNoteListSelectionCoordinator)
        }
        #else
        .commands {
            HarvousCommands()
        }
        #endif
        #if os(macOS)
        // Use `Window`, not `Settings`, so this window matches the document `WindowGroup` chrome (corner radius,
        // title bar). `Settings` is a separate window class and never quite matches. ⌘, is wired in `HarvousCommands`.
        Window("Settings", id: HarvousMacPreferencesWindow.sceneID) {
            MacPreferencesRootView()
                .environmentObject(appRouter)
                .environmentObject(spaceStore)
                .environment(\.harvousScriptureTheme, spaceStore.scriptureTheme)
        }
        .modelContainer(modelContainer)
        // Pane name from `navigationTitle` lives in the title bar next to traffic lights + toolbar (not a second row).
        .windowToolbarStyle(.unified(showsTitle: true))
        .defaultSize(width: 800, height: 560)
        .windowResizability(.contentMinSize)
        #endif
    }
}
