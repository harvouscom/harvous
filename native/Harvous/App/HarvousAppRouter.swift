import Combine
import Foundation
import SwiftUI

#if os(iOS)
/// Primary content surface on iPhone — single-column shell with bottom controls.
enum HarvousIOSListSurface: String, CaseIterable {
    case notes
    case collections
    case more

    static let persistenceKey = "harvous_ios_list_surface_v1"
}
#endif

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
    #if os(iOS)
    @Published private(set) var iosListSurface: HarvousIOSListSurface
    /// Drives the You/More sheet (not an inline surface — always a modal).
    @Published var iosShowMore = false
    /// Inline `.searchable` presentation driven by the bottom search pill (Collections tab).
    @Published var iosInlineSearchPresented = false
    @Published var iosInlineSearchText = ""
    /// Notes tab: filter sheet (list has no `.searchable` chrome).
    @Published var iosNotesFilterSearchPresented = false
    /// When set (and note body focused with no scripture editor), `ContentView` shows `NoteToolbar` instead of the tab bottom chrome.
    @Published private(set) var iosActiveNoteEditorChromeProxy: EditorProxy?
    private var iosNoteChromeCancellable: AnyCancellable?

    func iosRegisterNoteEditorChrome(proxy: EditorProxy) {
        iosNoteChromeCancellable?.cancel()
        iosNoteChromeCancellable = proxy.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
        iosActiveNoteEditorChromeProxy = proxy
    }

    func iosUnregisterNoteEditorChrome(proxy: EditorProxy) {
        guard iosActiveNoteEditorChromeProxy === proxy else { return }
        iosNoteChromeCancellable?.cancel()
        iosNoteChromeCancellable = nil
        iosActiveNoteEditorChromeProxy = nil
    }

    #endif
    @Published var youNavigationStack: [HarvousYouNavigation] = []

    #if os(macOS)
    @Published var macSettingsDeepLink: HarvousSettingsSidebarItem?
    #endif

    init() {
        #if os(iOS)
        let raw = UserDefaults.standard.string(forKey: HarvousIOSListSurface.persistenceKey)
        let persisted = HarvousIOSListSurface(rawValue: raw ?? "") ?? .notes
        // .more is now a sheet, not an inline surface — fall back to .notes and open the sheet.
        if persisted == .more {
            iosListSurface = .notes
            iosShowMore = true
        } else {
            iosListSurface = persisted
        }
        #endif
    }

    #if os(iOS)
    /// Changes list surface and persists selection for next launch.
    /// Passing `.more` opens the You sheet without changing the underlying surface.
    func selectIOSListSurface(_ surface: HarvousIOSListSurface) {
        if surface == .more {
            iosShowMore = true
            iosInlineSearchText = ""
            iosInlineSearchPresented = false
            iosNotesFilterSearchPresented = false
            return
        }
        iosShowMore = false
        let prev = iosListSurface
        guard prev != surface else { return }
        iosListSurface = surface
        UserDefaults.standard.set(surface.rawValue, forKey: HarvousIOSListSurface.persistenceKey)
        iosInlineSearchText = ""
        iosInlineSearchPresented = false
        iosNotesFilterSearchPresented = false
    }

    func applyPendingDeepLink() {
        guard let p = HarvousPendingRoute.take() else { return }
        if p == "you" {
            youNavigationStack.removeAll()
            iosShowMore = true
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
            iosShowMore = false
            switch iosListSurface {
            case .notes:
                iosNotesFilterSearchPresented = true
            case .collections:
                iosInlineSearchPresented = true
            case .more:
                break
            }
        case "recall":
            selectIOSListSurface(.notes)
            HarvousLiveActivityController.startIfPossible()
        default:
            break
        }
    }

    func openYouTabWithSettings(detail: HarvousSettingsSidebarItem?) {
        youNavigationStack.removeAll()
        youNavigationStack.append(.settingsList)
        if let d = detail {
            youNavigationStack.append(.settingsDetail(d))
        }
        iosShowMore = true
    }
    #endif
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
