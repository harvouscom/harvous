import Foundation

/// On-device auto-tags aligned with `server/utils/auto-tag-generator.ts` and `bible-study-keywords.ts`:
/// title/content keyword matching, category tie-breaks, and a single primary folder label (persisted as `primaryFolder`).
enum BibleStudyTagSuggester {
    // MARK: - Public API

    /// - parameter currentPrimaryOverride: When provided, secondaries are computed using this label instead
    ///   of the auto-suggested primary. Pass the note's existing `primaryFolder` value to preserve secondary
    ///   behaviour for pinned/overridden notes when computing off the main thread.
    static func result(
        title: String,
        body: String,
        existingFolders: [String] = [],
        currentPrimaryOverride: String? = nil
    ) -> (
        primaryFolder: String?,
        secondaryFolders: [String],
        tags: [String]
    ) {
        let analysis = analyze(title: title, body: body)
        let primary = resolveToExistingFolder(analysis.primaryCandidate, from: existingFolders)
        let secondaryPrimary = normalizedFolderName(currentPrimaryOverride) ?? normalizedFolderName(primary)
        let secondaries: [String]
        if let primaryTrimmed = secondaryPrimary {
            secondaries = autoSecondaryLabels(
                analysis: analysis,
                primaryLabel: primaryTrimmed,
                existingFolders: existingFolders
            )
        } else {
            secondaries = []
        }
        let filteredTags = tagsExcludingFolderMembership(
            analysis.tags,
            primaryLabel: secondaryPrimary,
            secondaryLabels: secondaries
        )
        let enriched = FolderSubjectEnrichment.enrich(
            primary: primary,
            secondaries: secondaries,
            title: title,
            body: body,
            allowPrimaryUpdate: true
        )
        return (enriched.primary, enriched.secondaries, filteredTags)
    }

    /// Recomputes `primaryFolder`, `secondaryFolders`, and `tags` from the note’s title and body.
    /// - parameter allowPrimaryUpdate: When false, primary stays stable regardless of lock flags; secondaries can still refresh.
    /// - parameter existingFolders: Names of folders already in the user’s library. When provided,
    ///   resolved candidates prefer an established name over a bare keyword (e.g. "Prayer" → "Prayer Life").
    ///
    /// **Lock (`isFolderPinned`)** freezes automatic **primary** changes only; secondaries still refresh from content.
    /// **Manual membership** (`isFolderUserOverride` without pin) freezes both until the user uses auto suggestion again.
    static func applyToNote(_ note: Note, allowPrimaryUpdate: Bool = true, existingFolders: [String] = []) {
        let analysis = analyze(title: note.title, body: note.body)

        // Manual tweaks without lock: preserve primary + secondaries from automation.
        if note.isFolderUserOverride && !note.isFolderPinned {
            return
        }

        let skipAutoPrimary = note.isFolderPinned || note.isFolderUserOverride
        if allowPrimaryUpdate && !skipAutoPrimary {
            applyPrimaryMutation(note: note, analysis: analysis, existingFolders: existingFolders)
        }
        refreshAutoSecondaries(
            note: note,
            analysis: analysis,
            existingFolders: existingFolders,
            allowPrimaryUpdate: allowPrimaryUpdate,
            skipAutoPrimary: skipAutoPrimary
        )

        let autoSuggested = tagsExcludingFolderMembership(analysis.tags, note: note)
            .filter { !note.isDismissedAutoTag($0) }
        let autoLower = Set(autoSuggested.map { $0.lowercased() })
        let analysisLower = Set(analysis.tags.map { $0.lowercased() })
        let manualKept = note.tags.filter { tag in
            if note.isDismissedAutoTag(tag) { return false }
            let lower = tag.lowercased()
            return !autoLower.contains(lower) && !analysisLower.contains(lower)
        }
        let merged = (manualKept + autoSuggested).uniquedPreservingOrderCaseInsensitive()
        if note.tags != merged {
            note.tags = merged
        }
    }

    private static func applyPrimaryMutation(note: Note, analysis: Analysis, existingFolders: [String]) {
        let current = normalizedFolderName(note.primaryFolder)
        let rawCandidate = normalizedFolderName(analysis.primaryCandidate)
        let resolved = resolveToExistingFolder(analysis.primaryCandidate, from: existingFolders)
        let candidate = normalizedFolderName(resolved)
        let scoringName = rawCandidate ?? candidate
        let now = Date()

        if !meetsMinimumContextForAutoFolder(note: note, candidate: rawCandidate, analysis: analysis) {
            return
        }

        guard let current else {
            note.primaryFolder = candidate
            if let scoringName {
                note.folderAutoConfidence = primaryScoreForName(scoringName, in: analysis)
                note.folderLastAutoUpdatedAt = now
            }
            return
        }
        guard let candidate else {
            note.primaryFolder = current
            return
        }
        guard current.caseInsensitiveCompare(candidate) != .orderedSame else {
            note.primaryFolder = candidate
            return
        }

        // Auto mode tracks the best candidate. The content-boundary gate in `NoteEditorView`
        // (`shouldAllowPrimaryFolderUpdate`) is the only stabilizer — no time cooldown or score
        // hysteresis keeps a stale primary once a stronger topic emerges.
        note.primaryFolder = candidate
        note.folderAutoConfidence = primaryScoreForName(scoringName ?? candidate, in: analysis)
        note.folderLastAutoUpdatedAt = now
    }

    private static let maxAutoSecondaries = 3
    private static let secondaryMinPrimaryScore: Double = 0.78
    /// Weak (single-mention, not-in-title) `character` / `place` hits must clear a bar above the most a
    /// lone mention can score (incl. the opening boost) so a name dropped once in passing stays a tag.
    private static let secondaryCharacterPlaceMinScore: Double = 0.95
    /// When two folder scores are within this band, prefer title presence and category rank (reduces noisy primary flips).
    private static let primaryScoreAmbiguityEpsilon: Double = 0.04

    private static func refreshAutoSecondaries(
        note: Note,
        analysis: Analysis,
        existingFolders: [String],
        allowPrimaryUpdate: Bool,
        skipAutoPrimary: Bool
    ) {
        guard let primaryTrimmed = normalizedFolderName(note.primaryFolder) else {
            note.secondaryFolders = []
            return
        }
        let gate = normalizedFolderName(analysis.primaryCandidate) ?? primaryTrimmed
        if !meetsMinimumContextForAutoFolder(note: note, candidate: gate, analysis: analysis) {
            note.secondaryFolders = []
            return
        }
        let keywordSecondaries = autoSecondaryLabels(
            analysis: analysis,
            primaryLabel: primaryTrimmed,
            existingFolders: existingFolders
        )
        let enriched = FolderSubjectEnrichment.enrich(
            primary: note.primaryFolder,
            secondaries: keywordSecondaries,
            title: note.title,
            body: note.body,
            allowPrimaryUpdate: allowPrimaryUpdate && !skipAutoPrimary
        )
        if allowPrimaryUpdate && !skipAutoPrimary {
            note.primaryFolder = enriched.primary
        }
        note.secondaryFolders = enriched.secondaries
    }

    private static func autoSecondaryLabels(
        analysis: Analysis,
        primaryLabel: String,
        existingFolders: [String]
    ) -> [String] {
        var out: [String] = []
        let ranked = analysis.picked.sorted { primaryScore($0, in: analysis) > primaryScore($1, in: analysis) }
        for s in ranked {
            guard out.count < maxAutoSecondaries else { break }
            let resolved = resolveToExistingFolder(s.name, from: existingFolders)
            guard let label = normalizedFolderName(resolved) else { continue }
            if label.caseInsensitiveCompare(primaryLabel) == .orderedSame { continue }
            if overlaps(label, primaryLabel) { continue }
            if out.contains(where: { $0.caseInsensitiveCompare(label) == .orderedSame }) { continue }
            if out.contains(where: { overlaps($0, label) }) { continue }
            if !isEligibleSecondaryFolder(s, in: analysis) { continue }
            out.append(label)
        }
        return out
    }

    // MARK: - Scoring

    private struct Scored {
        var name: String
        var category: TagCategory
        var confidence: Double
        var occurrences: Int
        var inTitle: Bool
    }

    private struct Analysis {
        var picked: [Scored]
        var tags: [String]
        var primaryCandidate: String?
        var title: String = ""
        var body: String = ""
        var openingSegment: String = ""
    }

    private enum TagCategory: String, CaseIterable {
        case spiritual, biblical, book, life, place, character
    }

    /// Lower rank = better primary folder when confidence ties.
    private static func folderCategoryRank(_ c: TagCategory) -> Int {
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
    private static let themePrimaryCategories: Set<TagCategory> = [.spiritual, .biblical, .life]
    private static let minimumBodyWordsForAutoFolder = 25
    private static let shortDraftStrongTitleThreshold = 1.02
    /// Skip pathological bodies that would block the main thread during note open.
    private static let maximumAnalyzeBodyLength = ScriptureDetector.maximumDetectLength

    private static let autoFolderExcludedNames: Set<String> = ["god", "jesus", "holy spirit"]
    private static let openingSegmentMaxWords = 120
    private static let openingNarrativeFolderBoost: Double = 0.1

    private static func isAutoFolderExcluded(_ name: String) -> Bool {
        autoFolderExcludedNames.contains(name.lowercased())
    }

    private static func analyze(title: String, body: String) -> Analysis {
        let cappedBody = body.count > maximumAnalyzeBodyLength
            ? String(body.prefix(maximumAnalyzeBodyLength))
            : body
        let fullText = "\(title) \(cappedBody)"
        let titleLower = title.lowercased()
        let contentLower = cappedBody.lowercased()
        let textLower = fullText.lowercased()

        var raw: [Scored] = []
        for row in Self.keywordRows {
            if let s = match(
                row,
                title: title,
                body: cappedBody,
                titleLower: titleLower,
                contentLower: contentLower
            ) {
                if isAutoFolderExcluded(s.name) { continue }
                raw.append(s)
            }
        }
        for book in Self.bookNames {
            if matchBookWord(book, in: textLower, originalText: fullText) {
                let bookLower = book.lowercased()
                let occurrences = book.split(separator: " ").count > 1
                    ? countOccurrences(of: bookLower, in: textLower)
                    : countPersonAwareNeedleMatches(bookLower, in: fullText)
                let inTitle = titleLower.contains(bookLower)
                raw.append(
                    Scored(
                        name: book,
                        category: .book,
                        confidence: 0.9,
                        occurrences: max(1, occurrences),
                        inTitle: inTitle
                    )
                )
            }
        }

        raw.sort { $0.confidence > $1.confidence }

        var picked: [Scored] = []
        for s in raw {
            if picked.contains(where: { overlaps(s.name, $0.name) }) { continue }
            var adj = s
            if Self.bibleStudyBoostCategories.contains(adj.category) {
                adj.confidence = min(1.0, adj.confidence + 0.05)
            }
            if let idx = picked.firstIndex(where: { $0.name.lowercased() == adj.name.lowercased() }) {
                if shouldPreferKeywordRowOverExisting(new: adj, existing: picked[idx]) {
                    picked[idx] = adj
                }
                continue
            }
            picked.append(adj)
        }

        picked.sort { $0.confidence > $1.confidence }
        let hasLiteralJesus = titleLower.range(of: #"\bjesus\b"#, options: .regularExpression) != nil
            || contentLower.range(of: #"\bjesus\b"#, options: .regularExpression) != nil
        picked = picked.filter { scored in
            guard scored.name.lowercased() == "jesus" else { return true }
            return !ChristKeywordContextGate.shouldSuppressJesusTag(
                confidence: scored.confidence,
                fullTextLower: textLower,
                titleLower: titleLower,
                synonymOnly: !hasLiteralJesus
            )
        }

        let existingKeywordNames = picked.map(\.name)
        for sc in SubjectTagCandidates.candidates(
            title: title,
            body: cappedBody,
            existingTagNames: existingKeywordNames
        ) {
            if picked.contains(where: { overlaps($0.name, sc.name) }) { continue }
            let cat: TagCategory
            switch sc.tagCategory {
            case "spiritual": cat = .spiritual
            case "life": cat = .life
            default: cat = .biblical
            }
            let nameLower = sc.name.lowercased()
            let inTitle = titleLower.contains(nameLower)
            picked.append(
                Scored(
                    name: sc.name,
                    category: cat,
                    confidence: sc.confidence,
                    occurrences: 1,
                    inTitle: inTitle
                )
            )
        }
        picked.sort { $0.confidence > $1.confidence }

        var top = Array(picked.prefix(12))
        var tagNames = top.map(\.name)
        for personTag in detectPersonTags(in: fullText) {
            if tagNames.contains(where: { $0.caseInsensitiveCompare(personTag) == .orderedSame }) { continue }
            tagNames.append(personTag)
            if tagNames.count > 12 { tagNames = Array(tagNames.prefix(12)); break }
        }

        let openingSegment = extractOpeningSegment(title: title, body: cappedBody)
        var shell = Analysis(
            picked: picked,
            tags: tagNames,
            primaryCandidate: nil,
            title: title,
            body: cappedBody,
            openingSegment: openingSegment
        )

        // Gate the primary slot to note-defining candidates so a passing person/place mention does
        // not define the folder. `picked` stays intact for tags and secondaries.
        let primaryCandidates = picked.filter(isPrimaryEligible)
        let primary: String?
        if let first = primaryCandidates.first {
            let best = primaryCandidates.dropFirst().reduce(first) { betterPrimaryCandidate($0, $1, in: shell) }
            primary = best.name
        } else {
            primary = nil
        }
        shell.primaryCandidate = primary
        return shell
    }

    /// A named person/place may only win the primary folder when the note is genuinely about them:
    /// they appear in the title, or recur (>= 3 mentions). Themes and book references are always
    /// primary-eligible (a note studying a book organizes by that book). Keep in sync with web
    /// `isPrimaryEligibleRow`.
    private static func isPrimaryEligible(_ s: Scored) -> Bool {
        switch s.category {
        case .character, .place:
            return s.inTitle || s.occurrences >= 3
        default:
            return true
        }
    }

    /// A Bible book "defines" the note — and may win the primary folder over a theme — only when the
    /// note is genuinely a study of it: the book is in the title, or it recurs (>= 3). A passing
    /// citation never beats a real theme and stays a tag. Keep in sync with web `isBookDefining`.
    private static func isBookDefining(_ s: Scored) -> Bool {
        guard s.category == .book else { return false }
        return s.inTitle || s.occurrences >= 3
    }

    /// When a bible book and character share a name, keep the character row for scoring (John 3:16 ≠ a John study).
    private static func shouldPreferKeywordRowOverExisting(new: Scored, existing: Scored) -> Bool {
        if existing.category == .book && new.category == .character { return true }
        if existing.category == .character && new.category == .book { return false }
        return new.confidence > existing.confidence
    }

    /// First paragraph capped at ~120 words — narrative anchor for testimony-shaped notes.
    private static func extractOpeningSegment(title: String, body: String) -> String {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstParagraph = trimmedBody
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty }) ?? trimmedBody
        var segment = trimmedTitle.isEmpty ? firstParagraph : "\(trimmedTitle)\n\(firstParagraph)"
        let words = segment.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
        if words.count > openingSegmentMaxWords {
            segment = words.prefix(openingSegmentMaxWords).map(String.init).joined(separator: " ")
        }
        return segment.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func keywordAppearsInOpening(_ name: String, in analysis: Analysis) -> Bool {
        let opening = analysis.openingSegment.lowercased()
        guard !opening.isEmpty else { return false }
        let row = keywordRows.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
        var needles = [name]
        if let row {
            needles.append(contentsOf: row.synonyms)
        }
        var seen = Set<String>()
        for raw in needles {
            let needle = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !needle.isEmpty, !seen.contains(needle) else { continue }
            seen.insert(needle)
            if needle.contains(" ") || needle.contains("-") {
                if opening.contains(needle) { return true }
                continue
            }
            guard let regex = try? NSRegularExpression(
                pattern: "\\b\(NSRegularExpression.escapedPattern(for: needle))\\b",
                options: .caseInsensitive
            ) else { continue }
            let n = (opening as NSString).length
            if regex.firstMatch(in: opening, range: NSRange(location: 0, length: n)) != nil {
                return true
            }
        }
        return false
    }

    private static func isThemePrimaryCategory(_ category: TagCategory) -> Bool {
        themePrimaryCategories.contains(category)
    }

    /// "Pastor Tim" / "Ps Johnson" — not "Psalm 23".
    private static func detectPersonTags(in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(
            pattern: #"\b(?:Pastor|Ps\.?)\s+([A-Z][\w'-]+)\b"#,
            options: []
        ) else { return [] }
        let ns = text as NSString
        let range = NSRange(location: 0, length: ns.length)
        var out: [String] = []
        var seen = Set<String>()
        for m in regex.matches(in: text, range: range) {
            guard m.numberOfRanges >= 2 else { continue }
            let full = ns.substring(with: m.range).trimmingCharacters(in: .whitespacesAndNewlines)
            let prefixRaw = full.split(separator: " ").first.map(String.init) ?? "Ps"
            let prefix = prefixRaw.lowercased().hasPrefix("pastor") ? "Pastor" : "Ps"
            let name = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { continue }
            let tag = "\(prefix) \(name)"
            let key = tag.lowercased()
            if seen.insert(key).inserted { out.append(tag) }
        }
        return out
    }

    /// Maps a keyword candidate to an existing folder name when there is a clear, unambiguous match.
    ///
    /// Resolution priority (all word-boundary, case-insensitive):
    ///  1. Exact match → return existing name (normalizes case)
    ///  2. Existing name starts with candidate words (single match only) → prefer existing ("Prayer" → "Prayer Life")
    ///  3. Candidate words start with existing name (single match only) → prefer existing ("Kingdom of God" → "Kingdom")
    ///  4. Multiple matches or no match → return candidate unchanged
    private static func resolveToExistingFolder(_ candidate: String?, from existing: [String]) -> String? {
        guard let candidate, !existing.isEmpty else { return candidate }

        // 1. Exact match — normalizes case to the established name.
        if let exact = existing.first(where: { $0.caseInsensitiveCompare(candidate) == .orderedSame }) {
            return exact
        }

        let candidateWords = candidate.lowercased().split(separator: " ").filter { !$0.isEmpty }.map(String.init)
        guard !candidateWords.isEmpty else { return candidate }

        var forwardMatches: [String] = [] // existing name starts with candidate (existing extends candidate)
        var reverseMatches: [String] = [] // candidate starts with existing name (existing abbreviates candidate)

        for name in existing {
            let nameWords = name.lowercased().split(separator: " ").filter { !$0.isEmpty }.map(String.init)
            guard !nameWords.isEmpty else { continue }
            if nameWords.count > candidateWords.count, nameWords.starts(with: candidateWords) {
                forwardMatches.append(name)
            } else if nameWords.count < candidateWords.count, candidateWords.starts(with: nameWords) {
                reverseMatches.append(name)
            }
        }

        if forwardMatches.count == 1 { return forwardMatches[0] }
        if reverseMatches.count == 1 { return reverseMatches[0] }
        return candidate
    }

    private static func meetsMinimumContextForAutoFolder(note: Note, candidate: String?, analysis: Analysis) -> Bool {
        guard let candidate else { return false }
        let wordCount = note.body.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count
        if wordCount >= minimumBodyWordsForAutoFolder { return true }
        let candidateScore = primaryScoreForName(candidate, in: analysis)
        return candidateScore >= shortDraftStrongTitleThreshold
    }

    private static func primaryScoreForName(_ name: String, in analysis: Analysis) -> Double {
        guard let scored = scoredForName(name, in: analysis) else { return 0 }
        return primaryScore(scored, in: analysis)
    }

    private static func scoredForName(_ name: String, in analysis: Analysis) -> Scored? {
        analysis.picked.first { $0.name.caseInsensitiveCompare(name).rawValue == 0 }
    }

    private static func normalizedFolderName(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Picks the stronger primary folder between two scored rows (`primaryScore`, then title, then category rank when scores are close).
    private static func betterPrimaryCandidate(_ a: Scored, _ b: Scored, in analysis: Analysis) -> Scored {
        let sa = primaryScore(a, in: analysis)
        let sb = primaryScore(b, in: analysis)
        if isThemePrimaryCategory(a.category), (b.category == .character || b.category == .place), !b.inTitle {
            if sb - sa < 0.18 { return a }
        }
        if isThemePrimaryCategory(b.category), (a.category == .character || a.category == .place), !a.inTitle {
            if sa - sb < 0.18 { return b }
        }
        // A theme outranks a Bible-book mention unless the book is the note's subject (book-defining:
        // in title or recurring). A passing book citation never wins primary over a real theme; a
        // book-study (defining book) competes on raw score, so its title boost can carry the primary.
        if isThemePrimaryCategory(a.category), b.category == .book, !isBookDefining(b) {
            return a
        }
        if isThemePrimaryCategory(b.category), a.category == .book, !isBookDefining(a) {
            return b
        }
        if abs(sa - sb) > primaryScoreAmbiguityEpsilon {
            return sa >= sb ? a : b
        }
        if a.inTitle != b.inTitle {
            return a.inTitle ? a : b
        }
        if a.inTitle && b.inTitle {
            if isThemePrimaryCategory(a.category), b.category == .character { return a }
            if isThemePrimaryCategory(b.category), a.category == .character { return b }
        }
        let aOpening = keywordAppearsInOpening(a.name, in: analysis)
        let bOpening = keywordAppearsInOpening(b.name, in: analysis)
        if aOpening != bOpening {
            return aOpening ? a : b
        }
        let ra = folderCategoryRank(a.category)
        let rb = folderCategoryRank(b.category)
        if ra != rb {
            return ra < rb ? a : b
        }
        return sa >= sb ? a : b
    }

    /// Tags may surface incidental people/places; secondary folders require stronger proof they organize the note.
    private static func isEligibleSecondaryFolder(_ s: Scored, in analysis: Analysis) -> Bool {
        let ps = primaryScore(s, in: analysis)
        switch s.category {
        case .book:
            // Books are folder-only-when-primary: a cited-but-not-primary book never becomes a
            // secondary folder — it surfaces as a tag instead. Keep in sync with web.
            return false
        case .character, .place:
            let strongContext = s.inTitle || s.occurrences >= 3
            let floor = strongContext ? secondaryMinPrimaryScore : secondaryCharacterPlaceMinScore
            return ps >= floor
        case .life:
            let strongContext = s.inTitle || s.occurrences >= 3
            return strongContext && ps >= secondaryMinPrimaryScore
        default:
            // Tags surface every detected theme; folders require evidence the keyword is a real topic — title presence or a repeat in the body.
            let strongContext = s.inTitle || s.occurrences >= 2
            return strongContext && ps >= secondaryMinPrimaryScore
        }
    }

    private static func primaryScore(_ s: Scored, in analysis: Analysis) -> Double {
        var score = s.confidence
        switch s.category {
        case .spiritual, .biblical, .life:
            // Corroboration ladder: a single incidental mention of a broad/generic theme should not
            // outrank a recurring, note-defining topic. Recurrence earns the full boost.
            if s.occurrences <= 1 {
                score += 0.03
            } else if s.occurrences >= 3 {
                score += 0.12
            } else {
                score += 0.08
            }
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
        if keywordAppearsInOpening(s.name, in: analysis) {
            score = min(1.25, score + openingNarrativeFolderBoost)
        }
        if FolderKeywordContextGate.isRitualDescriptiveFolderMention(
            keywordName: s.name,
            title: analysis.title,
            body: analysis.body
        ) {
            score -= FolderKeywordContextGate.ritualDescriptiveFolderScorePenalty
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
        a("Salvation", .spiritual, 0.8, ["redemption", "deliverance", "salvation call"])
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
        a("Passover", .biblical, 0.85, ["passover lamb", "feast of passover", "pascha", "blood of the lamb"])
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
        // Curated study topics — broad survey themes so notes covering many people/places get a
        // thematic primary folder instead of the first proper noun. Keep in sync with web corpus.
        a("Women of the Bible", .biblical, 0.8, ["women", "woman", "women in the bible", "biblical women"])
        a("Fruit of the Spirit", .biblical, 0.8, ["fruits of the spirit"])
        a("Armor of God", .biblical, 0.8, ["armour of god", "full armor of god"])
        a("Names of God", .biblical, 0.8, ["name of god", "names of the lord"])
        a("The Beatitudes", .biblical, 0.8, ["beatitudes"])
        a("Ten Commandments", .biblical, 0.8, ["ten commandments", "decalogue"])
        // Life
        a("Family", .life, 0.7, ["relatives", "household"])
        a("Marriage", .life, 0.7, ["wedding", "spouse"])
        a("Parenting", .life, 0.7, ["childrearing", "raising children"])
        a("Friendship", .life, 0.7, ["companionship", "fellowship", "friendships"])
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
        a("Jesus", .character, 0.95, ["christ", "jesus christ", "lord jesus", "our lord", "savior", "messiah"])
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

    private static func match(_ row: Row, title: String, body: String, titleLower: String, contentLower: String) -> Scored? {
        let nameLower = row.name.lowercased()
        var found = false
        let conf = row.base
        var inTitle = false
        var frequency = 0
        let usePersonGate = row.category == .character
        let useLifeContextGate = row.category == .life || nameLower == "marriage"
        let useChurchAttendanceGate = nameLower == "church"

        for piece in [nameLower] + row.synonyms.map({ $0.lowercased() }) {
            let trimmedPiece = piece.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedPiece.isEmpty else { continue }

            let titleHits: Int
            let contentHits: Int
            if usePersonGate {
                titleHits = countPersonAwareNeedleMatches(trimmedPiece, in: title, keywordName: row.name)
                contentHits = countPersonAwareNeedleMatches(trimmedPiece, in: body, keywordName: row.name)
            } else if useLifeContextGate {
                titleHits = countLifeKeywordNeedleMatches(trimmedPiece, keywordName: row.name, in: titleLower)
                contentHits = countLifeKeywordNeedleMatches(trimmedPiece, keywordName: row.name, in: contentLower)
            } else if useChurchAttendanceGate {
                titleHits = countChurchKeywordNeedleMatches(trimmedPiece, keywordName: row.name, in: titleLower)
                contentHits = countChurchKeywordNeedleMatches(trimmedPiece, keywordName: row.name, in: contentLower)
            } else {
                titleHits = countBoundedNeedleMatches(trimmedPiece, in: titleLower)
                contentHits = countBoundedNeedleMatches(trimmedPiece, in: contentLower)
            }
            if titleHits > 0 {
                inTitle = true
                found = true
                frequency += titleHits
            }
            if contentHits > 0 {
                found = true
                frequency += contentHits
            }
        }

        guard found else { return nil }
        let titleBoost: Double = inTitle ? 0.2 : 0
        let frequencyBoost: Double = frequency > 1 ? min(0.5, Double(frequency - 1) * 0.1) : 0
        return Scored(
            name: row.name,
            category: row.category,
            confidence: min(1.0, conf + titleBoost + frequencyBoost),
            occurrences: max(1, frequency),
            inTitle: inTitle
        )
    }

    /// Church needles with attendance-venue guards (native `Church` keyword — web corpus omits it).
    private static func countChurchKeywordNeedleMatches(_ needleLower: String, keywordName: String, in textLower: String) -> Int {
        let words = needleLower.split(separator: " ").filter { !$0.isEmpty }.map(String.init)
        guard !words.isEmpty else { return 0 }
        let escaped = words.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "\\s+")
        let pattern = words.count == 1 ? "\\b\(escaped)\\b" : "\\b(?:\(escaped))\\b"
        guard let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return 0 }
        var count = 0
        let n = (textLower as NSString).length
        re.enumerateMatches(in: textLower, options: [], range: NSRange(location: 0, length: n)) { match, _, _ in
            guard let match else { return }
            if FolderKeywordContextGate.shouldSkipChurchAttendance(
                keywordName: keywordName,
                needle: needleLower,
                in: textLower,
                matchRange: match.range
            ) {
                return
            }
            count += 1
        }
        return count
    }

    /// Life-category needles with phrase-context guards (aligned with `life-keyword-context.ts`).
    private static func countLifeKeywordNeedleMatches(_ needleLower: String, keywordName: String, in textLower: String) -> Int {
        let words = needleLower.split(separator: " ").filter { !$0.isEmpty }.map(String.init)
        guard !words.isEmpty else { return 0 }
        let escaped = words.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "\\s+")
        let pattern = words.count == 1 ? "\\b\(escaped)\\b" : "\\b(?:\(escaped))\\b"
        guard let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return 0 }
        var count = 0
        let n = (textLower as NSString).length
        re.enumerateMatches(in: textLower, options: [], range: NSRange(location: 0, length: n)) { match, _, _ in
            guard let match else { return }
            if LifeKeywordContextGate.shouldSkip(keywordName: keywordName, needle: needleLower, in: textLower, matchRange: match.range) {
                return
            }
            count += 1
        }
        return count
    }

    /// Whole-word for a single token; phrase-boundary regex for multi-word needles (aligned with `bible-study-keywords.ts`).
    private static func countBoundedNeedleMatches(_ needleLower: String, in textLower: String) -> Int {
        let words = needleLower.split(separator: " ").filter { !$0.isEmpty }.map(String.init)
        guard !words.isEmpty else { return 0 }
        if words.count == 1 {
            return countWholeWordOccurrences(of: words[0], in: textLower)
        }
        let escaped = words.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "\\s+")
        guard let re = try? NSRegularExpression(pattern: "\\b(?:\(escaped))\\b", options: .caseInsensitive) else { return 0 }
        var count = 0
        let n = (textLower as NSString).length
        re.enumerateMatches(in: textLower, options: [], range: NSRange(location: 0, length: n)) { _, _, _ in
            count += 1
        }
        return count
    }

    /// Character / ambiguous book hits skip modern person-name mentions (Ps Luke, Luke Smith).
    private static func countPersonAwareNeedleMatches(_ needleLower: String, in text: String, keywordName: String? = nil) -> Int {
        let words = needleLower.split(separator: " ").filter { !$0.isEmpty }.map(String.init)
        guard !words.isEmpty else { return 0 }
        let textLower = text.lowercased()
        if words.count == 1 {
            return countPersonAwareSingleWordOccurrences(of: words[0], in: text, keywordName: keywordName, textLower: textLower)
        }
        let escaped = words.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "\\s+")
        guard let re = try? NSRegularExpression(pattern: "\\b(?:\(escaped))\\b", options: .caseInsensitive) else { return 0 }
        var count = 0
        let n = (text as NSString).length
        re.enumerateMatches(in: text, options: [], range: NSRange(location: 0, length: n)) { match, _, _ in
            guard let match, let swiftRange = Range(match.range, in: text) else { return }
            if PersonNameContextGate.shouldSkip(in: text, wordRange: swiftRange) { return }
            if let keywordName,
               ChristKeywordContextGate.shouldSkipJesusNeedle(
                   keywordName: keywordName,
                   needle: needleLower,
                   in: textLower,
                   matchRange: match.range
               ) {
                return
            }
            count += 1
        }
        return count
    }

    private static func countPersonAwareSingleWordOccurrences(
        of word: String,
        in text: String,
        keywordName: String? = nil,
        textLower: String? = nil
    ) -> Int {
        let lowered = textLower ?? text.lowercased()
        let escaped = NSRegularExpression.escapedPattern(for: word)
        guard let re = try? NSRegularExpression(pattern: "\\b\(escaped)\\b", options: .caseInsensitive) else { return 0 }
        var count = 0
        let n = (text as NSString).length
        re.enumerateMatches(in: text, options: [], range: NSRange(location: 0, length: n)) { match, _, _ in
            guard let match, let swiftRange = Range(match.range, in: text) else { return }
            if PersonNameContextGate.shouldSkip(in: text, wordRange: swiftRange) { return }
            if let keywordName,
               ChristKeywordContextGate.shouldSkipJesusNeedle(
                   keywordName: keywordName,
                   needle: word,
                   in: lowered,
                   matchRange: match.range
               ) {
                return
            }
            // A name inside a numbered Bible book (e.g. "Peter" in "1 Peter 2:9") is a scripture
            // reference, not the person — don't count it toward the character. The book itself is
            // detected separately via its full multi-word name.
            if isPartOfNumberedBook(word: word, in: text, wordRange: swiftRange) { return }
            count += 1
        }
        return count
    }

    /// Lowercased Bible-book names that begin with a number (e.g. "1 peter", "2 john").
    private static let numberedBookNamesLower: Set<String> = Set(
        bookNames.map { $0.lowercased() }.filter { $0.first?.isNumber == true }
    )

    /// True when a single-word person match (e.g. "Peter") is the tail of a numbered Bible-book
    /// reference (e.g. "1 Peter", "2 John") — so scripture citations are not counted as the person.
    private static func isPartOfNumberedBook(word: String, in text: String, wordRange: Range<String.Index>) -> Bool {
        let prefix = text[text.startIndex..<wordRange.lowerBound]
        guard let m = prefix.range(of: #"(\d+)\s+$"#, options: .regularExpression) else { return false }
        let number = prefix[m].trimmingCharacters(in: .whitespaces)
        return numberedBookNamesLower.contains("\(number) \(word)".lowercased())
    }

    private static func countWholeWordOccurrences(of word: String, in textLower: String) -> Int {
        let escaped = NSRegularExpression.escapedPattern(for: word)
        guard let re = try? NSRegularExpression(pattern: "\\b\(escaped)\\b", options: .caseInsensitive) else { return 0 }
        var count = 0
        let n = (textLower as NSString).length
        re.enumerateMatches(in: textLower, options: [], range: NSRange(location: 0, length: n)) { _, _, _ in
            count += 1
        }
        return count
    }

    /** Substring frequency (used only for multi-word bible book phrases in analyze). */
    private static func countOccurrences(of sub: String, in text: String) -> Int {
        guard !sub.isEmpty else { return 0 }
        return text.components(separatedBy: sub).count - 1
    }

    private static func matchBookWord(_ book: String, in textLower: String, originalText: String) -> Bool {
        let b = book.lowercased()
        if b.split(separator: " ").count > 1 {
            return textLower.contains(b)
        }
        return countPersonAwareSingleWordOccurrences(of: book, in: originalText) > 0
    }

    private static func tagsExcludingFolderMembership(
        _ tags: [String],
        note: Note
    ) -> [String] {
        tagsExcludingFolderMembership(
            tags,
            primaryLabel: note.primaryFolder,
            secondaryLabels: note.normalizedSecondaryFolderLabels()
        )
    }

    private static func tagsExcludingFolderMembership(
        _ tags: [String],
        primaryLabel: String?,
        secondaryLabels: [String]
    ) -> [String] {
        var folderLabels: [String] = []
        if let primary = normalizedFolderName(primaryLabel) {
            folderLabels.append(primary)
        }
        for s in secondaryLabels {
            guard let label = normalizedFolderName(s) else { continue }
            if folderLabels.contains(where: { $0.caseInsensitiveCompare(label) == .orderedSame }) { continue }
            folderLabels.append(label)
        }
        guard !folderLabels.isEmpty else { return tags }
        return tags.filter { tag in
            !folderLabels.contains(where: { overlaps(tag, $0) })
        }
    }

    // MARK: - Overlap (keep in sync with `src/utils/bible-study-concept-overlaps.ts`)

    private static func overlaps(_ a: String, _ b: String) -> Bool {
        let x = a.lowercased()
        let y = b.lowercased()
        if x == y { return true }
        if isBookVsNarrativeFolderPair(x, y) { return false }
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

    static func folderConceptOverlaps(_ a: String, _ b: String) -> Bool {
        overlaps(a, b)
    }

    static func isNonDefiningBookPrimary(title: String, body: String, primary: String) -> Bool {
        let analysis = analyze(title: title, body: body)
        guard let row = analysis.picked.first(where: {
            $0.category == .book && $0.name.caseInsensitiveCompare(primary) == .orderedSame
        }) else {
            return false
        }
        return !isBookDefining(row)
    }

    private static func isBookVsNarrativeFolderPair(_ a: String, _ b: String) -> Bool {
        let shorter = a.count <= b.count ? a : b
        let longer = a.count <= b.count ? b : a
        guard longer.hasPrefix("the ") else { return false }
        let stem = String(longer.dropFirst(4)).trimmingCharacters(in: .whitespacesAndNewlines)
        return !stem.isEmpty && shorter == stem
    }
}
