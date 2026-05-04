import Foundation

/// Canonical English book titles in biblical order (matches `ScriptureDetector` coverage).
enum ScriptureCanonicalBooks {
    static let titles: [String] = [
        "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
        "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
        "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah",
        "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
        "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
        "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
        "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
        "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
        "1 John", "2 John", "3 John", "Jude", "Revelation"
    ]

    /// Lowercased abbreviations and short forms → canonical title (subset covering detector regex aliases).
    private static let aliasToCanonical: [String: String] = {
        var m: [String: String] = [:]
        func add(_ keys: [String], _ canon: String) {
            for k in keys { m[k.lowercased()] = canon }
        }
        add(["gen", "gn"], "Genesis")
        add(["exod", "ex"], "Exodus")
        add(["lev"], "Leviticus")
        add(["num"], "Numbers")
        add(["deut"], "Deuteronomy")
        add(["josh"], "Joshua")
        add(["judg"], "Judges")
        add(["1 sam", "1sam"], "1 Samuel")
        add(["2 sam", "2sam"], "2 Samuel")
        add(["1 kgs", "1kgs"], "1 Kings")
        add(["2 kgs", "2kgs"], "2 Kings")
        add(["1 chron", "1chron"], "1 Chronicles")
        add(["2 chron", "2chron"], "2 Chronicles")
        add(["neh"], "Nehemiah")
        add(["esth", "est"], "Esther")
        add(["ps", "psalm", "pss"], "Psalms")
        add(["prov"], "Proverbs")
        add(["eccl"], "Ecclesiastes")
        add(["sos", "ss", "song of songs"], "Song of Solomon")
        add(["isa"], "Isaiah")
        add(["jer"], "Jeremiah")
        add(["lam"], "Lamentations")
        add(["ezek"], "Ezekiel")
        add(["dan"], "Daniel")
        add(["hos"], "Hosea")
        add(["obad"], "Obadiah")
        add(["jon"], "Jonah")
        add(["mic"], "Micah")
        add(["nah"], "Nahum")
        add(["hab"], "Habakkuk")
        add(["zeph"], "Zephaniah")
        add(["hag"], "Haggai")
        add(["zech"], "Zechariah")
        add(["mal"], "Malachi")
        add(["matt", "mt"], "Matthew")
        add(["mk"], "Mark")
        add(["lk"], "Luke")
        add(["jn", "jhn"], "John")
        add(["rom", "ro"], "Romans")
        add(["1 cor", "1cor"], "1 Corinthians")
        add(["2 cor", "2cor"], "2 Corinthians")
        add(["gal"], "Galatians")
        add(["eph"], "Ephesians")
        add(["phil", "php", "philip"], "Philippians")
        add(["col"], "Colossians")
        add(["1 thess", "1thess"], "1 Thessalonians")
        add(["2 thess", "2thess"], "2 Thessalonians")
        add(["1 tim", "1tim"], "1 Timothy")
        add(["2 tim", "2tim"], "2 Timothy")
        add(["phlm"], "Philemon")
        add(["heb"], "Hebrews")
        add(["jas"], "James")
        add(["1 pet", "1pet", "1 pt"], "1 Peter")
        add(["2 pet", "2pet", "2 pt"], "2 Peter")
        add(["1 jn", "1jn"], "1 John")
        add(["2 jn", "2jn"], "2 John")
        add(["3 jn", "3jn"], "3 John")
        add(["rev", "rv"], "Revelation")
        return m
    }()

    static func bookIndex(matchingRaw raw: String) -> Int? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let lower = trimmed.lowercased()
        if let canon = aliasToCanonical[lower], let i = titles.firstIndex(of: canon) { return i }
        if let i = titles.firstIndex(where: { $0.compare(trimmed, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame }) {
            return i
        }
        let collapsed = lower.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        if let canon = aliasToCanonical[collapsed], let i = titles.firstIndex(of: canon) { return i }
        return titles.firstIndex { canon in
            let c = canon.lowercased()
            return c.hasPrefix(lower) || lower.hasPrefix(String(c.prefix(min(4, c.count))))
        }
    }

    static func displayString(bookIndex: Int, chapter: Int, verseStart: Int, verseEnd: Int?) -> String {
        guard bookIndex >= 0, bookIndex < titles.count else { return "" }
        let name = titles[bookIndex]
        if let end = verseEnd, end != verseStart {
            return "\(name) \(chapter):\(verseStart)-\(end)"
        }
        return "\(name) \(chapter):\(verseStart)"
    }
}

/// Fields parsed from a reference string such as `John 3:16` or `1 Cor 4:2-5`.
struct ParsedScriptureFields: Equatable {
    var bookIndex: Int
    var chapter: Int
    var verseStart: Int
    var verseEnd: Int?
}

enum ScriptureReferenceParser {
    /// Parses the first detector-shaped reference in `text` (usually a single pill’s `reference` string).
    static func parse(_ text: String) -> ParsedScriptureFields? {
        guard let raw = ScriptureDetector.parseReferenceFields(in: text) else { return nil }
        guard let bookIndex = ScriptureCanonicalBooks.bookIndex(matchingRaw: raw.bookRaw) else { return nil }
        return ParsedScriptureFields(bookIndex: bookIndex, chapter: raw.chapter, verseStart: raw.verseStart, verseEnd: raw.verseEnd)
    }

    /// True when any persisted reference string overlaps `query`'s passage (same book/chapter + verse range intersection).
    static func anyDetectedReference(_ refs: [String], overlapsStructured query: ParsedScriptureFields) -> Bool {
        for r in refs {
            guard let p = parse(r) else { continue }
            guard p.bookIndex == query.bookIndex, p.chapter == query.chapter else { continue }
            let nLo = p.verseStart
            let nHi = p.verseEnd ?? p.verseStart
            let qLo = query.verseStart
            let qHi = query.verseEnd ?? query.verseStart
            if nLo <= qHi && qLo <= nHi {
                return true
            }
        }
        return false
    }

    static func format(bookIndex: Int, chapter: Int, verseStart: Int, verseEnd: Int?) -> String {
        ScriptureCanonicalBooks.displayString(bookIndex: bookIndex, chapter: chapter, verseStart: verseStart, verseEnd: verseEnd)
    }
}
