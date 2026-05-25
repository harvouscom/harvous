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

    init(
        baseURL: URL = HarvousEnvironment.apiBaseURL,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
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

    // MARK: - Core

    private func request<B: Encodable, R: Decodable>(
        method: String,
        path: String,
        query: [String: String],
        body: B?
    ) async throws -> R {
        guard let token = await HarvousClerkBridge.shared.bearerToken() else {
            throw HarvousAPIError.notSignedIn
        }

        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else {
            throw HarvousAPIError.http(status: -1, message: "Invalid URL: \(path)")
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                req.httpBody = try encoder.encode(body)
            } catch {
                throw HarvousAPIError.transport(error)
            }
        }

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

        if http.statusCode == 401 {
            throw HarvousAPIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = extractServerMessage(from: data)
            Logger.app.error("HarvousAPIClient \(method) \(path) → \(http.statusCode): \(message ?? "(no body)", privacy: .public)")
            throw HarvousAPIError.http(status: http.statusCode, message: message)
        }

        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw HarvousAPIError.decoding(error)
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

struct APISpace: Codable, Identifiable {
    let id: String
    let name: String?
    let createdAt: String?
    let updatedAt: String?
}

struct APIListSpacesResponse: Codable {
    let success: Bool?
    let spaces: [APISpace]
}

struct APINote: Codable, Identifiable {
    let id: String
    let spaceId: String?
    let title: String?
    let content: String?
    let updatedAt: String?
    let createdAt: String?
    let isPublic: Bool?
    let shareToken: String?
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

struct APIUserMetadata: Codable {
    let highestSimpleNoteId: Int?
    let reservedSimpleNoteIdRange: APISimpleNoteIdRange?
}

struct APISimpleNoteIdRange: Codable {
    let start: Int
    let end: Int
}

/// Full payload from `GET /api/sync/bootstrap`.
struct APIBootstrapResponse: Codable {
    let cursor: String
    let spaces: [APISpace]
    let notes: [APINote]
    let studyThreadEntries: [APIStudyThreadEntry]
    let userMetadata: APIUserMetadata?
}

/// Incremental payload from `GET /api/sync/changes?since=<cursor>`.
struct APIChangesResponse: Codable {
    let cursor: String
    let hasChanges: Bool
    let spaces: [APISpace]
    let notes: [APINote]
    let studyThreadEntries: [APIStudyThreadEntry]
    let userMetadata: APIUserMetadata?
}

struct APIStudyThreadEntry: Codable, Identifiable {
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
