import SwiftData
import SwiftUI

#if os(iOS)
import UIKit
#endif

@main
struct HarvousApp: App {
    init() {
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
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Note.self])
        .commands {
            HarvousCommands()
        }
        #if os(macOS)
        // Without this, an empty `navigationTitle` still shows `CFBundleName` (“Harvous”) in the title bar.
        .windowToolbarStyle(.unified(showsTitle: false))
        .defaultSize(width: 1100, height: 720)
        .windowResizability(.contentMinSize)
        #endif
    }
}
