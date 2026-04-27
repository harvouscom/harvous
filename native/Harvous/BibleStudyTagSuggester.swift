import Foundation

/// On-device auto-tags aligned with `server/utils/auto-tag-generator.ts` and `bible-study-keywords.ts`:
/// title/content keyword matching, category tie-breaks, and a single primary collection label.
enum BibleStudyTagSuggester {
    // MARK: - Public API

    static func result(title: String, body: String) -> (primaryCollection: String?, tags: [String]) {
        let fullText = "\(title) \(body)"
        let titleLower = title.lowercased()
        let contentLower = body.lowercased()
        let textLower = fullText.lowercased()

        var raw: [Scored] = []
        for row in Self.keywordRows {
            if let s = match(row, titleLower: titleLower, contentLower: contentLower, textLower: textLower) {
                if s.name.lowercased() == "god" { continue }
                raw.append(s)
            }
        }
        for book in Self.bookNames {
            if matchBookWord(book, in: textLower) {
                raw.append(Scored(name: book, category: .book, confidence: 0.9))
            }
        }

        raw.sort { $0.confidence > $1.confidence }

        var picked: [Scored] = []
        for s in raw {
            if picked.contains(where: { overlaps(s.name, $0.name) }) { continue }
            if picked.contains(where: { $0.name.lowercased() == s.name.lowercased() }) { continue }
            var adj = s
            if Self.bibleStudyBoostCategories.contains(adj.category) {
                adj.confidence = min(1.0, adj.confidence + 0.05)
            }
            picked.append(adj)
        }

        picked.sort { $0.confidence > $1.confidence }
        let top = Array(picked.prefix(12))
        let tags = top.map(\.name)

        // Best primary: max confidence, then best category (lower `collectionRank` wins on ties).
        let primary = top.max(by: { a, b in
            if abs(a.confidence - b.confidence) > 0.001 { return a.confidence < b.confidence }
            return collectionRank(a.category) > collectionRank(b.category)
        })?.name

        return (primary, tags)
    }

    /// Recomputes `primaryCollection` and `tags` from the note’s title and body.
    static func applyToNote(_ note: Note) {
        let r = result(title: note.title, body: note.body)
        note.primaryCollection = r.primaryCollection
        note.tags = r.tags
    }

    // MARK: - Scoring

    private struct Scored {
        var name: String
        var category: TagCategory
        var confidence: Double
    }

    private enum TagCategory: String, CaseIterable {
        case spiritual, biblical, book, life, place, character
    }

    /// Lower rank = better primary collection when confidence ties.
    private static func collectionRank(_ c: TagCategory) -> Int {
        switch c {
        case .spiritual: return 0
        case .biblical: return 1
        case .book: return 2
        case .life: return 3
        case .character: return 4
        case .place: return 5
        }
    }

    private static let bibleStudyBoostCategories: Set<TagCategory> = [.spiritual, .biblical, .character, .book]

    // MARK: - Match rows (trimmed; books handled separately)

    private struct Row {
        let name: String
        let category: TagCategory
        let base: Double
        let synonyms: [String]
    }

    private static let keywordRows: [Row] = {
        var r: [Row] = []
        func a(_ name: String, _ cat: TagCategory, _ conf: Double, _ syns: [String] = []) {
            r.append(Row(name: name, category: cat, base: conf, synonyms: syns))
        }
        // Spiritual
        a("Prayer", .spiritual, 0.8, ["praying", "intercession", "petition"])
        a("Faith", .spiritual, 0.8, ["belief", "trust"])
        a("Love", .spiritual, 0.8, ["agape", "compassion"])
        a("Hope", .spiritual, 0.8, ["anticipation"])
        a("Grace", .spiritual, 0.8, ["favor", "unmerited favor"])
        a("Mercy", .spiritual, 0.8, ["forgiveness", "pity"])
        a("Forgiveness", .spiritual, 0.8, ["pardon", "reconciliation"])
        a("Salvation", .spiritual, 0.8, ["redemption", "deliverance"])
        a("Repentance", .spiritual, 0.8, ["conversion", "turning"])
        a("Worship", .spiritual, 0.8, ["praise", "adoration"])
        a("Praise", .spiritual, 0.8, ["exalt", "glorify"])
        a("Thanksgiving", .spiritual, 0.8, ["gratitude", "thankfulness"])
        a("Peace", .spiritual, 0.8, ["shalom", "serenity"])
        a("Joy", .spiritual, 0.8, ["rejoicing", "gladness"])
        a("Patience", .spiritual, 0.8, ["endurance", "perseverance"])
        a("Kindness", .spiritual, 0.8, ["gentleness", "goodness"])
        a("Goodness", .spiritual, 0.8, ["moral excellence"])
        a("Faithfulness", .spiritual, 0.8, ["loyalty", "reliability"])
        a("Gentleness", .spiritual, 0.8, ["meekness", "mildness"])
        a("Self-control", .spiritual, 0.8, ["temperance", "discipline"])
        // Biblical
        a("Covenant", .biblical, 0.8, ["agreement", "pact", "promise"])
        a("Redemption", .biblical, 0.8, ["ransom"])
        a("Atonement", .biblical, 0.8, ["propitiation"])
        a("Resurrection", .biblical, 0.8, ["new life"])
        a("Gospel", .biblical, 0.8, ["good news", "evangel"])
        a("Discipleship", .biblical, 0.8, ["following christ"])
        a("Mission", .biblical, 0.8, ["evangelism", "witnessing"])
        a("Parables", .biblical, 0.8, ["stories of jesus"])
        a("Miracles", .biblical, 0.8, ["wonders", "signs"])
        a("Prophecy", .biblical, 0.8, ["foretelling"])
        a("Law", .biblical, 0.8, ["commandments", "statutes"])
        a("Sacrifice", .biblical, 0.8, ["offering"])
        a("Sabbath", .biblical, 0.8, ["day of rest"])
        a("Baptism", .biblical, 0.8, ["immersion", "baptized"])
        a("Communion", .biblical, 0.8, ["eucharist", "lord's supper"])
        a("Kingdom of God", .biblical, 0.8, ["god's kingdom", "kingdom of heaven"])
        a("Sin", .biblical, 0.8, ["transgression", "iniquity"])
        a("Judgment", .biblical, 0.8, ["judgement", "day of judgment"])
        a("Heaven", .biblical, 0.8, ["eternal life", "paradise"])
        a("Righteousness", .biblical, 0.8, ["righteous"])
        // Life
        a("Family", .life, 0.7, ["relatives", "household"])
        a("Marriage", .life, 0.7, ["wedding", "spouse"])
        a("Parenting", .life, 0.7, ["childrearing", "raising children"])
        a("Friendship", .life, 0.7, ["companionship", "fellowship"])
        a("Work", .life, 0.7, ["labor", "vocation", "employment"])
        a("Money", .life, 0.7, ["finances", "wealth"])
        a("Suffering", .life, 0.7, ["trial", "hardship", "pain"])
        a("Grief", .life, 0.7, ["mourning", "sorrow", "loss"])
        a("Fear", .life, 0.7, ["anxiety", "worry"])
        a("Wisdom", .life, 0.7, ["insight", "understanding"])
        a("Justice", .life, 0.7, ["fairness"])
        // Place (sample)
        a("Jerusalem", .place, 0.9, ["holy city", "zion"])
        a("Bethlehem", .place, 0.9, [])
        a("Nazareth", .place, 0.9, [])
        a("Galilee", .place, 0.9, [])
        // Character (sample — avoid short names that overlap books)
        a("Moses", .character, 0.9, [])
        a("Abraham", .character, 0.9, ["abram"])
        a("Paul", .character, 0.9, ["apostle paul"])
        a("Peter", .character, 0.9, ["simon peter"])
        return r
    }()

    private static let bookNames: [String] = [
        "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
        "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
        "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Songs", "Isaiah", "Jeremiah",
        "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
        "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts",
        "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
        "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
        "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
    ]

    private static func match(_ row: Row, titleLower: String, contentLower: String, textLower: String) -> Scored? {
        let nameLower = row.name.lowercased()
        var found = false
        let conf = row.base
        var inTitle = false
        var frequency = 0
        for piece in [nameLower] + row.synonyms.map({ $0.lowercased() }) {
            if titleLower.contains(piece) {
                inTitle = true
                found = true
                frequency += countOccurrences(of: piece, in: titleLower)
            }
            if contentLower.contains(piece) {
                found = true
                frequency += countOccurrences(of: piece, in: contentLower)
            }
        }
        if !found, row.name.split(separator: " ").count == 1, row.synonyms.isEmpty {
            if matchWholeWord(nameLower, in: textLower) {
                inTitle = titleLower.split(separator: " ").contains { $0.lowercased() == nameLower }
                found = true
            }
        }
        guard found else { return nil }
        let titleBoost: Double = inTitle ? 0.2 : 0
        let frequencyBoost: Double = frequency > 1 ? min(0.5, Double(frequency - 1) * 0.1) : 0
        return Scored(
            name: row.name,
            category: row.category,
            confidence: min(1.0, conf + titleBoost + frequencyBoost)
        )
    }

    private static func countOccurrences(of sub: String, in text: String) -> Int {
        guard !sub.isEmpty else { return 0 }
        return text.components(separatedBy: sub).count - 1
    }

    private static func matchBookWord(_ book: String, in textLower: String) -> Bool {
        let b = book.lowercased()
        if b.split(separator: " ").count > 1 {
            return textLower.contains(b)
        }
        return matchWholeWord(b, in: textLower)
    }

    private static func matchWholeWord(_ word: String, in textLower: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: word)
        guard let re = try? NSRegularExpression(pattern: "\\b\(escaped)\\b", options: .caseInsensitive) else {
            return false
        }
        let n = (textLower as NSString).length
        return re.firstMatch(in: textLower, range: NSRange(location: 0, length: n)) != nil
    }

    // MARK: - Overlap (subset of server `isTagOverlapping`)

    private static func overlaps(_ a: String, _ b: String) -> Bool {
        let x = a.lowercased()
        let y = b.lowercased()
        if x == y { return true }
        if x.contains(y) || y.contains(x) { return true }
        let pairs: [(String, String)] = [
            ("goodness", "righteousness"), ("grace", "mercy"), ("love", "mercy"), ("faith", "belief"), ("hope", "faith"),
            ("kingdom of god", "heaven"), ("jesus", "christ"), ("god", "father")
        ]
        for (p, q) in pairs {
            if (x == p && y == q) || (x == q && y == p) { return true }
        }
        return false
    }
}
