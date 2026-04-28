import SwiftData
import SwiftUI

#if os(iOS)
import UIKit
#endif

@main
struct HarvousApp: App {
    @StateObject private var appRouter = HarvousAppRouter()

    init() {
        HarvousRecallNotifications.registerCategories()
        #if os(iOS)
        let navTitle = HarvousFonts.system(size: 17, weight: 600, design: .default)
        let navLarge = HarvousFonts.system(size: 28, weight: 600, design: .rounded)
        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.titleTextAttributes = [.font: navTitle]
        appearance.largeTitleTextAttributes = [.font: navLarge]
        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance
        UINavigationBar.appearance().compactAppearance = appearance
        HarvousRecallNotifications.registerBackgroundTasks()
        #endif

        ScriptureVerseFetch.warmBackendForVerseFetch()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appRouter)
                .task {
                    HarvousRecallNotifications.requestAuthorizationIfNeeded()
                    #if os(iOS)
                    HarvousRecallNotifications.scheduleBackgroundRefresh()
                    #endif
                }
        }
        #if os(macOS)
        // Unified title bar + traffic lights: same as document window (glass reads under the toolbar).
        .windowToolbarStyle(.unified(showsTitle: false))
        .defaultSize(width: 1100, height: 720)
        .windowResizability(.contentMinSize)
        #endif
        .modelContainer(for: [Note.self])
        .commands {
            HarvousCommands()
        }
        #if os(macOS)
        // Use `Window`, not `Settings`, so this window matches the document `WindowGroup` chrome (corner radius,
        // title bar). `Settings` is a separate window class and never quite matches. ⌘, is wired in `HarvousCommands`.
        Window("Settings", id: HarvousMacPreferencesWindow.sceneID) {
            MacPreferencesRootView()
                .environmentObject(appRouter)
        }
        // Pane name from `navigationTitle` lives in the title bar next to traffic lights + toolbar (not a second row).
        .windowToolbarStyle(.unified(showsTitle: true))
        .defaultSize(width: 800, height: 560)
        .windowResizability(.contentMinSize)
        #endif
    }
}
