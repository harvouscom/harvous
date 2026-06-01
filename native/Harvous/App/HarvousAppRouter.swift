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
    case dictionary
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
        case .dictionary: "Harvous.LinesLeaning"
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
        case .dictionary: "Dictionary"
        case .more: "Account"
        }
    }
}

/// iOS folders surface drill state. `nil` bucket key = ungrouped (matches `HarvousFolderRow.folderLabel` / `NoteFilter.folder`).
enum HarvousIOSFoldersDrill: Equatable {
    case root
    case bucket(String?)
}

/// iOS scripture surface drill state. Lifted from `ScriptureHubView` so `IOSListSurfaceChip` can morph into a back affordance.
enum HarvousIOSScriptureDrill: Equatable {
    case root
    case book(Int)
    case passage(ParsedScriptureFields)
}

/// Gating for the note editor bottom safe-area chrome while the note editor owns the morphing footer row.
struct HarvousIOSNoteFooterSupplement {
    /// When a **pinned** highlight or scripture **overlay** dock is visible (`activePillDock` / pinned highlight),
    /// or the inline highlight-annotation panel is open (selection → Highlight), hide the bottom morphing row so
    /// that UI is not stacked above the footer capsule / compose row.
    var suppressesBottomMorphingChromeContent: Bool
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
    /// Drill state for the iOS Folders surface. Lifted from `LibraryView` so the bottom-chrome
    /// `IOSListSurfaceChip` can read the active folder name and pop the drill on tap.
    @Published var iosFoldersDrill: HarvousIOSFoldersDrill = .root
    /// Drill state for the iOS Scripture surface. Lifted from `ScriptureHubView` for the same chip morph pattern.
    @Published var iosScriptureDrill: HarvousIOSScriptureDrill = .root
    /// Drives the Account sheet (You root + settings; not an inline surface — always a modal).
    @Published var iosShowMore = false
    @Published var iosInlineSearchText = ""
    /// Notes tab: filter sheet (list has no `.searchable` chrome).
    @Published var iosNotesFilterSearchPresented = false
    /// Camera / photo OCR flow started from the compose orb (vision text → new note).
    @Published var iosTextCaptureFlowPresented = false
    /// Second compose orb (camera) visible above the pencil — tap outside dismisses via `dismissIOSComposeCameraOrbIfPresented()`.
    @Published var iosComposeCameraOrbPresented = false
    /// When set, the root bottom inset shows the note editor formatting chrome instead of list + search.
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
        noteEditorChromeGeneration += 1
    }

    func iosUnregisterNoteEditorChrome(proxy: EditorProxy) {
        guard iosActiveNoteEditorChromeProxy === proxy else { return }
        iosNoteChromeCancellable?.cancel()
        iosNoteChromeCancellable = nil
        iosActiveNoteEditorChromeProxy = nil
        iosNoteFooterSupplement = nil
        noteEditorChromeGeneration += 1
    }

    #endif
    @Published var youNavigationStack: [HarvousYouNavigation] = []

    /// Set by ⇧F before the note editor proxy may be registered; `NoteFindToolbarButton` opens when ready.
    @Published var findInNoteRequestToken: UUID?
    /// Bumps when the active note editor proxy registers or unregisters (`EditorProxy` is not `Equatable`).
    @Published private(set) var noteEditorChromeGeneration = 0

    func requestFindInNote() {
        findInNoteRequestToken = UUID()
    }

    func consumeFindInNoteRequest() {
        findInNoteRequestToken = nil
    }

    #if os(macOS)
    @Published var macSettingsDeepLink: HarvousSettingsSidebarItem?
    @Published private(set) var macActiveNoteEditorChromeProxy: EditorProxy?
    private var macNoteChromeCancellable: AnyCancellable?

    func macRegisterNoteEditorChrome(proxy: EditorProxy) {
        macNoteChromeCancellable?.cancel()
        macNoteChromeCancellable = proxy.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
        macActiveNoteEditorChromeProxy = proxy
        noteEditorChromeGeneration += 1
    }

    func macUnregisterNoteEditorChrome(proxy: EditorProxy) {
        guard macActiveNoteEditorChromeProxy === proxy else { return }
        macNoteChromeCancellable?.cancel()
        macNoteChromeCancellable = nil
        macActiveNoteEditorChromeProxy = nil
        noteEditorChromeGeneration += 1
    }
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
        dismissIOSComposeCameraOrbIfPresented()
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
        // Reset folders drill whenever leaving the folders surface so the chip / nav title don't stick.
        if surface != .folders {
            iosFoldersDrill = .root
        }
        if surface != .scripture {
            iosScriptureDrill = .root
        }
    }

    /// FAB / deep-link `harvous://compose` — Notes hub creates an empty note and pushes it onto its stack.
    static let requestComposeNewNotification = Notification.Name("Harvous.requestComposeNewNote")
    /// Optional `userInfo` key for `requestComposeNewNotification` — plain text initial note body.
    static let composeInitialBodyUserInfoKey = "Harvous.composeInitialBody"

    /// Dismiss the camera compose orb (e.g. tap outside, or open scan flow).
    func dismissIOSComposeCameraOrbIfPresented() {
        guard iosComposeCameraOrbPresented else { return }
        withAnimation(.spring(response: 0.34, dampingFraction: 0.82)) {
            iosComposeCameraOrbPresented = false
        }
    }

    func requestPresentTextCaptureForCompose() {
        iosComposeCameraOrbPresented = false
        selectIOSListSurface(.notes)
        iosTextCaptureFlowPresented = true
    }

    func requestComposeNewNote(initialBody: String? = nil) {
        selectIOSListSurface(.notes)
        DispatchQueue.main.async {
            var userInfo: [AnyHashable: Any]?
            if let initialBody {
                let trimmed = initialBody.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    userInfo = [Self.composeInitialBodyUserInfoKey: trimmed]
                }
            }
            NotificationCenter.default.post(
                name: Self.requestComposeNewNotification,
                object: nil,
                userInfo: userInfo
            )
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
            case .folders, .highlights, .scripture, .dictionary:
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
    /// Open in-note find bar (⇧F).
    static let harvousOpenFindInNote = Notification.Name("Harvous.openFindInNote")
    /// Open note lock / unlock PIN flow for the note id in `object` (⇧L).
    static let harvousFocusLockNote = Notification.Name("Harvous.focusLockNote")
    /// Open folder chip popover.
    static let harvousOpenFolderChipPopover = Notification.Name("Harvous.openFolderChipPopover")
    /// Cycle sidebar list mode (⇧← / ⇧→). userInfo `step`: Int (-1 or 1).
    static let harvousCycleSidebarMode = Notification.Name("Harvous.cycleSidebarMode")
    /// Sync pruned local notes (remote tombstones). userInfo: `HarvousNotesPrunedPayload.noteIdsKey` → `[String]`.
    static let harvousNotesPruned = Notification.Name("Harvous.notesPruned")
}

enum HarvousOpenNoteIdPayload {
    static let idKey = "id"
}

enum HarvousNotesPrunedPayload {
    static let noteIdsKey = "noteIds"

    static func prunedIds(from notification: Notification) -> Set<UUID> {
        guard let raw = notification.userInfo?[noteIdsKey] as? [String] else { return [] }
        return Set(raw.compactMap { UUID(uuidString: $0) })
    }
}
