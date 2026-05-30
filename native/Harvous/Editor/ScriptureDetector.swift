import Foundation

/// Swift port of src/utils/scripture-detector.ts
/// Detects scripture references in plain text and returns their ranges.
struct ScriptureDetector {

    /// Matches the server-side guard in `process-scripture-references.ts` — skip regex on pathological bodies.
    static let maximumDetectLength = 500_000

    private static let dashPattern = "[-–—]"

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
        let pattern = "\\b(\(bookPattern))\\.?\\s+(\\d{1,3}):(\\d{1,3})(?:\\s*\(dashPattern)\\s*(\\d{1,3}))?\\b"
        return try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }()

    /// Chapter range without colon: "Matthew 5-7"
    private static let chapterRangeRegex: NSRegularExpression? = {
        let pattern = "\\b(\(bookPattern))\\.?\\s+(\\d{1,3})\\s*\(dashPattern)\\s*(\\d{1,3})(?!\\s*:)(?=\\s|$|[^\\d\\w-])"
        return try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }()

    /// Chapter-only: "John 3", "Psalm 23"
    private static let chapterOnlyRegex: NSRegularExpression? = {
        let pattern = "\\b(\(bookPattern))\\.?\\s+(\\d{1,3})(?!\\s*:)(?!\\s*\(dashPattern)\\s*\\d)(?=\\s|$|[^\\d\\w])"
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

    /// Expanded canonical reference for API/sync (e.g. "Exodus 3" → "Exodus 3:1-22").
    static func normalizeChapterReference(bookIndex: Int, chapter: Int) -> String? {
        guard bookIndex >= 0, bookIndex < ScriptureCanonicalBooks.titles.count else { return nil }
        let ch = ScriptureCanon.clampChapter(chapter, bookIndex: bookIndex)
        let endVerse = ScriptureCanon.verseCount(bookIndex: bookIndex, chapter: ch)
        let book = ScriptureCanonicalBooks.titles[bookIndex]
        return "\(book) \(ch):1-\(endVerse)"
    }

    /// First reference match in `text`; `text` is usually one pill's reference line.
    static func parseReferenceFields(in text: String) -> ParsedReferenceFields? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let verse = parseVerseReferenceFields(in: trimmed) { return verse }
        if let range = parseChapterRangeFields(in: trimmed) { return range }
        return parseChapterOnlyFields(in: trimmed)
    }

    private static func parseVerseReferenceFields(in text: String) -> ParsedReferenceFields? {
        guard let regex = referenceRegex else { return nil }
        let nsText = text as NSString
        guard nsText.length > 0, nsText.length <= maximumDetectLength else { return nil }
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

    private static func parseChapterRangeFields(in text: String) -> ParsedReferenceFields? {
        guard let regex = chapterRangeRegex else { return nil }
        let nsText = text as NSString
        guard nsText.length > 0, nsText.length <= maximumDetectLength else { return nil }
        let full = NSRange(location: 0, length: nsText.length)
        guard let result = regex.firstMatch(in: text, options: [], range: full), result.numberOfRanges >= 4 else { return nil }
        let bookRaw = nsText.substring(with: result.range(at: 1))
        guard let startCh = Int(nsText.substring(with: result.range(at: 2))),
              let endCh = Int(nsText.substring(with: result.range(at: 3))),
              endCh > startCh,
              let bookIndex = ScriptureCanonicalBooks.bookIndex(matchingRaw: bookRaw) else { return nil }
        let clampedStart = ScriptureCanon.clampChapter(startCh, bookIndex: bookIndex)
        let clampedEnd = ScriptureCanon.clampChapter(endCh, bookIndex: bookIndex)
        return ParsedReferenceFields(
            bookRaw: bookRaw,
            chapter: clampedStart,
            verseStart: 1,
            verseEnd: ScriptureCanon.verseCount(bookIndex: bookIndex, chapter: clampedEnd)
        )
    }

    private static func parseChapterOnlyFields(in text: String) -> ParsedReferenceFields? {
        guard let regex = chapterOnlyRegex else { return nil }
        let nsText = text as NSString
        guard nsText.length > 0, nsText.length <= maximumDetectLength else { return nil }
        let full = NSRange(location: 0, length: nsText.length)
        guard let result = regex.firstMatch(in: text, options: [], range: full), result.numberOfRanges >= 3 else { return nil }
        let bookRaw = nsText.substring(with: result.range(at: 1))
        guard let chapter = Int(nsText.substring(with: result.range(at: 2))),
              let bookIndex = ScriptureCanonicalBooks.bookIndex(matchingRaw: bookRaw) else { return nil }
        let ch = ScriptureCanon.clampChapter(chapter, bookIndex: bookIndex)
        let endVerse = ScriptureCanon.verseCount(bookIndex: bookIndex, chapter: ch)
        return ParsedReferenceFields(bookRaw: bookRaw, chapter: ch, verseStart: 1, verseEnd: endVerse)
    }

    static func detect(in text: String) -> [Match] {
        let nsText = text as NSString
        let length = nsText.length
        guard length > 0, length <= maximumDetectLength else { return [] }

        var collected: [(range: NSRange, displayText: String, hasColon: Bool)] = []

        func appendMatches(from regex: NSRegularExpression?, hasColon: Bool) {
            guard let regex else { return }
            for result in regex.matches(in: text, range: NSRange(location: 0, length: length)) {
                let matchText = nsText.substring(with: result.range)
                if !isValidScriptureContext(text: text, matchIndex: result.range.location, matchLength: result.range.length) {
                    continue
                }
                collected.append((result.range, matchText, hasColon))
            }
        }

        appendMatches(from: referenceRegex, hasColon: true)
        appendMatches(from: chapterRangeRegex, hasColon: false)
        appendMatches(from: chapterOnlyRegex, hasColon: false)

        collected.sort { $0.range.location < $1.range.location }

        var out: [Match] = []
        var seenDisplay = Set<String>()
        var verseLevelChapters = Set<String>()

        for item in collected {
            let key = item.displayText.lowercased()
            if seenDisplay.contains(key) { continue }

            if item.hasColon {
                if let fields = parseVerseReferenceFields(in: item.displayText.trimmingCharacters(in: .whitespacesAndNewlines)),
                   let bookIndex = ScriptureCanonicalBooks.bookIndex(matchingRaw: fields.bookRaw) {
                    let book = ScriptureCanonicalBooks.titles[bookIndex]
                    verseLevelChapters.insert("\(book.lowercased())|\(fields.chapter)")
                }
                seenDisplay.insert(key)
                out.append(Match(displayText: item.displayText, range: item.range))
                continue
            }

            if let fields = parseReferenceFields(in: item.displayText.trimmingCharacters(in: .whitespacesAndNewlines)),
               let bookIndex = ScriptureCanonicalBooks.bookIndex(matchingRaw: fields.bookRaw) {
                let book = ScriptureCanonicalBooks.titles[bookIndex]
                let chapterKey = "\(book.lowercased())|\(fields.chapter)"
                if verseLevelChapters.contains(chapterKey) { continue }
            }

            seenDisplay.insert(key)
            out.append(Match(displayText: item.displayText, range: item.range))
        }

        return out
    }

    /// Conservative false-positive guard (mirrors scripture-detector.ts).
    private static func isValidScriptureContext(text: String, matchIndex: Int, matchLength: Int) -> Bool {
        let nsText = text as NSString
        let beforeStart = max(0, matchIndex - 30)
        let before = nsText.substring(with: NSRange(location: beforeStart, length: matchIndex - beforeStart)).trimmingCharacters(in: .whitespacesAndNewlines)
        let afterStart = matchIndex + matchLength
        let afterEnd = min(nsText.length, afterStart + 30)
        let after = nsText.substring(with: NSRange(location: afterStart, length: afterEnd - afterStart)).trimmingCharacters(in: .whitespacesAndNewlines)

        let invalidAfterPattern = try? NSRegularExpression(
            pattern: "\\b(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\\s+(ago|later|before|after)\\b",
            options: [.caseInsensitive]
        )
        if let invalidAfterPattern, invalidAfterPattern.firstMatch(in: after, range: NSRange(location: 0, length: (after as NSString).length)) != nil {
            return false
        }

        let falsePositiveAfter = try? NSRegularExpression(
            pattern: "^\\s*(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\\b",
            options: [.caseInsensitive]
        )
        if let falsePositiveAfter, falsePositiveAfter.firstMatch(in: after, range: NSRange(location: 0, length: (after as NSString).length)) != nil {
            let refText = nsText.substring(with: NSRange(location: matchIndex, length: matchLength))
            if !refText.contains(":") {
                return false
            }
        }

        if after.isEmpty { return true }
        let first = after.first!
        if first.isWhitespace || ".,;:!?\n".contains(first) { return true }

        let invalidBefore = try? NSRegularExpression(pattern: "\\b(about|around|over|under|near|from|to|at|in|on|for|with|by)\\s+$", options: [.caseInsensitive])
        if let invalidBefore, invalidBefore.firstMatch(in: before, range: NSRange(location: 0, length: (before as NSString).length)) != nil {
            return false
        }

        return true
    }

    /// Display refs in order of first occurrence, with duplicates removed.
    static func uniqueDisplayRefs(in text: String) -> [String] {
        var seen = Set<String>()
        return detect(in: text).map(\.displayText).filter { seen.insert($0).inserted }
    }

    static func mergedDetectedRefs(title: String, bodyRefs: [String]) -> [String] {
        let titleRefs = uniqueDisplayRefs(in: title)
        var seenLC = Set(titleRefs.map { $0.lowercased() })
        var out = titleRefs
        for r in bodyRefs {
            if seenLC.insert(r.lowercased()).inserted {
                out.append(r)
            }
        }
        return out
    }
}
