import Foundation
import os

/// Errors surfaced by ``HarvousAPIClient``. Callers should treat ``unauthorized`` as
/// "kick back to the sign-in gate" and everything else as toast-worthy.
enum HarvousAPIError: Error, LocalizedError {
    case notSignedIn
    case unauthorized
    case http(status: Int, message: String?)
    case transport(Error)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .notSignedIn:        return "Not signed in."
        case .unauthorized:       return "Your session expired. Please sign in again."
        case .http(let s, let m): return m ?? "Request failed (\(s))."
        case .transport(let e):   return e.localizedDescription
        case .decoding(let e):    return "Could not read server response: \(e.localizedDescription)"
        }
    }

    /// A failure the same payload will keep hitting no matter how many times we
    /// retry it — i.e. a 4xx validation/permission rejection (e.g. "Content must
    /// be 500,000 characters or less"). The sync flush must give up on these and
    /// stop the retry loop, rather than re-sending the doomed body every cycle.
    /// 408 (timeout) and 429 (rate limited) are excluded — those are transient.
    var isPermanentClientError: Bool {
        switch self {
        case .http(let status, _):
            return (400..<500).contains(status) && status != 408 && status != 429
        default:
            return false
        }
    }
}

/// Skips localhost / LAN dev API probes after transport failures so a down
/// `npm run dev` server doesn't spam `nw_socket` logs on every sync cycle.
/// Shared by ``HarvousAPIClient`` and ``VotdService``.
actor LocalDevAPIGate {
    static let shared = LocalDevAPIGate()

    private static let cooldownSeconds: TimeInterval = 60
    private static let failureThreshold = 1

    private var consecutiveFailures = 0
    private var cooldownUntil: Date?
    private var loggedTripThisCooldown = false

    /// True while the breaker is suppressing localhost probes (writes skip entirely;
    /// GETs fall back to production). Does not mutate gate state.
    func isInCooldown() -> Bool {
        guard let until = cooldownUntil else { return false }
        return Date() < until
    }

    func shouldTryLocalhost() -> Bool {
        if let until = cooldownUntil {
            if Date() < until { return false }
            cooldownUntil = nil
            consecutiveFailures = 0
        }
        return true
    }

    /// Returns `true` when the breaker just opened (caller should log once).
    func recordLocalhostFailure() -> Bool {
        consecutiveFailures += 1
        guard consecutiveFailures >= Self.failureThreshold else { return false }
        if cooldownUntil == nil || Date() >= cooldownUntil! {
            cooldownUntil = Date().addingTimeInterval(Self.cooldownSeconds)
            let shouldLog = !loggedTripThisCooldown
            loggedTripThisCooldown = true
            return shouldLog
        }
        return false
    }

    func recordLocalhostSuccess() {
        consecutiveFailures = 0
        cooldownUntil = nil
        loggedTripThisCooldown = false
    }
}

/// Authenticated HTTP client for the Harvous Hono backend.
///
/// Every call attaches a fresh Clerk JWT in the `Authorization` header. The
/// backend's `requireAuth` middleware (server/middleware/auth.ts) accepts the
/// same JWT it does for the SPA's cookie-based flow, so we get the existing
/// permission checks for free.
@MainActor
final class HarvousAPIClient {
    static let shared = HarvousAPIClient()

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    /// Whether the configured base URL points at a local dev server (localhost / LAN).
    /// Release builds always return `false`.
    var isLocalDevBase: Bool { Self.isLocalDevURL(baseURL) }

    init(
        baseURL: URL = HarvousEnvironment.apiBaseURL,
        session: URLSession? = nil
    ) {
        self.baseURL = baseURL
        if let session {
            self.session = session
        } else {
            // Bound transport waits so a stalled connection can't hang sync/UI
            // indefinitely; transient failures are retried by `request` below.
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 20
            config.timeoutIntervalForResource = 60
            self.session = URLSession(configuration: config)
        }
        self.decoder = JSONDecoder()
        // Server returns ISO-8601 strings (see server/db/dates.ts → nowISO()).
        self.decoder.dateDecodingStrategy = .iso8601
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Convenience verbs

    func get<R: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> R {
        try await request(method: "GET", path: path, query: query, body: Optional<Empty>.none)
    }

    func post<B: Encodable, R: Decodable>(_ path: String, body: B) async throws -> R {
        try await request(method: "POST", path: path, query: [:], body: body)
    }

    func patch<B: Encodable, R: Decodable>(_ path: String, body: B) async throws -> R {
        try await request(method: "PATCH", path: path, query: [:], body: body)
    }

    func put<B: Encodable, R: Decodable>(_ path: String, body: B) async throws -> R {
        try await request(method: "PUT", path: path, query: [:], body: body)
    }

    func delete<R: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> R {
        try await request(method: "DELETE", path: path, query: query, body: Optional<Empty>.none)
    }

    func delete<B: Encodable, R: Decodable>(_ path: String, body: B, query: [String: String] = [:]) async throws -> R {
        try await request(method: "DELETE", path: path, query: query, body: body)
    }

    // MARK: - Share

    /// Three actions the server understands for the share endpoint.
    /// Mirrors `server/routes/notes.ts:1627` — `'enable' | 'disable' | 'refresh'`.
    enum ShareAction: String, Codable {
        case enable, disable, refresh
    }

    /// Toggle or rotate a note's share link. Wraps `POST /api/notes/:id/share`.
    /// Returns the new `shareToken` (nil after `.disable`) and the canonical
    /// `shareUrl` the popover should display.
    func shareNote(serverNoteId: String, action: ShareAction) async throws -> APIShareNoteResponse {
        struct Body: Encodable { let action: String }
        return try await post(
            "/api/notes/\(serverNoteId)/share",
            body: Body(action: action.rawValue)
        )
    }

    /// Shared notes/threads list for Settings → Sharing. Wraps `GET /api/profile/my-sharing`.
    func getMySharing() async throws -> APIMySharingResponse {
        try await get("/api/profile/my-sharing")
    }

    /// Owned shared spaces for Settings → Sharing. Wraps `GET /api/profile/my-shared-spaces`.
    func getMySharedSpaces() async throws -> APIMySharedSpacesResponse {
        try await get("/api/profile/my-shared-spaces")
    }

    // MARK: - Profile / church

    /// Fetch the user's server profile (name, color, email, church fields, lock-PIN
    /// flag, default translation). Wraps `GET /api/user/get-profile`.
    func getProfile() async throws -> APIUserProfile {
        try await get("/api/user/get-profile")
    }

    /// Persist church details to the server. Wraps `POST /api/user/update-church`.
    /// Empty strings are sent as `nil` so the server clears the field.
    func updateChurch(
        name: String?,
        city: String?,
        state: String?,
        country: String?
    ) async throws -> APIUpdateChurchResponse {
        struct Body: Encodable {
            let churchName: String?
            let churchCity: String?
            let churchState: String?
            let churchCountry: String?
        }
        func clean(_ s: String?) -> String? {
            let t = s?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return t.isEmpty ? nil : t
        }
        return try await post(
            "/api/user/update-church",
            body: Body(
                churchName: clean(name),
                churchCity: clean(city),
                churchState: clean(state),
                churchCountry: clean(country)
            )
        )
    }

    // MARK: - My data (export / clear / delete)

    enum ExportFormat: String {
        case markdown = "markdown"
        case csvThreads = "csv-threads"
        var fileExtension: String { self == .markdown ? "md" : "csv" }
    }

    /// Download a full account export. Returns the raw file bytes (the server sends
    /// text/markdown or text/csv with a `Content-Disposition` filename) plus a
    /// suggested filename. Wraps `GET /api/user/export?format=…`.
    func exportData(format: ExportFormat) async throws -> (data: Data, suggestedFilename: String) {
        guard let token = await HarvousClerkBridge.shared.bearerToken() else {
            throw HarvousAPIError.notSignedIn
        }
        var components = URLComponents(
            url: baseURL.appendingPathComponent("/api/user/export"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "format", value: format.rawValue)]
        guard let url = components?.url else {
            throw HarvousAPIError.http(status: -1, message: "Invalid export URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw HarvousAPIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw HarvousAPIError.http(status: -1, message: "No HTTP response")
        }
        if http.statusCode == 401 { throw HarvousAPIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            throw HarvousAPIError.http(status: http.statusCode, message: "Export failed")
        }
        let day = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
        return (data, "harvous-export-\(day).\(format.fileExtension)")
    }

    /// Wipe all server notes/folders/highlights (keeps the account).
    /// Wraps `DELETE /api/user/clear-data`.
    func clearData() async throws {
        let _: APIBasicResponse = try await delete("/api/user/clear-data")
    }

    /// Permanently delete the account and all server data (also removes the Clerk user).
    /// Wraps `DELETE /api/user/delete-account`.
    func deleteAccountData() async throws {
        let _: APIBasicResponse = try await delete("/api/user/delete-account")
    }

    // MARK: - Core

    private func request<B: Encodable, R: Decodable>(
        method: String,
        path: String,
        query: [String: String],
        body: B?
    ) async throws -> R {
        let data = try await requestData(method: method, path: path, query: query, body: body)
        return try Self.decode(data, as: R.self, method: method, path: path)
    }

    /// Like `request`, but runs the JSON decode off the main actor. Used for the
    /// large bootstrap / changes payloads so first-sync decode doesn't hitch the UI.
    /// `R` is constrained to `Sendable` so the decoded value can cross back safely.
    func getDecodedOffMain<R: Decodable & Sendable>(
        _ path: String,
        query: [String: String] = [:]
    ) async throws -> R {
        let data = try await requestData(method: "GET", path: path, query: query, body: Optional<Empty>.none)
        return try await Task.detached(priority: .userInitiated) {
            try Self.decode(data, as: R.self, method: "GET", path: path)
        }.value
    }

    /// Auth + URL build + transport (with GET retry) + HTTP status handling.
    /// Returns the validated response body bytes for the caller to decode.
    private func requestData<B: Encodable>(
        method: String,
        path: String,
        query: [String: String],
        body: B?
    ) async throws -> Data {
        guard let token = await HarvousClerkBridge.shared.bearerToken() else {
            throw HarvousAPIError.notSignedIn
        }

        let encodedBody: Data?
        if let body {
            do {
                encodedBody = try encoder.encode(body)
            } catch {
                throw HarvousAPIError.transport(error)
            }
        } else {
            encodedBody = nil
        }

        let origins = await Self.requestOrigins(for: method, configuredBase: baseURL)
        if origins.isEmpty {
            throw HarvousAPIError.transport(URLError(.cannotConnectToHost))
        }
        let isIdempotent = method == "GET"
        var lastTransportError: Error?

        for (index, origin) in origins.enumerated() {
            let isLastOrigin = index == origins.count - 1
            let isLocalOrigin = Self.isLocalDevURL(origin)

            guard var components = URLComponents(
                url: origin.appendingPathComponent(path),
                resolvingAgainstBaseURL: false
            ) else { continue }
            if !query.isEmpty {
                components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
            }
            guard let url = components.url else {
                throw HarvousAPIError.http(status: -1, message: "Invalid URL: \(path)")
            }

            var req = URLRequest(url: url)
            req.httpMethod = method
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            if let encodedBody {
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = encodedBody
            }
            if isLocalOrigin {
                req.timeoutInterval = 2.5
            }

            // Single retry only on the final origin for idempotent GETs.
            let maxAttempts = (isIdempotent && isLastOrigin) ? 2 : 1

            do {
                let (data, response) = try await Self.performWithRetry(
                    session: session,
                    request: req,
                    maxAttempts: maxAttempts
                )
                if isLocalOrigin {
                    await LocalDevAPIGate.shared.recordLocalhostSuccess()
                }

                guard let http = response as? HTTPURLResponse else {
                    throw HarvousAPIError.http(status: -1, message: "No HTTP response")
                }

                if http.statusCode == 401 {
                    throw HarvousAPIError.unauthorized
                }
                guard (200..<300).contains(http.statusCode) else {
                    let message = extractServerMessage(from: data)
                    Logger.app.error("HarvousAPIClient \(method) \(path) → \(http.statusCode): \(message ?? "(no body)", privacy: .public)")
                    throw HarvousAPIError.http(status: http.statusCode, message: message)
                }

                return data
            } catch let apiErr as HarvousAPIError {
                throw apiErr
            } catch {
                lastTransportError = error
                if isLocalOrigin {
                    if await LocalDevAPIGate.shared.recordLocalhostFailure() {
                        Logger.app.info("Local dev API unreachable; skipping localhost for 60s (GETs fall back to production).")
                    }
                    if !isLastOrigin { continue }
                }
                if isLastOrigin {
                    throw HarvousAPIError.transport(error)
                }
            }
        }

        throw HarvousAPIError.transport(lastTransportError ?? URLError(.unknown))
    }

    /// Origins to try for a request. DEBUG GETs try local dev first (when the gate
    /// allows), then production. Writes stay on local dev only — no prod fallback.
    private static func requestOrigins(for method: String, configuredBase: URL) async -> [URL] {
        #if DEBUG
        let prodURL = URL(string: HarvousAPI.baseURL)!
        let isLocal = isLocalDevURL(configuredBase)

        if method == "GET" {
            var origins: [URL] = []
            if isLocal, await LocalDevAPIGate.shared.shouldTryLocalhost() {
                origins.append(configuredBase)
            }
            if !origins.contains(where: { $0.host == prodURL.host }) {
                origins.append(prodURL)
            }
            return origins.isEmpty ? [configuredBase] : origins
        }

        if isLocal, !(await LocalDevAPIGate.shared.shouldTryLocalhost()) {
            return []
        }
        return [configuredBase]
        #else
        return [configuredBase]
        #endif
    }

    /// Whether a URL points at a local dev server (localhost or LAN IP).
    private nonisolated static func isLocalDevURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        if host == "localhost" || host == "127.0.0.1" { return true }
        if host.hasPrefix("192.168.") || host.hasPrefix("10.") { return true }
        if host.hasSuffix(".local") { return true }
        return false
    }

    /// Decodes a validated response body, logging decode failures with context.
    /// `nonisolated` so it can run on the main actor or a background executor.
    private nonisolated static func decode<R: Decodable>(
        _ data: Data,
        as type: R.Type,
        method: String,
        path: String
    ) throws -> R {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            return try decoder.decode(R.self, from: data)
        } catch let decodingError as DecodingError {
            switch decodingError {
            case .keyNotFound(let key, let context):
                Logger.app.error("Decode keyNotFound: '\(key.stringValue, privacy: .public)' at path: \(context.codingPath.map(\.stringValue).joined(separator: "."), privacy: .public)")
            case .typeMismatch(let type, let context):
                Logger.app.error("Decode typeMismatch: expected \(String(describing: type), privacy: .public) at path: \(context.codingPath.map(\.stringValue).joined(separator: "."), privacy: .public)")
            case .valueNotFound(let type, let context):
                Logger.app.error("Decode valueNotFound: \(String(describing: type), privacy: .public) at path: \(context.codingPath.map(\.stringValue).joined(separator: "."), privacy: .public)")
            case .dataCorrupted(let context):
                Logger.app.error("Decode dataCorrupted at path: \(context.codingPath.map(\.stringValue).joined(separator: "."), privacy: .public) — \(context.debugDescription, privacy: .public)")
            @unknown default:
                Logger.app.error("Decode unknown error: \(decodingError.localizedDescription, privacy: .public)")
            }
            throw HarvousAPIError.decoding(decodingError)
        } catch {
            throw HarvousAPIError.decoding(error)
        }
    }

    /// Performs the request, retrying transient transport failures with a short
    /// backoff. `nonisolated` so the network wait/backoff doesn't pin the main actor.
    /// Only call with `maxAttempts > 1` for idempotent requests (GET).
    private nonisolated static func performWithRetry(
        session: URLSession,
        request: URLRequest,
        maxAttempts: Int
    ) async throws -> (Data, URLResponse) {
        var attempt = 0
        while true {
            attempt += 1
            do {
                return try await session.data(for: request)
            } catch {
                let isLastAttempt = attempt >= maxAttempts
                let retryable = isRetryableTransportError(error)
                if isLastAttempt || !retryable {
                    throw error
                }
                // Single backoff before the one allowed retry on the final origin.
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
        }
    }

    /// Whether a transport failure is worth retrying (brief blips only).
    /// Connection refused / offline are not retried — they multiply socket logs.
    private nonisolated static func isRetryableTransportError(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .timedOut,
             .networkConnectionLost,
             .resourceUnavailable:
            return true
        default:
            return false
        }
    }

    private func extractServerMessage(from data: Data) -> String? {
        struct ErrorEnvelope: Decodable { let error: String? }
        if let env = try? decoder.decode(ErrorEnvelope.self, from: data) {
            return env.error
        }
        return String(data: data, encoding: .utf8)
    }
}

private struct Empty: Codable {}

// MARK: - Starter DTOs
//
// Names mirror the server's `mapStudyRow` etc. (server/routes/study-threads.ts,
// server/routes/spaces.ts). Add more fields/types as later sync phases need
// them — keep them in this file so the API surface lives in one place.

struct APISpace: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let title: String?
    let createdAt: String?
    let updatedAt: String?

    /// Server returns `title`; legacy client code expects `name`.
    var displayName: String? { name ?? title }
}

struct APIListSpacesResponse: Codable {
    let success: Bool?
    let spaces: [APISpace]
}

struct APINote: Codable, Identifiable, Sendable {
    let id: String
    let spaceId: String?
    let title: String?
    let content: String?
    let updatedAt: String?
    let createdAt: String?
    let isPublic: Bool?
    let shareToken: String?
    let contentEncrypted: Bool?
    /// Note-level pin (distinct from `collectionPinned`, which locks the folder).
    let isPinned: Bool?
    // Folder / collection fields (present in bootstrap and changes responses)
    let primaryCollection: String?
    let secondaryCollections: [String]?
    let collectionPinned: Bool?
    let collectionUserOverride: Bool?
    // Sync metadata
    let simpleNoteId: Int?
    let noteType: String?
    let addedBy: String?
}

struct APIListNotesResponse: Codable {
    let success: Bool?
    let notes: [APINote]
}

// MARK: - Bootstrap / delta sync DTOs

struct APIUserMetadata: Codable, Sendable {
    let highestSimpleNoteId: Int?
    let reservedSimpleNoteIdRange: APISimpleNoteIdRange?
}

struct APISimpleNoteIdRange: Codable, Sendable {
    let start: Int
    let end: Int
}

struct APINoteConnection: Codable, Identifiable, Sendable {
    let id: String
    let fromNoteId: String
    let toNoteId: String
    let spaceId: String?
    let createdAt: String?
}

/// Full payload from `GET /api/sync/bootstrap`.
struct APIBootstrapResponse: Codable, Sendable {
    let cursor: String
    /// When true, only the newest note page was returned; page via `/api/sync/changes` until `hasMore` is false.
    let notesTruncated: Bool?
    let spaces: [APISpace]
    let notes: [APINote]
    let noteConnections: [APINoteConnection]?
    let studyThreadEntries: [APIStudyThreadEntry]?
    let deletedNoteIds: [String]?
    let deletedStudyThreadIds: [String]?
    let deletedThreadIds: [String]?
    let deletedNoteConnectionIds: [String]?
    let userMetadata: APIUserMetadata?
}

/// Incremental payload from `GET /api/sync/changes?since=<cursor>`.
struct APIChangesResponse: Codable, Sendable {
    let cursor: String
    let hasChanges: Bool
    /// When true, more note rows exist for this delta; call again with the returned `cursor`.
    let hasMore: Bool?
    let spaces: [APISpace]
    let notes: [APINote]
    let noteConnections: [APINoteConnection]?
    let studyThreadEntries: [APIStudyThreadEntry]?
    let deletedNoteIds: [String]?
    let deletedStudyThreadIds: [String]?
    let deletedThreadIds: [String]?
    let deletedNoteConnectionIds: [String]?
    let userMetadata: APIUserMetadata?
}

struct APIStudyThreadEntry: Codable, Identifiable, Sendable {
    let id: String
    let userId: String?
    let parentNoteId: String
    let spaceId: String?
    let entryKind: String?
    let highlightAccentRaw: String?
    let sourceSnippet: String?
    let focusTitle: String?
    let notesBody: String?
    let miniNoteBody: String?
    let linkedNoteId: String?
    let linkedNoteTitle: String?
    let scriptureReference: String?
    let scripturePassageTranslation: String?
    let scripturePassageExcerpt: String?
    let isArchived: Bool?
    let highlightListEditedAt: String?
    let createdAt: String?
    let updatedAt: String?
}

struct APIListStudyThreadsResponse: Codable {
    let success: Bool?
    let studyThreads: [APIStudyThreadEntry]
}

/// Mirrors the response shape returned by `server/routes/notes.ts:1677`.
/// `shareUrl` is server-rendered (`<origin>/shared/note/<token>`) so the
/// native popover doesn't need to know the public host.
struct APIShareNoteResponse: Codable {
    let success: Bool
    let isPublic: Bool
    let shareToken: String?
    let shareUrl: String?
    let shareTokenCreatedAt: String?
}

struct APIMySharingNote: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let shareToken: String
    let shareUrl: String
}

struct APIMySharingResponse: Codable, Sendable {
    let threads: [APIMySharingThread]?
    let notes: [APIMySharingNote]
}

struct APIMySharingThread: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let color: String?
    let shareToken: String
    let shareUrl: String
}

struct APIMySharedSpace: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let color: String?
    let memberCount: Int
    let shareToken: String?
    let shareUrl: String?
}

struct APIMySharedSpacesResponse: Codable, Sendable {
    let owned: [APIMySharedSpace]
    let memberOf: [APIMySharedSpace]?
}

/// Server profile payload from `GET /api/user/get-profile`. Church fields are the
/// canonical cross-device values; `hasLockPinSet` powers the lock-PIN UI (the hash
/// itself is never sent to clients).
struct APIUserProfile: Codable {
    let firstName: String?
    let lastName: String?
    let userColor: String?
    let email: String?
    let emailVerified: Bool?
    let churchName: String?
    let churchCity: String?
    let churchState: String?
    let churchCountry: String?
    let defaultTranslation: String?
    let hasLockPinSet: Bool?
}

/// Minimal `{ success }` envelope for endpoints whose body we don't otherwise use.
struct APIBasicResponse: Codable {
    let success: Bool?
}

/// Response from `POST /api/user/update-church`.
struct APIUpdateChurchResponse: Codable {
    struct Church: Codable {
        let churchName: String?
        let churchCity: String?
        let churchState: String?
        let churchCountry: String?
    }
    let success: Bool
    let church: Church?
}
