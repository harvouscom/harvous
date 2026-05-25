import Foundation

// MARK: - Bible translations (order matches `src/data/translations.ts` TRANSLATION_ORDER)

struct HarvousTranslationChoice: Identifiable, Hashable {
    let id: String
    let name: String

    /// Same sort order as the web `TRANSLATION_ORDER`.
    static let ordered: [HarvousTranslationChoice] = [
        HarvousTranslationChoice(id: "BSB", name: "Berean Standard Bible"),
        HarvousTranslationChoice(id: "ESV", name: "English Standard Version"),
        HarvousTranslationChoice(id: "KJV", name: "King James Version"),
        HarvousTranslationChoice(id: "NKJV", name: "New King James Version"),
        HarvousTranslationChoice(id: "NET", name: "NET Bible"),
        HarvousTranslationChoice(id: "NIV", name: "New International Version"),
        HarvousTranslationChoice(id: "NLT", name: "New Living Translation"),
        HarvousTranslationChoice(id: "NASB", name: "New American Standard Bible (1995)"),
        HarvousTranslationChoice(id: "CSB", name: "Christian Standard Bible"),
        HarvousTranslationChoice(id: "AMP", name: "Amplified Bible"),
        HarvousTranslationChoice(id: "MSG", name: "The Message"),
    ]
}

// MARK: - Profile avatar colors (matches `THREAD_COLORS` / web Edit Name & Color)

enum HarvousAvatarColorToken: String, CaseIterable, Identifiable {
    case paper
    case blue
    case yellow
    case orange
    case pink
    case purple
    case green

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .paper: return "Paper"
        case .blue: return "Blessed Blue"
        case .yellow: return "Graceful Gold"
        case .orange: return "Pleasant Peach"
        case .pink: return "Peaceful Pink"
        case .purple: return "Lovely Lavender"
        case .green: return "Mindful Mint"
        }
    }
}

// MARK: - Settings items (aligned with docs/native/PROFILE_PREFERENCES_IA.md)

enum HarvousSettingsSidebarItem: String, CaseIterable, Hashable, Identifiable {
    case account
    case subscription
    case defaultBible
    case myChurch
    case lockPin
    case referral
    case myData
    case support
    case aboutFounder
    case keyboardShortcuts

    var id: String { rawValue }

    var title: String {
        switch self {
        case .account: return "Account"
        case .subscription: return "Subscription"
        case .defaultBible: return "Default Bible translation"
        case .myChurch: return "My church"
        case .lockPin: return "Lock PIN"
        case .referral: return "Refer friends"
        case .myData: return "My data"
        case .support: return "Get support"
        case .aboutFounder: return "Letter from the founder"
        case .keyboardShortcuts: return "Keyboard shortcuts"
        }
    }

    var systemImage: String {
        switch self {
        case .account: return "person.crop.circle"
        case .subscription: return "creditcard"
        case .defaultBible: return "book.closed"
        case .myChurch: return "building.columns"
        case .lockPin: return "lock"
        case .referral: return "person.2.badge.gearshape"
        case .myData: return "externaldrive"
        case .support: return "questionmark.circle"
        case .aboutFounder: return "heart.text.square"
        case .keyboardShortcuts: return "keyboard"
        }
    }

    /// `Assets.xcassets` `Harvous.*` name for iOS settings lists (You → Settings). macOS preferences still use `systemImage`.
    var settingsListFAAssetName: String {
        switch self {
        case .account: return "Harvous.UserFilled"
        case .subscription: return "Harvous.CreditCard"
        case .defaultBible: return "Harvous.BookFilled"
        case .myChurch: return "Harvous.Church"
        case .lockPin: return "Harvous.Lock"
        case .referral: return "Harvous.Users"
        case .myData: return "Harvous.HardDrive"
        case .support: return "Harvous.CircleQuestion"
        case .aboutFounder: return "Harvous.Heart"
        case .keyboardShortcuts: return "Harvous.Keyboard"
        }
    }

    var footnote: String {
        switch self {
        case .account:
            return "Your name syncs with your Harvous account. Email and password are managed by Clerk."
        case .subscription:
            return "Billing is handled on the web for now."
        case .defaultBible:
            return "Stored in your Harvous profile (UserMetadata.defaultTranslation)."
        case .myChurch:
            return "Church details sync with your Harvous profile."
        case .lockPin:
            return "PIN protects locked notes. Matches server hashing when online."
        case .referral:
            return "Share Harvous and earn bonus notes."
        case .myData:
            return "Export, import, or delete your account data."
        case .support:
            return "Help and contact options."
        case .aboutFounder:
            return "About Harvous."
        case .keyboardShortcuts:
            return "Reference for Mac and iPad with an external keyboard."
        }
    }

    /// Account row(s). Subscription is temporarily hidden from the sidebar.
    static var accountItems: [HarvousSettingsSidebarItem] {
        [.account]
    }

    /// My church and lock PIN are temporarily hidden from the sidebar.
    static var studyItems: [HarvousSettingsSidebarItem] {
        [.defaultBible]
    }

    /// Support row(s). “Letter from the founder” is temporarily hidden from the sidebar.
    static var supportItems: [HarvousSettingsSidebarItem] {
        [.support]
    }

    /// Single flat ordering for settings sidebars (no section headers). Omits temporarily hidden items.
    static func allSettingsRows(includeKeyboardShortcuts: Bool) -> [HarvousSettingsSidebarItem] {
        var rows: [HarvousSettingsSidebarItem] = []
        rows.append(contentsOf: accountItems)
        rows.append(contentsOf: studyItems)
        rows.append(.myData)
        rows.append(contentsOf: supportItems)
        if includeKeyboardShortcuts {
            rows.append(.keyboardShortcuts)
        }
        return rows
    }

    #if os(iOS)
    /// Omit full shortcuts list on iPhone; show on iPad (any) — caller can refine with keyboard detection later.
    static func keyboardShortcutsVisible(isPhone: Bool) -> Bool {
        !isPhone
    }
    #endif
}

// MARK: - iOS NavigationStack

enum HarvousYouNavigation: Hashable {
    case settingsList
    case settingsDetail(HarvousSettingsSidebarItem)
}

// MARK: - Deep link path → detail

enum HarvousSettingsPathParser {
    /// Parses routes like `settings/study/translation` after `HarvousPendingRoute` normalization.
    static func detail(fromFullPath path: String) -> HarvousSettingsSidebarItem? {
        let parts = path.split(separator: "/").map(String.init)
        guard !parts.isEmpty else { return nil }
        if parts[0] == "you" { return nil }
        guard parts[0] == "settings" else { return nil }

        if parts.count == 1 { return nil }

        switch parts[1] {
        case "account":
            if parts.count < 3 { return .account }
            switch parts[2] {
            case "profile", "email": return .account
            case "subscription": return .subscription
            default: return nil
            }
        case "study":
            guard parts.count >= 3 else { return .defaultBible }
            switch parts[2] {
            case "translation": return .defaultBible
            case "church": return .myChurch
            case "lock-pin", "lockpin": return .lockPin
            default: return nil
            }
        case "referral": return .referral
        case "data": return .myData
        case "support": return .support
        case "about": return .aboutFounder
        case "keyboard-shortcuts", "keyboardshortcuts": return .keyboardShortcuts
        default:
            return nil
        }
    }

    /// When true, route should open the settings / preferences UI (macOS Settings window or iOS You → settings).
    static func opensSettingsUI(_ path: String) -> Bool {
        path == "you" || path.hasPrefix("settings")
    }
}

// MARK: - UserDefaults keys (native profile + settings forms)

enum HarvousSettingsStorageKeys {
    static let firstName = "harvous.settings.profile.firstName"
    static let lastName = "harvous.settings.profile.lastName"
    static let avatarColor = "harvous.settings.profile.avatarColor"
    static let churchName = "harvous.settings.church.name"
    static let churchCity = "harvous.settings.church.city"
    static let churchState = "harvous.settings.church.state"
    static let churchCountry = "harvous.settings.church.country"
}
