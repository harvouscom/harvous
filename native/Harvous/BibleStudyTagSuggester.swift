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
                let occurrences = countOccurrences(of: book.lowercased(), in: textLower)
                raw.append(Scored(name: book, category: .book, confidence: 0.9, occurrences: max(1, occurrences)))
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

        // Best primary:
        // - Prefer theme categories for casual character/place mentions.
        // - Let character/place win when repeated enough to indicate note-level focus.
        let primary = top.max(by: { a, b in
            let aScore = primaryScore(a)
            let bScore = primaryScore(b)
            if abs(aScore - bScore) > 0.001 { return aScore < bScore }
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
        var occurrences: Int
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

    private static func primaryScore(_ s: Scored) -> Double {
        var score = s.confidence
        switch s.category {
        case .spiritual, .biblical, .life:
            score += 0.08
        case .character, .place:
            if s.occurrences <= 1 {
                score -= 0.12
            } else if s.occurrences >= 5 {
                score += 0.28
            } else if s.occurrences >= 3 {
                score += 0.18
            } else {
                score += 0.06
            }
        case .book:
            break
        }
        return score
    }

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
        a("Holiness", .spiritual, 0.8, ["sanctity", "set apart", "consecration"])
        a("Humility", .spiritual, 0.8, ["humble", "meek"])
        a("Obedience", .spiritual, 0.8, ["obey", "submission"])
        a("Trust", .spiritual, 0.8, ["dependence", "confidence in god"])
        a("Discernment", .spiritual, 0.8, ["spiritual discernment", "wisdom to judge"])
        a("Contentment", .spiritual, 0.8, ["satisfaction", "enough"])
        a("Perseverance", .spiritual, 0.8, ["steadfastness", "enduring faith"])
        a("Boldness", .spiritual, 0.8, ["courage in faith", "confidence"])
        a("Zeal", .spiritual, 0.8, ["fervor", "passion for god"])
        a("Devotion", .spiritual, 0.8, ["dedication", "commitment to god"])
        a("Thankfulness", .spiritual, 0.8, ["gratitude", "thanksgiving"])
        a("Compassion", .spiritual, 0.8, ["mercy", "tenderhearted"])
        a("Lament", .spiritual, 0.8, ["lamentation", "godly sorrow"])
        a("Waiting on God", .spiritual, 0.8, ["wait on the lord", "patient waiting"])
        a("Rest", .spiritual, 0.8, ["sabbath rest", "spiritual rest"])
        a("Healing", .spiritual, 0.8, ["restoration", "wholeness"])
        a("Deliverance", .spiritual, 0.8, ["rescue", "set free"])
        a("Renewal", .spiritual, 0.8, ["revival", "refreshing"])
        a("Sanctification", .spiritual, 0.8, ["made holy", "growing in holiness"])
        a("Spiritual Warfare", .spiritual, 0.8, ["armor of god", "battle in prayer"])
        a("Idolatry", .spiritual, 0.8, ["false gods", "heart idols"])
        a("Confession", .spiritual, 0.8, ["confess sin", "admit sin"])
        a("Temptation", .spiritual, 0.8, ["tested", "enticement to sin"])
        a("Purity", .spiritual, 0.8, ["clean heart", "moral purity"])
        a("Reconciliation", .spiritual, 0.8, ["restored relationship", "peace making"])
        a("Evangelism", .spiritual, 0.8, ["share the gospel", "witness"])
        a("Spiritual Growth", .spiritual, 0.8, ["maturity", "grow in christ"])
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
        a("Holy Spirit", .biblical, 0.8, ["spirit", "spirit of god", "spirit of truth"])
        a("Trinity", .biblical, 0.8, ["triune god", "father son holy spirit"])
        a("Incarnation", .biblical, 0.8, ["word became flesh", "god became man"])
        a("Justification", .biblical, 0.8, ["declared righteous", "justified"])
        a("Sanctification", .biblical, 0.8, ["holy living", "set apart"])
        a("Glorification", .biblical, 0.8, ["future glory", "final redemption"])
        a("Repentance", .biblical, 0.8, ["turn from sin", "godly repentance"])
        a("Grace by Faith", .biblical, 0.8, ["saved by grace through faith", "not by works"])
        a("Election", .biblical, 0.8, ["chosen", "predestination"])
        a("Adoption", .biblical, 0.8, ["children of god", "sons and daughters"])
        a("New Creation", .biblical, 0.8, ["new self", "born again"])
        a("Regeneration", .biblical, 0.8, ["new birth", "rebirth"])
        a("Covenant Faithfulness", .biblical, 0.8, ["steadfast love", "hesed"])
        a("Temple", .biblical, 0.8, ["tabernacle", "dwelling place of god"])
        a("Priesthood", .biblical, 0.8, ["high priest", "royal priesthood"])
        a("Sacrificial System", .biblical, 0.8, ["burnt offering", "sin offering"])
        a("Exodus", .biblical, 0.8, ["deliverance from egypt", "passover"])
        a("Exile", .biblical, 0.8, ["captivity", "babylon"])
        a("Restoration", .biblical, 0.8, ["return", "rebuild"])
        a("Messiah", .biblical, 0.8, ["christ", "anointed one"])
        a("Lordship", .biblical, 0.8, ["jesus is lord", "submission to christ"])
        a("Cross", .biblical, 0.8, ["crucifixion", "calvary"])
        a("Second Coming", .biblical, 0.8, ["return of christ", "christ's return"])
        a("Eternal Life", .biblical, 0.8, ["life everlasting", "everlasting life"])
        a("Hell", .biblical, 0.8, ["gehenna", "eternal punishment"])
        a("New Heaven and New Earth", .biblical, 0.8, ["new creation world", "renewed creation"])
        a("Spiritual Gifts", .biblical, 0.8, ["gifts of the spirit", "charisms"])
        a("Church", .biblical, 0.8, ["body of christ", "ekklesia"])
        a("Mission", .biblical, 0.8, ["great commission", "send"])
        a("Discipleship", .biblical, 0.8, ["follow me", "make disciples"])
        a("Stewardship", .biblical, 0.8, ["faithful manager", "entrusted"])
        a("Creation", .biblical, 0.8, ["created order", "maker"])
        a("Fall", .biblical, 0.8, ["the fall", "genesis 3"])
        a("Providence", .biblical, 0.8, ["god's sovereignty", "god's care"])
        a("Sovereignty", .biblical, 0.8, ["god reigns", "rule of god"])
        a("Covenant Community", .biblical, 0.8, ["people of god", "holy nation"])
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
        a("Loneliness", .life, 0.7, ["alone", "isolation"])
        a("Shame", .life, 0.7, ["guilt", "disgrace"])
        a("Anger", .life, 0.7, ["wrath", "resentment", "frustration"])
        a("Doubt", .life, 0.7, ["uncertainty", "unbelief"])
        a("Depression", .life, 0.7, ["despair", "hopelessness"])
        a("Burnout", .life, 0.7, ["exhaustion", "weary"])
        a("Leadership", .life, 0.7, ["leading", "influence"])
        a("Decision Making", .life, 0.7, ["guidance", "direction"])
        a("Calling", .life, 0.7, ["vocation", "purpose"])
        a("Identity", .life, 0.7, ["who i am", "identity in christ"])
        a("Relationships", .life, 0.7, ["relational conflict", "community"])
        a("Conflict", .life, 0.7, ["disagreement", "strife"])
        a("Reconciliation", .life, 0.7, ["forgive each other", "restore relationship"])
        a("Healing from Trauma", .life, 0.7, ["trauma", "woundedness"])
        a("Sexual Integrity", .life, 0.7, ["sexual purity", "chastity"])
        a("Addiction", .life, 0.7, ["enslavement", "dependency"])
        a("Mental Health", .life, 0.7, ["emotional health", "inner healing"])
        a("Generosity", .life, 0.7, ["giving", "openhanded"])
        a("Contentment", .life, 0.7, ["satisfied", "not comparing"])
        a("Hospitality", .life, 0.7, ["welcome", "table fellowship"])
        a("Service", .life, 0.7, ["serve others", "servanthood"])
        a("Workplace", .life, 0.7, ["career", "coworkers", "office"])
        a("Technology", .life, 0.7, ["screens", "media habits"])
        a("Rest", .life, 0.7, ["margin", "sabbath rhythms"])
        a("Stewardship", .life, 0.7, ["time management", "resources"])
        // Place (sample)
        a("Jerusalem", .place, 0.9, ["holy city", "zion"])
        a("Bethlehem", .place, 0.9, [])
        a("Nazareth", .place, 0.9, [])
        a("Galilee", .place, 0.9, [])
        a("Eden", .place, 0.9, ["garden of eden"])
        a("Egypt", .place, 0.9, [])
        a("Babylon", .place, 0.9, [])
        a("Jordan", .place, 0.9, ["jordan river"])
        a("Mount Sinai", .place, 0.9, ["sinai"])
        a("Zion", .place, 0.9, [])
        // Character (sample — avoid short names that overlap books)
        a("Moses", .character, 0.9, [])
        a("Abraham", .character, 0.9, ["abram"])
        a("Paul", .character, 0.9, ["apostle paul"])
        a("Peter", .character, 0.9, ["simon peter"])
        a("David", .character, 0.9, ["king david"])
        a("Solomon", .character, 0.9, [])
        a("Isaiah", .character, 0.9, ["prophet isaiah"])
        a("Jeremiah", .character, 0.9, ["prophet jeremiah"])
        a("Ezekiel", .character, 0.9, ["prophet ezekiel"])
        a("Daniel", .character, 0.9, ["prophet daniel"])
        a("Elijah", .character, 0.9, [])
        a("Elisha", .character, 0.9, [])
        a("Mary", .character, 0.9, ["mother of jesus"])
        a("Joseph", .character, 0.9, ["joseph son of jacob", "joseph husband of mary"])
        a("John the Baptist", .character, 0.9, ["baptizer"])
        a("John", .character, 0.9, ["apostle john"])
        a("James", .character, 0.9, ["apostle james"])
        a("Timothy", .character, 0.9, [])
        a("Ruth", .character, 0.9, [])
        a("Esther", .character, 0.9, [])
        a("Job", .character, 0.9, [])
        a("Nehemiah", .character, 0.9, [])
        a("Ezra", .character, 0.9, [])
        a("Joshua", .character, 0.9, [])
        a("Noah", .character, 0.9, [])
        a("Jacob", .character, 0.9, ["israel"])
        a("Isaac", .character, 0.9, [])
        a("Sarah", .character, 0.9, [])
        a("Deborah", .character, 0.9, [])
        a("Hannah", .character, 0.9, [])
        a("Samuel", .character, 0.9, [])
        a("Jesus", .character, 0.95, ["christ", "messiah"])
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
            confidence: min(1.0, conf + titleBoost + frequencyBoost),
            occurrences: max(1, frequency)
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
            ("kingdom of god", "heaven"), ("jesus", "christ"), ("god", "father"),
            ("prayer", "intercession"), ("thanksgiving", "thankfulness"), ("salvation", "redemption"),
            ("cross", "atonement"), ("gospel", "mission"), ("mission", "evangelism"),
            ("discipleship", "spiritual growth"), ("sanctification", "holiness"), ("grief", "lament"),
            ("fear", "anxiety"), ("healing", "restoration"), ("deliverance", "salvation"),
            ("reconciliation", "forgiveness"), ("church", "body of christ"), ("holy spirit", "spirit"),
            ("second coming", "return of christ"), ("eternal life", "heaven"), ("stewardship", "generosity"),
            ("contentment", "rest"), ("wisdom", "discernment"), ("sin", "temptation"),
            ("idolatry", "false gods"), ("trust", "faith"), ("justice", "mercy")
        ]
        for (p, q) in pairs {
            if (x == p && y == q) || (x == q && y == p) { return true }
        }
        return false
    }
}
