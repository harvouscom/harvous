import Foundation

/// Maps informal prose to canonical subject tags — keep in sync with `src/utils/subject-tag-candidates.ts`.
enum SubjectTagCandidates {
    enum SubjectCategory: String {
        case spiritual, biblical, life, narrative
    }

    struct SubjectRow {
        let name: String
        let category: SubjectCategory
        let synonyms: [String]
    }

    struct Candidate {
        let name: String
        let tagCategory: String
        let confidence: Double
        let matchedPhrase: String?
    }

    private static let maxCandidates = 4
    private static let confNameTitle = 0.82
    private static let confNameBody = 0.76
    private static let confSynTitle = 0.78
    private static let confSynBody = 0.72

    private static let rows: [SubjectRow] = [
        SubjectRow(name: "Prayer", category: .spiritual, synonyms: ["praying", "intercession", "petition", "prayers", "how to pray", "power of prayer"]),
        SubjectRow(name: "Faith", category: .spiritual, synonyms: ["belief", "believing", "trust in god", "faith in god", "trusting god", "having faith"]),
        SubjectRow(name: "Love", category: .spiritual, synonyms: ["gods love", "god's love", "gods love for us", "loving others", "loving each other", "love for others", "agape", "compassion", "charity"]),
        SubjectRow(name: "Hope", category: .spiritual, synonyms: ["expectation", "anticipation", "hope in god"]),
        SubjectRow(name: "Grace", category: .spiritual, synonyms: ["favor", "unmerited favor", "gods grace", "god's grace"]),
        SubjectRow(name: "Mercy", category: .spiritual, synonyms: ["compassion", "pity", "gods mercy", "god's mercy"]),
        SubjectRow(name: "Forgiveness", category: .spiritual, synonyms: ["pardon", "absolution", "forgiving others", "forgiveness of sins", "being forgiven"]),
        SubjectRow(name: "Repentance", category: .spiritual, synonyms: ["turning from sin", "conversion", "change of heart", "turning to god", "repenting"]),
        SubjectRow(name: "Worship", category: .spiritual, synonyms: ["adoration", "reverence", "worshiping god"]),
        SubjectRow(name: "Praise", category: .spiritual, synonyms: ["praising god", "glorify", "exalt"]),
        SubjectRow(name: "Thanksgiving", category: .spiritual, synonyms: ["gratitude", "thankfulness", "giving thanks", "being thankful"]),
        SubjectRow(name: "Peace", category: .spiritual, synonyms: ["shalom", "tranquility", "inner peace", "peace of god", "peace with god"]),
        SubjectRow(name: "Joy", category: .spiritual, synonyms: ["gladness", "rejoicing", "happiness"]),
        SubjectRow(name: "Patience", category: .spiritual, synonyms: ["endurance", "perseverance", "longsuffering", "waiting on god"]),
        SubjectRow(name: "Humility", category: .spiritual, synonyms: ["humbleness", "meekness", "modesty", "being humble"]),
        SubjectRow(name: "Obedience", category: .spiritual, synonyms: ["obeying god", "submission", "following god", "doing gods will"]),
        SubjectRow(name: "Trust", category: .spiritual, synonyms: ["trusting god", "dependence on god", "relying on god"]),
        SubjectRow(name: "Salvation", category: .biblical, synonyms: ["being saved", "how to be saved", "how to get saved", "saved", "deliverance", "rescue", "baptism and salvation", "eternal salvation"]),
        SubjectRow(name: "Redemption", category: .biblical, synonyms: ["ransom", "redeemed", "redeeming"]),
        SubjectRow(name: "Atonement", category: .biblical, synonyms: ["propitiation", "reconciliation with god", "blood of christ"]),
        SubjectRow(name: "Justification", category: .biblical, synonyms: ["justified by faith", "righteous before god", "declared righteous"]),
        SubjectRow(name: "Sanctification", category: .biblical, synonyms: ["becoming more like christ", "growing in christ", "spiritual growth", "holiness", "being made holy", "walking in the spirit"]),
        SubjectRow(name: "Eternal Life", category: .biblical, synonyms: ["everlasting life", "life after death", "forever with god", "immortality"]),
        SubjectRow(name: "New Birth", category: .biblical, synonyms: ["born again", "being born again", "new life in christ", "regeneration", "new creation"]),
        SubjectRow(name: "Resurrection", category: .biblical, synonyms: ["rising from the dead", "risen", "resurrected", "the resurrection"]),
        SubjectRow(name: "Incarnation", category: .biblical, synonyms: ["god becoming man", "word became flesh", "jesus is god", "god being with us", "god with us"]),
        SubjectRow(name: "Kingdom of God", category: .biblical, synonyms: ["kingdom of heaven", "gods kingdom", "god's kingdom", "entering the kingdom of god", "reign of god"]),
        SubjectRow(name: "Gospel", category: .biblical, synonyms: ["good news", "evangel", "the message of jesus"]),
        SubjectRow(name: "Discipleship", category: .biblical, synonyms: ["following christ", "being a disciple", "following jesus", "disciples"]),
        SubjectRow(name: "Evangelism", category: .biblical, synonyms: ["mission", "witnessing", "sharing faith", "sharing the gospel", "the great commission", "making disciples"]),
        SubjectRow(name: "Holiness", category: .biblical, synonyms: ["being holy", "set apart", "purity", "consecration"]),
        SubjectRow(name: "Righteousness", category: .biblical, synonyms: ["being righteous", "right living", "uprightness"]),
        SubjectRow(name: "Sin", category: .biblical, synonyms: ["transgression", "iniquity", "sinfulness", "sin nature", "wrongdoing"]),
        SubjectRow(name: "Judgment", category: .biblical, synonyms: ["judgement", "day of judgment", "judgment day", "final judgment", "gods judgment"]),
        SubjectRow(name: "Covenant", category: .biblical, synonyms: ["gods promise", "agreement", "the new covenant", "the old covenant"]),
        SubjectRow(name: "God's Sovereignty", category: .biblical, synonyms: ["god is in control", "sovereignty of god", "gods will", "gods plan", "predestination", "providence", "omnipotence"]),
        SubjectRow(name: "God's Faithfulness", category: .biblical, synonyms: ["faithfulness of god", "god keeps his promises", "promises of god", "gods promises"]),
        SubjectRow(name: "Holy Spirit", category: .biblical, synonyms: ["the spirit", "gods spirit", "spirit of god", "filled with the spirit", "gifts of the spirit"]),
        SubjectRow(name: "Spiritual Warfare", category: .biblical, synonyms: ["the devil", "satan", "temptation", "spiritual battle", "fighting evil", "the enemy"]),
        SubjectRow(name: "Prophecy", category: .biblical, synonyms: ["prophecies", "foretelling", "prophets", "end times", "second coming", "the last days"]),
        SubjectRow(name: "Heaven", category: .biblical, synonyms: ["paradise", "the afterlife"]),
        SubjectRow(name: "Suffering", category: .life, synonyms: ["pain", "trials", "hardship", "affliction", "going through hard times", "persecution"]),
        SubjectRow(name: "Grief", category: .life, synonyms: ["mourning", "sorrow", "loss", "grieving"]),
        SubjectRow(name: "Fear", category: .life, synonyms: ["anxiety", "worry", "being afraid", "fear and anxiety", "overcoming fear", "stressed", "overwhelmed", "panic", "freaking out", "my anxiety"]),
        SubjectRow(name: "Anger", category: .life, synonyms: ["wrath", "rage", "being angry"]),
        SubjectRow(name: "Pride", category: .life, synonyms: ["arrogance", "conceit", "being prideful"]),
        SubjectRow(name: "Wisdom", category: .life, synonyms: ["understanding", "insight", "discernment", "godly wisdom"]),
        SubjectRow(name: "Stewardship", category: .life, synonyms: ["money", "finances", "wealth", "generosity", "giving", "managing money", "tithing", "bills", "paycheck", "budget", "tight on money"]),
        SubjectRow(name: "Work", category: .life, synonyms: ["labor", "employment", "vocation", "job", "working hard", "boss", "coworker", "9 to 5", "burnout"]),
        SubjectRow(name: "Marriage", category: .life, synonyms: ["wedding", "spouse", "husband and wife", "a healthy marriage", "married life", "fighting with my wife", "marriage struggles"]),
        SubjectRow(name: "Family", category: .life, synonyms: ["relatives", "household", "parents and children"]),
        SubjectRow(name: "Parenting", category: .life, synonyms: ["raising children", "childrearing", "fatherhood", "motherhood", "kids acting up", "raising kids", "teenagers"]),
        SubjectRow(name: "Friendship", category: .life, synonyms: ["companionship", "fellowship", "friends", "small group"]),
        SubjectRow(name: "Death", category: .life, synonyms: ["dying", "mortality", "passing away"]),
        SubjectRow(name: "Healing", category: .life, synonyms: ["health", "wellness", "being healed", "sickness", "faith healing"]),
        SubjectRow(name: "Justice", category: .life, synonyms: ["fairness", "doing justice", "injustice", "oppression"]),
        SubjectRow(name: "Contentment", category: .life, synonyms: ["satisfaction", "being content", "rest"]),
        SubjectRow(name: "Provision", category: .life, synonyms: ["gods provision", "god provides", "daily bread", "gods care"]),
        SubjectRow(name: "Identity in Christ", category: .life, synonyms: ["who am i in christ", "who i am in christ", "identity"]),
        SubjectRow(name: "Creation", category: .narrative, synonyms: ["gods creation", "god creating the world", "creating the world", "the creator", "in the beginning", "made the heavens and earth"]),
        SubjectRow(name: "The Fall", category: .narrative, synonyms: ["fall of man", "adam and eve", "the garden of eden", "original sin", "forbidden fruit"]),
        SubjectRow(name: "The Flood", category: .narrative, synonyms: ["noah", "noah's ark", "the great flood"]),
        SubjectRow(name: "Passover", category: .narrative, synonyms: ["passover lamb", "feast of passover", "pascha", "blood of the lamb", "lamb of god", "our passover lamb"]),
        SubjectRow(name: "The Exodus", category: .narrative, synonyms: ["exodus from egypt", "leaving egypt", "the red sea", "deliverance from egypt", "out of egypt", "passover", "the passover"]),
        SubjectRow(name: "Biblical Feasts", category: .narrative, synonyms: ["feasts of the lord", "feast of unleavened bread", "feast of weeks", "feast of trumpets", "day of atonement", "feast of tabernacles"]),
        SubjectRow(name: "The Ten Commandments", category: .narrative, synonyms: ["ten commandments", "decalogue", "the law of moses"]),
        SubjectRow(name: "Wilderness Wandering", category: .narrative, synonyms: ["the wilderness", "wandering in the desert", "forty years"]),
        SubjectRow(name: "The Promised Land", category: .narrative, synonyms: ["promised land", "land of canaan", "entering canaan"]),
        SubjectRow(name: "The Exile", category: .narrative, synonyms: ["babylon", "babylonian exile", "captivity", "deportation"]),
        SubjectRow(name: "Genealogy", category: .narrative, synonyms: ["lineage", "descendants", "family line", "ancestry", "the generations of"]),
        SubjectRow(name: "Birth of Jesus", category: .narrative, synonyms: ["jesus birth", "the nativity", "born in bethlehem", "the christ child", "mary the mother of jesus"]),
        SubjectRow(name: "Sermon on the Mount", category: .narrative, synonyms: ["the beatitudes", "beatitudes"]),
        SubjectRow(name: "Parables", category: .narrative, synonyms: ["parable", "jesus teachings", "stories jesus told"]),
        SubjectRow(name: "Miracles", category: .narrative, synonyms: ["miracle", "wonders", "signs and wonders"]),
        SubjectRow(name: "The Passion", category: .narrative, synonyms: ["suffering of christ", "the cross", "crucifixion", "jesus death", "death of jesus", "good friday", "calvary"]),
        SubjectRow(name: "The Resurrection", category: .narrative, synonyms: ["jesus rose", "empty tomb", "easter", "risen lord"]),
        SubjectRow(name: "The Early Church", category: .narrative, synonyms: ["pentecost", "the apostles", "acts of the apostles", "the first church"]),
        SubjectRow(name: "Glory of God", category: .biblical, synonyms: ["gods glory", "god's glory", "the glory of the lord", "gods majesty"]),
        SubjectRow(name: "Holiness of God", category: .biblical, synonyms: ["god is holy", "gods holiness"]),
        SubjectRow(name: "The Word of God", category: .biblical, synonyms: ["scripture", "gods word", "the bible", "reading the bible", "the scriptures"]),
        SubjectRow(name: "Fear of the Lord", category: .biblical, synonyms: ["fearing god", "reverence for god", "godly fear"]),
        SubjectRow(name: "Idolatry", category: .biblical, synonyms: ["idols", "false gods", "worshiping idols", "idol worship"]),
        SubjectRow(name: "Temptation", category: .biblical, synonyms: ["being tempted", "resisting temptation"]),
        SubjectRow(name: "The Church", category: .biblical, synonyms: ["the body of christ", "the local church", "church life", "gathering of believers"]),
        SubjectRow(name: "Spiritual Gifts", category: .biblical, synonyms: ["gifts of the spirit", "using your gifts", "spiritual gift"]),
        SubjectRow(name: "Servanthood", category: .biblical, synonyms: ["serving others", "service", "being a servant", "servant leadership"]),
        SubjectRow(name: "Generosity", category: .biblical, synonyms: ["giving", "tithing", "cheerful giver", "sharing with others"]),
        SubjectRow(name: "Assurance", category: .biblical, synonyms: ["assurance of salvation", "eternal security", "security in christ"]),
        SubjectRow(name: "Perseverance", category: .biblical, synonyms: ["endurance", "standing firm", "pressing on", "finishing the race", "not giving up"]),
        SubjectRow(name: "Adoption", category: .biblical, synonyms: ["children of god", "sons of god", "adopted by god", "gods children"]),
        SubjectRow(name: "Unity", category: .biblical, synonyms: ["oneness", "unity in the church", "being united"]),
        SubjectRow(name: "Sovereign Grace", category: .biblical, synonyms: ["election", "chosen by god", "gods choosing"]),
        SubjectRow(name: "Loving Your Enemies", category: .life, synonyms: ["love your enemies", "enemies", "turning the other cheek"]),
        SubjectRow(name: "Hospitality", category: .life, synonyms: ["welcoming others", "being hospitable"]),
        SubjectRow(name: "Integrity", category: .life, synonyms: ["honesty", "character", "being honest", "uprightness"]),
        SubjectRow(name: "Purity", category: .life, synonyms: ["sexual purity", "chastity", "staying pure", "lust"]),
        SubjectRow(name: "Guidance", category: .life, synonyms: ["gods guidance", "gods will for my life", "making decisions", "direction from god", "discerning gods will", "what should i do", "big decision"]),
        SubjectRow(name: "Loneliness", category: .life, synonyms: ["being lonely", "isolation", "feeling alone", "no one gets it", "left out"]),
        SubjectRow(name: "Doubt", category: .life, synonyms: ["doubting", "questioning faith", "struggling to believe"]),
        SubjectRow(name: "Compassion", category: .life, synonyms: ["caring for others", "caring for the poor", "helping the poor", "mercy to others"]),
        SubjectRow(name: "Rest", category: .life, synonyms: ["resting in god", "finding rest", "gods rest"]),
        SubjectRow(name: "Abraham's Covenant", category: .narrative, synonyms: ["gods promise to abraham", "abrahamic covenant", "the call of abraham"]),
        SubjectRow(name: "The Tabernacle", category: .narrative, synonyms: ["tabernacle", "tent of meeting", "the ark of the covenant"]),
        SubjectRow(name: "The Temple", category: .narrative, synonyms: ["solomon's temple", "solomons temple", "temple of solomon", "rebuilding the temple", "the second temple"]),
        SubjectRow(name: "David's Reign", category: .narrative, synonyms: ["king david", "davidic kingdom", "davidic covenant"]),
        SubjectRow(name: "The Prophets", category: .narrative, synonyms: ["the prophet", "prophetic word", "words of the prophets"]),
        SubjectRow(name: "The Last Supper", category: .narrative, synonyms: ["upper room", "the lord supper instituted", "breaking bread together", "lord's supper", "lords supper", "communion", "eucharist", "breaking bread"]),
        SubjectRow(name: "The Day of the Lord", category: .narrative, synonyms: ["day of the lord", "gods coming judgment", "the great day"]),
        SubjectRow(name: "The New Jerusalem", category: .narrative, synonyms: ["new heaven and new earth", "the holy city", "new heavens and a new earth", "eternity"]),
    ]

    static func candidates(
        title: String,
        body: String,
        existingTagNames: [String] = [],
        excludeLabels: [String] = [],
        confidenceThreshold: Double = 0.7
    ) -> [Candidate] {
        let paddedTitle = padded(title)
        let paddedBody = padded(body)
        guard paddedTitle.count > 2 || paddedBody.count > 2 else { return [] }

        var raw: [Candidate] = []
        for row in rows {
            guard let scored = score(row, paddedTitle: paddedTitle, paddedBody: paddedBody) else { continue }
            guard scored.confidence >= confidenceThreshold else { continue }
            if isExcluded(row.name, excludeLabels: excludeLabels, existing: existingTagNames) { continue }
            if raw.contains(where: { overlaps($0.name, row.name) }) { continue }
            raw.append(Candidate(
                name: row.name,
                tagCategory: tagCategory(for: row.category),
                confidence: scored.confidence,
                matchedPhrase: scored.matchedPhrase
            ))
        }
        raw.sort { $0.confidence > $1.confidence }
        return Array(raw.prefix(maxCandidates))
    }

    /// Subjects a note's text is about — mirrors web `contentSubjects()` for folder enrichment.
    static func folderSubjectNames(title: String, body: String) -> [String] {
        let paddedTitle = padded(title)
        let paddedBody = padded(body)
        guard paddedTitle.count > 2 || paddedBody.count > 2 else { return [] }
        var found: [String: Int] = [:]
        for row in rows {
            var score = 0
            if containsPhrase(paddedTitle, phrase: row.name) { score = max(score, 2) }
            else if containsPhrase(paddedBody, phrase: row.name) { score = max(score, 2) }
            for syn in row.synonyms {
                if containsPhrase(paddedTitle, phrase: syn) { score = max(score, 1) }
                else if containsPhrase(paddedBody, phrase: syn) { score = max(score, 1) }
            }
            if score > 0 { found[row.name] = max(found[row.name] ?? 0, score) }
        }
        return found.sorted { $0.value > $1.value }.map(\.key)
    }

    private static func tagCategory(for category: SubjectCategory) -> String {
        switch category {
        case .spiritual: return "spiritual"
        case .biblical: return "biblical"
        case .life: return "life"
        case .narrative: return "theme"
        }
    }

    private static func normalize(_ label: String) -> String {
        var s = label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        s = s.replacingOccurrences(of: "'", with: "'")
        s = s.replacingOccurrences(of: "`", with: "'")
        s = s.replacingOccurrences(of: "’", with: "'")
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "' "))
        s = String(s.unicodeScalars.map { allowed.contains($0) ? Character($0) : " " })
        while s.contains("  ") { s = s.replacingOccurrences(of: "  ", with: " ") }
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func padded(_ text: String) -> String {
        " \(normalize(text)) "
    }

    private static func containsPhrase(_ paddedText: String, phrase: String) -> Bool {
        let t = normalize(phrase)
        guard t.count >= 3 else { return false }
        return paddedText.contains(" \(t) ")
    }

    private static func score(
        _ row: SubjectRow,
        paddedTitle: String,
        paddedBody: String
    ) -> (confidence: Double, matchedPhrase: String?)? {
        var best = 0.0
        var matched: String?

        func consider(_ phrase: String, _ confidence: Double) {
            guard confidence > best else { return }
            best = confidence
            matched = phrase
        }

        if containsPhrase(paddedTitle, phrase: row.name) {
            consider(row.name, confNameTitle)
        } else if containsPhrase(paddedBody, phrase: row.name) {
            consider(row.name, confNameBody)
        }
        for syn in row.synonyms {
            if containsPhrase(paddedTitle, phrase: syn) {
                consider(syn, confSynTitle)
            } else if containsPhrase(paddedBody, phrase: syn) {
                consider(syn, confSynBody)
            }
        }
        guard best > 0 else { return nil }
        let phrase = matched == row.name ? nil : matched
        return (best, phrase)
    }

    private static func isExcluded(_ name: String, excludeLabels: [String], existing: [String]) -> Bool {
        for label in excludeLabels where overlaps(name, label) { return true }
        for label in existing where overlaps(name, label) { return true }
        return false
    }

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
            ("idolatry", "false gods"), ("trust", "faith"), ("justice", "mercy"),
        ]
        for (p, q) in pairs {
            if (x == p && y == q) || (x == q && y == p) { return true }
        }
        return false
    }
}
