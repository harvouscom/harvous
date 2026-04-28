import Combine
import Foundation
import SwiftUI

enum HarvousPendingRoute {
    private static let key = "harvous_pending_route"

    static func set(_ value: String) {
        UserDefaults.standard.set(value, forKey: key)
    }

    @MainActor
    static func take() -> String? {
        let v = UserDefaults.standard.string(forKey: key)
        UserDefaults.standard.removeObject(forKey: key)
        return v
    }

    /// Normalizes `harvous://settings/account/profile`, `harvous:///settings/account/profile`, and `harvous://compose`.
    static func applyURL(_ url: URL) {
        guard url.scheme?.lowercased() == "harvous" else { return }
        var segments: [String] = []
        if let host = url.host, !host.isEmpty {
            segments.append(host.lowercased())
        }
        let pathPart = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !pathPart.isEmpty {
            segments.append(contentsOf: pathPart.split(separator: "/").map { String($0).lowercased() })
        }
        guard !segments.isEmpty else { return }
        set(segments.joined(separator: "/"))
    }
}

@MainActor
final class HarvousAppRouter: ObservableObject {
    @Published var iosShowCompose = false
    @Published var iosSelectedTab = 0
    @Published var youNavigationStack: [HarvousYouNavigation] = []

    #if os(macOS)
    @Published var macSettingsDeepLink: HarvousSettingsSidebarItem?
    #endif

    func applyPendingDeepLink() {
        guard let p = HarvousPendingRoute.take() else { return }
        if p == "you" {
            iosSelectedTab = 3
            youNavigationStack.removeAll()
            return
        }
        if HarvousSettingsPathParser.opensSettingsUI(p) {
            let detail = HarvousSettingsPathParser.detail(fromFullPath: p)
            openYouTabWithSettings(detail: detail)
            return
        }
        switch p {
        case "compose":
            iosShowCompose = true
        case "search":
            iosSelectedTab = 1
        case "recall":
            iosSelectedTab = 0
            #if os(iOS)
            HarvousLiveActivityController.startIfPossible()
            #endif
        default:
            break
        }
    }

    func openYouTabWithSettings(detail: HarvousSettingsSidebarItem?) {
        iosSelectedTab = 3
        youNavigationStack.removeAll()
        youNavigationStack.append(.settingsList)
        if let d = detail {
            youNavigationStack.append(.settingsDetail(d))
        }
    }
}

#if os(macOS)
/// `Window` scene id for macOS preferences (same window chrome as `WindowGroup`, unlike `Settings`).
enum HarvousMacPreferencesWindow {
    static let sceneID = "harvous-preferences"
}
#endif

extension Notification.Name {
    /// macOS: posted from `HarvousCommands` so `ContentView` can `openWindow(id:)`.
    static let harvousOpenMacPreferences = Notification.Name("HarvousOpenMacPreferences")
}
