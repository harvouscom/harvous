import Foundation

// MARK: - URL references index — domain → URL → notes
//
// Mirrors the web `GET /api/spaces/:spaceId/references-index` response shape so the references
// sidebar mode can swap a server fetch for the local aggregator with no view changes when native
// note sync lands. Today the source of truth is local: walk each note's `body` plain text, run
// `NSDataDetector`, and aggregate matches.

/// One note that cites a given URL.
struct URLReferenceNoteRow: Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let updatedAt: Date
}

/// One distinct URL within a domain.
struct URLReferenceURLRow: Identifiable, Hashable, Sendable {
    let href: String
    let displayHost: String
    let noteCount: Int
    let notes: [URLReferenceNoteRow]

    var id: String { href }
    var title: String { displayHost }
}

/// One domain bucket — all URLs sharing the same host.
struct URLReferenceDomainRow: Identifiable, Hashable, Sendable {
    let domain: String
    /// Total URL pill occurrences across all notes in this domain (a note that cites the same href
    /// twice contributes 2). Mirrors web `referenceCount`.
    let referenceCount: Int
    /// Distinct notes citing any URL in this domain.
    let noteCount: Int
    let urls: [URLReferenceURLRow]

    var id: String { domain }
    var title: String { domain }
    var subtitle: String {
        "\(referenceCount) reference\(referenceCount == 1 ? "" : "s") · \(noteCount) note\(noteCount == 1 ? "" : "s")"
    }
}

enum URLReferencesLocalIndex {
    /// Domain-grouped index of every http(s) URL appearing in any note's body. Domains are sorted
    /// alphabetically; URLs within a domain are sorted by note count desc, then href asc.
    static func rows(from notes: [Note]) -> [URLReferenceDomainRow] {
        var notesPerURL: [String: [URLReferenceNoteRow]] = [:]
        var referenceCountPerURL: [String: Int] = [:]
        var notesPerDomain: [String: Set<UUID>] = [:]
        var referenceCountPerDomain: [String: Int] = [:]

        for note in notes {
            let hrefs = extractHrefs(in: note.body)
            guard !hrefs.isEmpty else { continue }

            // De-dupe per note for the "note count" tallies, but keep raw occurrences for
            // referenceCount totals.
            var seenInNote = Set<String>()
            for href in hrefs {
                referenceCountPerURL[href, default: 0] += 1
                guard let domain = domainForHref(href) else { continue }
                referenceCountPerDomain[domain, default: 0] += 1
                if !seenInNote.contains(href) {
                    seenInNote.insert(href)
                    let row = URLReferenceNoteRow(
                        id: note.id,
                        title: note.title,
                        updatedAt: note.updatedAt
                    )
                    notesPerURL[href, default: []].append(row)
                    notesPerDomain[domain, default: []].insert(note.id)
                }
            }
        }

        // Build URL rows, group by domain.
        var urlsByDomain: [String: [URLReferenceURLRow]] = [:]
        for (href, noteRows) in notesPerURL {
            guard let domain = domainForHref(href) else { continue }
            let sortedNotes = noteRows.sorted { $0.updatedAt > $1.updatedAt }
            let row = URLReferenceURLRow(
                href: href,
                displayHost: urlLinkPillDisplayHost(href),
                noteCount: noteRows.count,
                notes: sortedNotes
            )
            urlsByDomain[domain, default: []].append(row)
        }

        return urlsByDomain.keys.sorted().compactMap { domain in
            guard let urls = urlsByDomain[domain], !urls.isEmpty else { return nil }
            let orderedURLs = urls.sorted { a, b in
                if a.noteCount != b.noteCount { return a.noteCount > b.noteCount }
                return a.href.localizedCaseInsensitiveCompare(b.href) == .orderedAscending
            }
            return URLReferenceDomainRow(
                domain: domain,
                referenceCount: referenceCountPerDomain[domain] ?? 0,
                noteCount: notesPerDomain[domain]?.count ?? 0,
                urls: orderedURLs
            )
        }
    }

    /// URL rows for a single domain. Convenience wrapper used by the sidebar drill view.
    static func urls(forDomain domain: String, notes: [Note]) -> [URLReferenceURLRow] {
        rows(from: notes).first(where: { $0.domain == domain })?.urls ?? []
    }

    // MARK: - Filtering

    static func filtered(
        rows: [URLReferenceDomainRow],
        query: String
    ) -> [URLReferenceDomainRow] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rows }
        return rows
            .compactMap { row -> (URLReferenceDomainRow, Int)? in
                var score = 0
                if row.domain.localizedCaseInsensitiveContains(trimmed) { score += 6 }
                if row.domain.lowercased().hasPrefix(trimmed.lowercased()) { score += 3 }
                if row.urls.contains(where: { $0.href.localizedCaseInsensitiveContains(trimmed) }) { score += 2 }
                if row.urls.contains(where: { $0.notes.contains(where: { $0.title.localizedCaseInsensitiveContains(trimmed) }) }) {
                    score += 1
                }
                guard score > 0 else { return nil }
                return (row, score)
            }
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
                return lhs.0.domain.localizedCaseInsensitiveCompare(rhs.0.domain) == .orderedAscending
            }
            .map(\.0)
    }

    static func filteredURLs(
        rows: [URLReferenceURLRow],
        query: String
    ) -> [URLReferenceURLRow] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rows }
        return rows.filter {
            $0.href.localizedCaseInsensitiveContains(trimmed)
                || $0.notes.contains { $0.title.localizedCaseInsensitiveContains(trimmed) }
        }
    }

    // MARK: - URL extraction

    /// Returns every http(s) URL substring in `body` (in document order, duplicates kept).
    /// Mirrors the web `extractDomain` flow in `server/utils/build-space-references-index.ts`.
    static func extractHrefs(in body: String) -> [String] {
        guard !body.isEmpty else { return [] }
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        guard let detector else { return [] }
        let nsRange = NSRange(location: 0, length: (body as NSString).length)
        let matches = detector.matches(in: body, options: [], range: nsRange)
        return matches.compactMap { r -> String? in
            guard let url = r.url else { return nil }
            guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
            return url.absoluteString
        }
    }

    /// Lowercased host of `href`, stripping a leading `www.` so YouTube etc. group cleanly.
    static func domainForHref(_ href: String) -> String? {
        guard let url = URL(string: href), let host = url.host?.lowercased() else { return nil }
        if host.hasPrefix("www.") { return String(host.dropFirst(4)) }
        return host
    }
}

// MARK: - Note convenience

extension Note {
    /// True when this note's body contains the given href (case-sensitive — URLs are case-significant
    /// in their path component, even if hosts technically aren't).
    func noteBelongsToURLReference(_ href: String) -> Bool {
        URLReferencesLocalIndex.extractHrefs(in: body).contains(href)
    }
}
