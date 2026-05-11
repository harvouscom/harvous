import Combine
import Foundation
import SwiftUI

#if os(iOS)
/// Primary content surface on iPhone — single-column shell with bottom controls.
enum HarvousIOSListSurface: String, CaseIterable {
    case notes
    case folders
    case scripture
    case highlights
    case more

    static let persistenceKey = "harvous_ios_list_surface_v3"
    static let legacyPersistenceKeyV2 = "harvous_ios_list_surface_v2"
    static let legacyPersistenceKeyV1 = "harvous_ios_list_surface_v1"

    /// FA catalog (`Harvous.*`) for the floating list-picker orb — matches `SidebarPanelView.SidebarMode.icon` on macOS.
    var catalogGlyphAssetName: String {
        switch self {
        case .notes: "Harvous.Note"
        case .folders: "Harvous.Folder"
        case .scripture: "Harvous.BookOpen"
        case .highlights: "Harvous.Highlight"
        case .more: "Harvous.Note"
        }
    }

    /// Short chrome label — matches sidebar mode titles / menu rows.
    var listChromeMenuTitle: String {
        switch self {
        case .notes: "Notes"
        case .folders: "Folders"
        case .scripture: "Scripture"
        case .highlights: "Highlights"
        case .more: "Account"
        }
    }
}

/// Data for `NoteConnectionsBar` + scripture-bar gating while the note editor owns the bottom safe-area chrome.
struct HarvousIOSNoteFooterSupplement {
    let note: Note
    var trailSnapshot: ThreadStore.TrailSnapshot
    var connectionsTitleLine: String
    var suppressScripturePillActionBar: Bool
    /// When a **pinned** highlight or scripture **overlay** dock is visible (`activePillDock` / pinned highlight),
    /// hide the bottom morphing row’s leading slot (connections / format shell) but keep the same layout height
    /// so inline study docks stay the usual distance above the keyboard.
    var suppressesBottomMorphingChromeContent: Bool
    var onRefreshConnections: () -> Void
    var onOpenLinkedNote: (UUID) -> Void
}
#endif

/// One-shot handoff from Highlights list → `NoteEditorView` (consumes when the destination note is active).
struct PendingStudyHighlightActivation: Equatable {
    let noteId: UUID
    let threadId: UUID
    /// Unique per request so repeated taps re-trigger `onChange`.
    let requestId: UUID
}

/// Highlights list → standalone scripture dock (passage-underline highlights shared across notes).
struct StandaloneScripturePassageDockPresentation: Identifiable, Equatable {
    let id: UUID
    let canonicalReference: String
    let translationCode: String
    let focusedHighlightThreadId: UUID

    init(canonicalReference: String, translationCode: String, focusedHighlightThreadId: UUID) {
        self.id = UUID()
        let trimmedCanon = canonicalReference.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTrans = translationCode.trimmingCharacters(in: .whitespacesAndNewlines)
        self.canonicalReference = trimmedCanon
        self.translationCode = trimmedTrans
        self.focusedHighlightThreadId = focusedHighlightThreadId
    }
}

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
    #if os(iOS)
    @Published private(set) var iosListSurface: HarvousIOSListSurface
    /// Drives the Account sheet (You root + settings; not an inline surface — always a modal).
    @Published var iosShowMore = false
    @Published var iosInlineSearchText = ""
    /// Notes tab: filter sheet (list has no `.searchable` chrome).
    @Published var iosNotesFilterSearchPresented = false
    /// When set, the root bottom inset shows the note editor chrome (formatting / scripture / connections) instead of list + search.
    @Published private(set) var iosActiveNoteEditorChromeProxy: EditorProxy?
    /// Linked-note trail + callbacks for `NoteConnectionsBar` in the bottom inset (cleared with proxy).
    @Published var iosNoteFooterSupplement: HarvousIOSNoteFooterSupplement?
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
        iosNoteFooterSupplement = nil
    }

    #endif
    @Published var youNavigationStack: [HarvousYouNavigation] = []

    #if os(macOS)
    @Published var macSettingsDeepLink: HarvousSettingsSidebarItem?
    #endif

    @Published private(set) var pendingStudyHighlightActivation: PendingStudyHighlightActivation?
    /// When set from the Highlights list, `NoteEditorView` stays empty and the scripture passage dock floats in the detail column (macOS) or sheet (iOS).
    @Published private(set) var standaloneScripturePassageDock: StandaloneScripturePassageDockPresentation?
    /// Passage-underline highlight that reads as selected in the Highlights list while standalone dock is open (follows taps in the scripture dock body).
    @Published private(set) var standaloneScriptureFocusedPassageHighlightId: UUID?

    /// Highlight list row → open parent note and focus the highlight dock.
    func enqueueStudyHighlightListActivation(noteId: UUID, threadId: UUID) {
        standaloneScripturePassageDock = nil
        standaloneScriptureFocusedPassageHighlightId = nil
        pendingStudyHighlightActivation = PendingStudyHighlightActivation(
            noteId: noteId,
            threadId: threadId,
            requestId: UUID()
        )
    }

    func clearPendingStudyHighlightActivation() {
        pendingStudyHighlightActivation = nil
    }

    /// Highlights list scripture-passage underline row — opens scripture dock focused on `threadId`; does not navigate to any note.
    func presentStandaloneScripturePassageDock(
        canonicalReference: String,
        translationCode: String,
        focusedHighlightThreadId: UUID
    ) {
        clearPendingStudyHighlightActivation()
        standaloneScripturePassageDock = StandaloneScripturePassageDockPresentation(
            canonicalReference: canonicalReference,
            translationCode: translationCode,
            focusedHighlightThreadId: focusedHighlightThreadId
        )
        standaloneScriptureFocusedPassageHighlightId = focusedHighlightThreadId
    }

    func dismissStandaloneScripturePassageDock() {
        standaloneScripturePassageDock = nil
        standaloneScriptureFocusedPassageHighlightId = nil
    }

    /// Called when user taps another passage underline inside the standalone dock so the Highlights list mirrors it.
    func setStandaloneScriptureFocusedPassageHighlight(threadId: UUID?) {
        guard standaloneScripturePassageDock != nil else { return }
        standaloneScriptureFocusedPassageHighlightId = threadId
    }

    init() {
        #if os(iOS)
        let v3 = HarvousIOSListSurface.persistenceKey
        let v2 = HarvousIOSListSurface.legacyPersistenceKeyV2
        let v1 = HarvousIOSListSurface.legacyPersistenceKeyV1
        let rawV3 = UserDefaults.standard.string(forKey: v3)
        let rawLegacy = UserDefaults.standard.string(forKey: v2) ?? UserDefaults.standard.string(forKey: v1)
        let rawStored = rawV3 ?? rawLegacy
        let normalizedRaw = Self.normalizeIOSListSurfaceRaw(rawStored)
        let surface = HarvousIOSListSurface(rawValue: normalizedRaw ?? "") ?? .notes
        // `.more` is a sheet — never restore it as the inline shell surface.
        if surface == .more {
            iosListSurface = .notes
            iosShowMore = true
        } else {
            iosListSurface = surface
            iosShowMore = false
        }
        // Migrate legacy v1/v2 into v3 once so new enum cases deserialize reliably.
        if rawV3 == nil, rawStored != nil {
            UserDefaults.standard.set(iosListSurface.rawValue, forKey: v3)
        }
        // Migrate stored "collections" tab id → "folders" raw value.
        if rawStored == "collections" {
            UserDefaults.standard.set(HarvousIOSListSurface.folders.rawValue, forKey: v3)
        }
        #endif
    }

    #if os(iOS)
    /// Maps persisted raw strings from older builds (`collections` → `folders`).
    private static func normalizeIOSListSurfaceRaw(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        if raw == "collections" { return HarvousIOSListSurface.folders.rawValue }
        return raw
    }
    #endif

    #if os(iOS)
    /// Changes list surface and persists selection for next launch.
    /// Passing `.more` opens the You sheet without changing the underlying surface.
    func selectIOSListSurface(_ surface: HarvousIOSListSurface) {
        if surface == .more {
            iosShowMore = true
            iosInlineSearchText = ""
            iosNotesFilterSearchPresented = false
            return
        }
        iosShowMore = false
        let prev = iosListSurface
        guard prev != surface else { return }
        iosListSurface = surface
        UserDefaults.standard.set(surface.rawValue, forKey: HarvousIOSListSurface.persistenceKey)
        iosInlineSearchText = ""
        iosNotesFilterSearchPresented = false
    }

    /// FAB / deep-link `harvous://compose` — Notes hub creates an empty note and pushes it onto its stack.
    static let requestComposeNewNotification = Notification.Name("Harvous.requestComposeNewNote")

    func requestComposeNewNote() {
        selectIOSListSurface(.notes)
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: Self.requestComposeNewNotification, object: nil)
        }
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
            requestComposeNewNote()
        case "search":
            iosShowMore = false
            switch iosListSurface {
            case .notes:
                iosNotesFilterSearchPresented = true
            case .folders, .highlights, .scripture:
                NotificationCenter.default.post(name: .harvousFocusIOSInlineSearch, object: nil)
            case .more:
                break
            }
        default:
            if p.hasPrefix("note/"),
               let uuidStr = p.split(separator: "/").dropFirst().first,
               let id = UUID(uuidString: String(uuidStr)) {
                selectIOSListSurface(.notes)
                NotificationCenter.default.post(
                    name: .harvousRequestOpenNoteId,
                    object: nil,
                    userInfo: [HarvousOpenNoteIdPayload.idKey: id.uuidString]
                )
            }
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
    /// iOS: focus the bottom inline search field (Notes + Folders).
    static let harvousFocusIOSInlineSearch = Notification.Name("Harvous.focusIOSInlineSearch")
    /// macOS: posted from `HarvousCommands` so `ContentView` can `openWindow(id:)`.
    static let harvousOpenMacPreferences = Notification.Name("HarvousOpenMacPreferences")
    /// Insert `[[wikilink]]` at caret in the active note editor (see `NoteEditorView`).
    static let harvousRequestInsertWikiLink = Notification.Name("Harvous.requestInsertWikiLink")
    /// Open a note by id (macOS: detail column; iOS: push onto notes stack).
    static let harvousRequestOpenNoteId = Notification.Name("Harvous.requestOpenNoteId")
    static let requestDailyNote = Notification.Name("Harvous.requestDailyNote")
    static let requestRandomRevisit = Notification.Name("Harvous.requestRandomRevisit")
    /// macOS: toggle expand/collapse on `ActiveScripturePillDock` when a pill dock is visible.
    static let harvousToggleActivePillDockExpanded = Notification.Name("Harvous.toggleActivePillDockExpanded")
}

enum HarvousOpenNoteIdPayload {
    static let idKey = "id"
}
