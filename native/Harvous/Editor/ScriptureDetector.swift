import Foundation

/// Swift port of src/utils/scripture-detector.ts
/// Detects scripture references in plain text and returns their ranges.
struct ScriptureDetector {

    // Books of the Bible with common abbreviations
    private static let bookPattern: String = {
        let books = [
            // Old Testament
            "Genesis|Gen", "Exodus|Exod?", "Leviticus|Lev", "Numbers|Num",
            "Deuteronomy|Deut?", "Joshua|Josh?", "Judges|Judg?", "Ruth",
            "1\\s*Samuel|1\\s*Sam", "2\\s*Samuel|2\\s*Sam",
            "1\\s*Kings", "2\\s*Kings",
            "1\\s*Chronicles|1\\s*Chron?", "2\\s*Chronicles|2\\s*Chron?",
            "Ezra", "Nehemiah|Neh", "Esther|Esth?",
            "Job", "Psalm[s]?|Ps[ms]?", "Proverbs|Prov?", "Ecclesiastes|Eccl?",
            "Song\\s*of\\s*Solomon|Song\\s*of\\s*Songs|SOS|SS",
            "Isaiah|Isa", "Jeremiah|Jer", "Lamentations|Lam",
            "Ezekiel|Ezek?", "Daniel|Dan",
            "Hosea|Hos", "Joel", "Amos", "Obadiah|Obad?", "Jonah|Jon",
            "Micah|Mic", "Nahum|Nah", "Habakkuk|Hab", "Zephaniah|Zeph?",
            "Haggai|Hag", "Zechariah|Zech?", "Malachi|Mal",
            // New Testament
            "Matthew|Matt?", "Mark", "Luke", "John",
            "Acts", "Romans|Rom",
            "1\\s*Corinthians|1\\s*Cor", "2\\s*Corinthians|2\\s*Cor",
            "Galatians|Gal", "Ephesians|Eph", "Philippians|Phil",
            "Colossians|Col",
            "1\\s*Thessalonians|1\\s*Thess?", "2\\s*Thessalonians|2\\s*Thess?",
            "1\\s*Timothy|1\\s*Tim", "2\\s*Timothy|2\\s*Tim",
            "Titus", "Philemon|Phlm?",
            "Hebrews|Heb", "James|Jas?",
            "1\\s*Peter|1\\s*Pet", "2\\s*Peter|2\\s*Pet",
            "1\\s*John", "2\\s*John", "3\\s*John",
            "Jude", "Revelation|Rev"
        ]
        return "(?:" + books.joined(separator: "|") + ")"
    }()

    private static let referenceRegex: NSRegularExpression? = {
        // Matches: "John 3:16", "John 3:16-17", "1 John 3:16", "Phil 4:13"
        let pattern = "\\b(\(bookPattern))\\.?\\s+(\\d{1,3}):(\\d{1,3})(?:[-–](\\d{1,3}))?\\b"
        return try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }()

    struct Match {
        let displayText: String
        let range: NSRange
    }

    /// Raw regex capture for structured editing (book substring as matched, e.g. `1 Cor` or `Philippians`).
    struct ParsedReferenceFields {
        let bookRaw: String
        let chapter: Int
        let verseStart: Int
        let verseEnd: Int?
    }

    /// First reference match in `text`; `text` is usually one pill’s reference line.
    static func parseReferenceFields(in text: String) -> ParsedReferenceFields? {
        guard let regex = referenceRegex else { return nil }
        let nsText = text as NSString
        let full = NSRange(location: 0, length: nsText.length)
        guard let result = regex.firstMatch(in: text, options: [], range: full), result.numberOfRanges >= 4 else { return nil }
        let bookRaw = nsText.substring(with: result.range(at: 1))
        let chapterStr = nsText.substring(with: result.range(at: 2))
        let v1Str = nsText.substring(with: result.range(at: 3))
        guard let chapter = Int(chapterStr), let verseStart = Int(v1Str) else { return nil }
        var verseEnd: Int?
        if result.numberOfRanges > 4, result.range(at: 4).location != NSNotFound {
            let v2Str = nsText.substring(with: result.range(at: 4))
            verseEnd = Int(v2Str)
        }
        return ParsedReferenceFields(bookRaw: bookRaw, chapter: chapter, verseStart: verseStart, verseEnd: verseEnd)
    }

    static func detect(in text: String) -> [Match] {
        guard let regex = referenceRegex else { return [] }
        let nsText = text as NSString
        let results = regex.matches(in: text, range: NSRange(location: 0, length: nsText.length))
        return results.map { result in
            let matchText = nsText.substring(with: result.range)
            return Match(displayText: matchText, range: result.range)
        }
    }

    /// Display refs in order of first occurrence, with duplicates removed.
    /// `Note.detectedRefs` is consumed by SwiftUI ForEach using `id: \.self` — duplicates would
    /// trigger SwiftUI's "the ID X occurs multiple times within the collection" failure mode.
    static func uniqueDisplayRefs(in text: String) -> [String] {
        var seen = Set<String>()
        return detect(in: text).map(\.displayText).filter { seen.insert($0).inserted }
    }
}
