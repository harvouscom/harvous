import Foundation

struct ScriptureReference: Equatable, Sendable {
    let displayText: String      // "John 3:16"
    let translation: String      // "ESV"
    let range: NSRange           // location in the text storage

    static let availableTranslations = ["ESV", "NIV", "KJV", "NKJV", "NLT"]
    static let defaultTranslation = "ESV"
}
