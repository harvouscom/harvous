import Foundation

// MARK: - Easton's Bible Dictionary client
//
// Mirrors the web `useEastonsSlugIndex` + per-entry fetch pattern. Two endpoints:
//   GET /api/dictionary/eastons/index   → [{ slug, headword, category }]
//   GET /api/dictionary/eastons/:slug   → { slug, headword, category, body, seeAlso }
//
// Both are public-domain static data. The slug index is persisted to disk (see
// `EastonsSlugIndexDiskStore`) so cold launches can answer `hasEntry(forWord:)` before the
// network refresh resolves. Per-entry results are cached in memory only — the dataset is small
// and a session-scoped cache plus selection-time + ref-highlight prefetch covers the hot path.

struct EastonsSlugIndexEntry: Codable, Hashable, Sendable {
    let slug: String
    let headword: String
    /// Optional category: "person" | "place" | "thing" — used for icons in the dock and list.
    let category: String?

    /// Font Awesome asset name for this entry's category.
    var categoryIconAsset: String? { Self.categoryIconAsset(for: category) }

    /// Static overload so callers that only hold a raw category string can call without an instance.
    static func categoryIconAsset(for category: String?) -> String? {
        switch category {
        case "person": return "Harvous.Person"
        case "place":  return "Harvous.LocationDot"
        case "thing":  return "Harvous.Shapes"
        default:       return nil
        }
    }
}

struct EastonsDictionaryEntry: Codable, Hashable, Sendable {
    let slug: String
    let headword: String
    let category: String?
    let body: String
    let seeAlso: [String]
}

enum EastonsDictionaryError: Error, Sendable {
    case invalidURL
    case badResponse(Int)
    case notFound
    case decoding
    case transient
}

/// Singleton service. Use `loadIndexIfNeeded()` early in app launch (or first use) to warm the
/// slug index; `hasEntry(forWord:)` then returns synchronously. `fetchEntry(slug:)` is async.
@MainActor
final class EastonsDictionaryService: ObservableObject {
    static let shared = EastonsDictionaryService()

    /// Lowercased slug → display entry. Populated by `loadIndexIfNeeded`.
    @Published private(set) var slugIndex: [String: EastonsSlugIndexEntry] = [:]
    @Published private(set) var indexLoadState: LoadState = .idle

    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed
    }

    private var entryCache: [String: EastonsDictionaryEntry] = [:]
    private var inflightIndexTask: Task<Void, Never>?

    private init() {}

    // MARK: - Index

    /// Fetches the slug index once. Repeated calls are no-ops while a fetch is in flight or after
    /// success. On cold launch, hydrates from `EastonsSlugIndexDiskStore` before the network call
    /// resolves so `hasEntry(forWord:)` works immediately. A network failure that arrives *after*
    /// a disk hit leaves the state as `.loaded` rather than regressing to `.failed`.
    func loadIndexIfNeeded() {
        if indexLoadState == .loaded || indexLoadState == .loading { return }
        indexLoadState = .loading
        inflightIndexTask?.cancel()
        inflightIndexTask = Task { [weak self] in
            guard let self else { return }
            if self.slugIndex.isEmpty, let cached = await EastonsSlugIndexDiskStore.shared.read() {
                var map: [String: EastonsSlugIndexEntry] = [:]
                map.reserveCapacity(cached.count)
                for e in cached { map[e.slug.lowercased()] = e }
                self.slugIndex = map
                self.indexLoadState = .loaded
            }
            do {
                let entries = try await Self.fetchIndex()
                var map: [String: EastonsSlugIndexEntry] = [:]
                map.reserveCapacity(entries.count)
                for e in entries { map[e.slug.lowercased()] = e }
                self.slugIndex = map
                self.indexLoadState = .loaded
                await EastonsSlugIndexDiskStore.shared.write(entries)
            } catch {
                if self.slugIndex.isEmpty {
                    self.indexLoadState = .failed
                }
            }
            self.inflightIndexTask = nil
        }
    }

    private struct IndexResponse: Decodable {
        let entries: [EastonsSlugIndexEntry]
    }

    private static func fetchIndex() async throws -> [EastonsSlugIndexEntry] {
        guard let url = URL(string: HarvousAPI.baseURL + "/api/dictionary/eastons/index") else {
            throw EastonsDictionaryError.invalidURL
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw EastonsDictionaryError.transient }
        guard (200..<300).contains(http.statusCode) else {
            throw EastonsDictionaryError.badResponse(http.statusCode)
        }
        do {
            return try JSONDecoder().decode(IndexResponse.self, from: data).entries
        } catch {
            throw EastonsDictionaryError.decoding
        }
    }

    // MARK: - Lookup

    /// Synchronous "does this single word have an entry?" probe used by the selection action bar
    /// to decide whether to show the Look up button. Tries: exact lowercased, then strip-trailing-s.
    func hasEntry(forWord word: String) -> Bool {
        return matchedSlug(forWord: word) != nil
    }

    /// Returns the best-matching slug for `word`, or `nil`. Mirrors the web lemma fallback chain
    /// (exact → drop trailing `'s` → drop trailing `s` → drop trailing `es`).
    func matchedSlug(forWord word: String) -> String? {
        guard indexLoadState == .loaded else { return nil }
        let normalized = Self.normalizeWord(word)
        guard !normalized.isEmpty else { return nil }
        for candidate in Self.slugCandidates(for: normalized) {
            if slugIndex[candidate] != nil { return candidate }
        }
        return nil
    }

    /// Returns the matched index entry (slug + headword + category) for `word`, or `nil`.
    /// Used by the inline reference-suggestion painter to filter by category (person/place).
    func matchedEntry(forWord word: String) -> EastonsSlugIndexEntry? {
        guard let slug = matchedSlug(forWord: word) else { return nil }
        return slugIndex[slug]
    }

    /// Strip surrounding punctuation, lowercase. Mirrors `useEastonsSlugIndex.normalize`.
    static func normalizeWord(_ word: String) -> String {
        let trimmed = word.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        return trimmed.lowercased()
    }

    /// Lemma fallbacks. Order matters — earlier candidates win.
    static func slugCandidates(for normalized: String) -> [String] {
        var out: [String] = [normalized]
        if normalized.hasSuffix("'s") || normalized.hasSuffix("\u{2019}s") {
            out.append(String(normalized.dropLast(2)))
        }
        if normalized.hasSuffix("es"), normalized.count > 3 {
            out.append(String(normalized.dropLast(2)))
        }
        if normalized.hasSuffix("s"), normalized.count > 2 {
            out.append(String(normalized.dropLast(1)))
        }
        return out
    }

    // MARK: - Entry fetch

    /// Fetches the full entry for `slug`. In-memory cache shortcuts repeat lookups.
    func fetchEntry(slug: String) async throws -> EastonsDictionaryEntry {
        let key = slug.lowercased()
        if let cached = entryCache[key] { return cached }
        let entry = try await Self.fetchEntryRequest(slug: key)
        entryCache[key] = entry
        return entry
    }

    // MARK: - Prefetch

    /// Fire-and-forget background fetch for a single slug. No-op if already cached or in-flight is
    /// already pending — the in-memory `entryCache` write at the end of `fetchEntry` deduplicates.
    /// Used by the editor to warm the cache as soon as a single-word selection has a slug match,
    /// so by the time the user taps Look up the entry renders without a spinner.
    func prefetchEntry(slug: String) {
        let key = slug.lowercased()
        guard !key.isEmpty, entryCache[key] == nil else { return }
        Task(priority: .utility) { [weak self] in
            _ = try? await self?.fetchEntry(slug: key)
        }
    }

    /// Bounded-concurrency prefetch for a batch of slugs. Mirrors `ScripturePassageCache.prefetchDistinctPairs`
    /// (default 3 concurrent). Callers resolve `matchedSlug(forWord:)` themselves before calling so
    /// non-matches don't enter the pipeline.
    func prefetchEntries(slugs: [String], maxConcurrency: Int = 3) async {
        let unique = Array(Set(slugs.map { $0.lowercased() })).filter { !$0.isEmpty && entryCache[$0] == nil }
        guard !unique.isEmpty else { return }
        let bound = max(1, min(maxConcurrency, unique.count))
        await withTaskGroup(of: Void.self) { group in
            var iterator = unique.makeIterator()
            for _ in 0..<bound {
                guard let slug = iterator.next() else { break }
                group.addTask { [weak self] in
                    _ = try? await self?.fetchEntry(slug: slug)
                }
            }
            while await group.next() != nil {
                if let slug = iterator.next() {
                    group.addTask { [weak self] in
                        _ = try? await self?.fetchEntry(slug: slug)
                    }
                }
            }
        }
    }

    private static func fetchEntryRequest(slug: String) async throws -> EastonsDictionaryEntry {
        let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug
        guard let url = URL(string: HarvousAPI.baseURL + "/api/dictionary/eastons/" + encoded) else {
            throw EastonsDictionaryError.invalidURL
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw EastonsDictionaryError.transient }
        if http.statusCode == 404 { throw EastonsDictionaryError.notFound }
        guard (200..<300).contains(http.statusCode) else {
            throw EastonsDictionaryError.badResponse(http.statusCode)
        }
        do {
            return try JSONDecoder().decode(EastonsDictionaryEntry.self, from: data)
        } catch {
            throw EastonsDictionaryError.decoding
        }
    }
}
