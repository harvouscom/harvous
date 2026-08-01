import Foundation

/// Mirrors web `prototype-folder-auto-assign.ts` — content + passage subject enrichment for folders.
enum FolderSubjectEnrichment {
    private static let maxSecondaries = 3
    private static let maxPassageSubjects = 3

    // `let` (not `var`): loaded once from the bundle and never mutated. A `var`
    // here trips Swift 6's "nonisolated global shared mutable state" check even
    // though the dictionary is only ever read after init.
    private static let chapterSubjects: [String: [String: [String]]] = {
        guard let url = Bundle.main.url(forResource: "chapter-subjects", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([String: [String: [String]]].self, from: data) else {
            return [:]
        }
        return decoded
    }()

    static func enrich(
        primary: String?,
        secondaries: [String],
        title: String,
        body: String,
        allowPrimaryUpdate: Bool
    ) -> (primary: String?, secondaries: [String]) {
        let text = "\(title)\n\(body)".trimmingCharacters(in: .whitespacesAndNewlines)
        let contentSubs = SubjectTagCandidates.folderSubjectNames(title: title, body: body)
        let passageSubs = Array(passageSubjectNames(for: text).prefix(maxPassageSubjects))
        guard !contentSubs.isEmpty || !passageSubs.isEmpty else {
            return (primary, secondaries)
        }

        var nextPrimary = primary?.trimmingCharacters(in: .whitespacesAndNewlines)
        if allowPrimaryUpdate, nextPrimary?.isEmpty != false {
            nextPrimary = contentSubs.first ?? passageSubs.first ?? nextPrimary
        } else if allowPrimaryUpdate,
                  let current = nextPrimary,
                  BibleStudyTagSuggester.isNonDefiningBookPrimary(title: title, body: body, primary: current) {
            let narrativePassage = passageSubs.first(where: isNarrativeSubject)
            let contentTheme = contentSubs.first { $0.caseInsensitiveCompare(current) != .orderedSame }
            nextPrimary = narrativePassage ?? contentTheme ?? passageSubs.first ?? nextPrimary
        }

        let primaryRef = (nextPrimary ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var result: [String] = []
        var present = Set<String>()

        func add(_ name: String) {
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            let low = trimmed.lowercased()
            guard !low.isEmpty, low != primaryRef.lowercased(), !present.contains(low) else { return }
            if !primaryRef.isEmpty, BibleStudyTagSuggester.folderConceptOverlaps(trimmed, primaryRef) { return }
            if result.contains(where: { BibleStudyTagSuggester.folderConceptOverlaps($0, trimmed) }) { return }
            result.append(trimmed)
            present.insert(low)
        }

        for s in passageSubs { add(s) }
        for s in secondaries { add(s) }
        for s in contentSubs { add(s) }

        return (nextPrimary, Array(result.prefix(maxSecondaries)))
    }

    private static func passageSubjectNames(for text: String) -> [String] {
        var out: [String] = []
        var seenChapters = Set<String>()
        var seenSubjects = Set<String>()
        for ref in ScriptureDetector.uniqueDisplayRefs(in: text) {
            guard let parsed = ScriptureReferenceParser.parse(ref) else { continue }
            let book = ScriptureCanonicalBooks.titles[parsed.bookIndex]
            let chapterKey = "\(book)|\(parsed.chapter)"
            guard !seenChapters.contains(chapterKey) else { continue }
            seenChapters.insert(chapterKey)
            for subject in chapterSubjects[book]?[String(parsed.chapter)] ?? [] {
                let low = subject.lowercased()
                guard !seenSubjects.contains(low) else { continue }
                seenSubjects.insert(low)
                out.append(subject)
            }
        }
        return out
    }

    private static func isNarrativeSubject(_ name: String) -> Bool {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return n.hasPrefix("The ") || n == "Passover" || n == "Biblical Feasts"
    }
}
