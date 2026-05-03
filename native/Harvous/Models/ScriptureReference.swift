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
    struct TranslationAttribution: Equatable, Sendable {
        let copyright: String
        let website: String
    }
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
    private static let translationAttributions: [String: TranslationAttribution] = [
        "KJV": TranslationAttribution(
            copyright: "The King James Version is in the public domain.",
            website: "https://www.kingjamesbibleonline.org"
        ),
        "NKJV": TranslationAttribution(
            copyright: "Scripture quotations are from the New King James Version®. Copyright © 1982 by Thomas Nelson. All rights reserved.",
            website: "https://www.thomasnelson.com/nkjv"
        ),
        "ESV": TranslationAttribution(
            copyright: "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. All rights reserved.",
            website: "https://www.esv.org"
        ),
        "NIV": TranslationAttribution(
            copyright: "Scripture quotations are from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ All rights reserved worldwide.",
            website: "https://www.thenivbible.com"
        ),
        "NLT": TranslationAttribution(
            copyright: "Scripture quotations are from the Holy Bible, New Living Translation. Copyright © 1996, 2004, 2015 by Tyndale House Foundation and Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved.",
            website: "https://www.tyndale.com/nlt"
        ),
        "NET": TranslationAttribution(
            copyright: "Scripture quotations are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com All rights reserved.",
            website: "https://netbible.org"
        ),
        "BSB": TranslationAttribution(
            copyright: "The Berean Bible (Berean Standard Bible BSB) © 2016, 2020 by Bible Hub and Berean.Bible. Free to use and share. All rights reserved.",
            website: "https://berean.bible"
        ),
        "NASB": TranslationAttribution(
            copyright: "Scripture quotations taken from the New American Standard Bible® (NASB 1995), Copyright © 1960, 1971, 1977, 1995 by The Lockman Foundation. All rights reserved.",
            website: "https://www.lockman.org"
        ),
        "CSB": TranslationAttribution(
            copyright: "Christian Standard Bible®, CSB® Copyright © 2017 by Holman Bible Publishers. All rights reserved.",
            website: "https://csbible.com"
        ),
        "AMP": TranslationAttribution(
            copyright: "Scripture quotations marked AMP are taken from the Amplified® Bible, Copyright © 2015 by The Lockman Foundation. All rights reserved.",
            website: "https://www.lockman.org"
        ),
        "MSG": TranslationAttribution(
            copyright: "Scripture quotations marked MSG are taken from THE MESSAGE, copyright © 1993, 2002, 2018 by Eugene H. Peterson.",
            website: "https://www.navpress.com"
        ),
    ]
    static func displayTranslationLabel(_ id: String) -> String { translationLabels[id] ?? id }
    static func attribution(for id: String) -> TranslationAttribution? { translationAttributions[id] }
    /// Preferred translation for new pills when plain text has no trailing code (see `HarvousStudyDefaults`).
    static var defaultTranslation: String { HarvousStudyDefaults.resolvedPreferredTranslation() }
}
