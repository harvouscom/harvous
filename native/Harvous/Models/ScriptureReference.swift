import Foundation

/// Backing store for the user’s preferred translation code. Matches SwiftUI `@AppStorage` in settings
/// (`SettingsDefaultBibleView`) and `UserMetadata.defaultTranslation` on the web.
enum HarvousStudyDefaults {
    static let defaultTranslationStorageKey = "harvous.settings.study.defaultTranslation"

    /// Reads `UserDefaults.standard` so native scripture pills and chips respect the same value as `@AppStorage`.
    static func resolvedPreferredTranslation() -> String {
        let raw = (UserDefaults.standard.string(forKey: defaultTranslationStorageKey) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return "NET" }
        return raw
    }
}

/// Inline scripture pill currently focused for editing (UTF-16 ranges in `NSTextStorage` / `UITextView`).
struct ActiveScripturePill: Equatable, Sendable {
    var attachmentRange: NSRange
    var reference: String
    var translation: String
}

struct ScriptureReference: Equatable, Sendable {
    let displayText: String      // "John 3:16"
    let translation: String      // "ESV"
    let range: NSRange           // location in the text storage

    /// Canonical order matches current web app `TRANSLATION_ORDER`.
    static let availableTranslations = ["BSB", "CSB", "ESV", "KJV", "NKJV", "NASB", "NET", "NIV", "NLT", "AMP", "MSG"]
    private static let translationLabels: [String: String] = [
        "BSB": "BSB",
        "ESV": "ESV",
        "KJV": "KJV",
        "NKJV": "NKJV",
        "NET": "NET",
        "NIV": "NIV",
        "NLT": "NLT",
        "NASB": "NASB 1995",
        "CSB": "CSB",
        "AMP": "AMP",
        "MSG": "MSG",
    ]
    static func displayTranslationLabel(_ id: String) -> String { translationLabels[id] ?? id }
    /// Preferred translation for new pills when plain text has no trailing code (see `HarvousStudyDefaults`).
    static var defaultTranslation: String { HarvousStudyDefaults.resolvedPreferredTranslation() }
}
