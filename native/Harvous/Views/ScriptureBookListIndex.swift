import Foundation

/// One row in the Scripture book index (macOS sidebar + iOS hub).
struct ScriptureBookRow: Identifiable, Hashable, Sendable {
    let bookIndex: Int
    /// Distinct notes that cite this book (via any parsed reference).
    let noteCount: Int
    /// Total parsed `detectedRefs` entries in this book (a note with two John refs counts twice).
    let referenceCount: Int

    var id: Int { bookIndex }

    var title: String {
        guard bookIndex >= 0, bookIndex < ScriptureCanonicalBooks.titles.count else { return "Scripture" }
        return ScriptureCanonicalBooks.titles[bookIndex]
    }

    /// Subtitle for `FolderFeedRow` on the Scripture book list.
    var bookListSubtitle: String {
        "\(referenceCount) reference\(referenceCount == 1 ? "" : "s") · \(noteCount) note\(noteCount == 1 ? "" : "s")"
    }
}

/// One distinct passage within a book (canonical chapter/verse range), with note count.
struct ScriptureReferenceRow: Identifiable, Hashable, Sendable {
    let passage: ParsedScriptureFields
    let noteCount: Int

    var id: String {
        ScriptureReferenceParser.format(
            bookIndex: passage.bookIndex,
            chapter: passage.chapter,
            verseStart: passage.verseStart,
            verseEnd: passage.verseEnd
        )
    }

    var title: String { id }
}

enum ScriptureBookListIndex {
    /// Buckets notes by canonical Bible book derived from parsed `detectedRefs`. Books appear in canonical order.
    static func rows(from notesInActiveSpace: [Note]) -> [ScriptureBookRow] {
        var noteIdsPerBook: [Int: Set<UUID>] = [:]
        var referenceCountPerBook: [Int: Int] = [:]
        for note in notesInActiveSpace {
            for ref in note.detectedRefs {
                guard let p = ScriptureReferenceParser.parse(ref) else { continue }
                let idx = p.bookIndex
                referenceCountPerBook[idx, default: 0] += 1
                noteIdsPerBook[idx, default: []].insert(note.id)
            }
        }
        return noteIdsPerBook.keys.sorted().compactMap { idx in
            guard let ids = noteIdsPerBook[idx], !ids.isEmpty else { return nil }
            return ScriptureBookRow(
                bookIndex: idx,
                noteCount: ids.count,
                referenceCount: referenceCountPerBook[idx] ?? 0
            )
        }
    }

    /// Filter rows by book title and by notes in each book (titles, body, tags, refs) — mirrors folder search.
    static func filtered(
        rows: [ScriptureBookRow],
        query: String,
        notesForBucketMatching: [Note]
    ) -> [ScriptureBookRow] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rows }
        return rows
            .compactMap { row -> (ScriptureBookRow, Int)? in
                let bucketNotes = notesForBucketMatching.filter { $0.noteBelongsToScriptureBook(row.bookIndex) }

                var score = 0
                if row.title.localizedCaseInsensitiveContains(trimmed) { score += 6 }
                if row.title.lowercased().hasPrefix(trimmed.lowercased()) { score += 3 }

                if bucketNotes.contains(where: { $0.title.localizedCaseInsensitiveContains(trimmed) }) { score += 2 }
                if bucketNotes.contains(where: { $0.body.localizedCaseInsensitiveContains(trimmed) }) { score += 1 }
                if bucketNotes.contains(where: { $0.tags.contains(where: { $0.localizedCaseInsensitiveContains(trimmed) }) }) {
                    score += 1
                }
                if bucketNotes.contains(where: { $0.detectedRefs.contains(where: { $0.localizedCaseInsensitiveContains(trimmed) }) }) {
                    score += 1
                }

                guard score > 0 else { return nil }
                return (row, score)
            }
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
                return lhs.0.title.localizedCaseInsensitiveCompare(rhs.0.title) == .orderedAscending
            }
            .map(\.0)
    }

    /// Distinct parsed passages for `bookIndex`, ordered by chapter then verses.
    static func referenceRows(bookIndex: Int, notesInActiveSpace: [Note]) -> [ScriptureReferenceRow] {
        var notesPerPassage: [ParsedScriptureFields: Set<UUID>] = [:]
        for note in notesInActiveSpace {
            for ref in note.detectedRefs {
                guard let p = ScriptureReferenceParser.parse(ref), p.bookIndex == bookIndex else { continue }
                notesPerPassage[p, default: []].insert(note.id)
            }
        }
        let sortedKeys = notesPerPassage.keys.sorted { a, b in
            if a.chapter != b.chapter { return a.chapter < b.chapter }
            if a.verseStart != b.verseStart { return a.verseStart < b.verseStart }
            let ae = a.verseEnd ?? a.verseStart
            let be = b.verseEnd ?? b.verseStart
            return ae < be
        }
        return sortedKeys.compactMap { key in
            guard let ids = notesPerPassage[key], !ids.isEmpty else { return nil }
            return ScriptureReferenceRow(passage: key, noteCount: ids.count)
        }
    }

    /// Filter passage rows by display string and by notes that cite that passage.
    static func filteredReferenceRows(
        rows: [ScriptureReferenceRow],
        query: String,
        notesForBucketMatching: [Note]
    ) -> [ScriptureReferenceRow] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rows }
        return rows
            .compactMap { row -> (ScriptureReferenceRow, Int)? in
                let bucketNotes = notesForBucketMatching.filter { $0.noteBelongsToScripturePassage(row.passage) }

                var score = 0
                if row.title.localizedCaseInsensitiveContains(trimmed) { score += 6 }
                if row.title.lowercased().hasPrefix(trimmed.lowercased()) { score += 3 }

                if bucketNotes.contains(where: { $0.title.localizedCaseInsensitiveContains(trimmed) }) { score += 2 }
                if bucketNotes.contains(where: { $0.body.localizedCaseInsensitiveContains(trimmed) }) { score += 1 }
                if bucketNotes.contains(where: { $0.tags.contains(where: { $0.localizedCaseInsensitiveContains(trimmed) }) }) {
                    score += 1
                }
                if bucketNotes.contains(where: { $0.detectedRefs.contains(where: { $0.localizedCaseInsensitiveContains(trimmed) }) }) {
                    score += 1
                }

                guard score > 0 else { return nil }
                return (row, score)
            }
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
                return lhs.0.title.localizedCaseInsensitiveCompare(rhs.0.title) == .orderedAscending
            }
            .map(\.0)
    }
}
