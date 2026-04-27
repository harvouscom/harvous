import Foundation

enum HarvousAPI {
    /// Production API origin. Use `app.harvous.com` (Netlify + Hono); `harvous.com` is marketing and returns 405 for POST `/api/*`.
    /// For local dev, temporarily change this constant or add a build flag.
    static let baseURL = "https://app.harvous.com"
}

enum ScriptureFetchError: Error, LocalizedError {
    case invalidURL
    case badResponse
    case httpStatus(Int)
    case notFound
    case decoding

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid API URL"
        case .badResponse: return "Unexpected response"
        case .httpStatus(let c): return "Server error (\(c))"
        case .notFound: return "No verses found for this reference or translation"
        case .decoding: return "Could not read verse text"
        }
    }
}

enum ScriptureVerseFetch {
    private struct RequestBody: Encodable {
        let reference: String
        let translation: String
    }

    private struct SuccessResponse: Decodable {
        let text: String
    }

    /// Fetches HTML verse content (superscript verse numbers, etc.) from `POST /api/scripture/fetch-verse`.
    static func fetchVerseHTML(reference: String, translation: String) async throws -> String {
        let trimmedRef = reference.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTrans = translation.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedRef.isEmpty else { throw ScriptureFetchError.notFound }

        guard let url = URL(string: HarvousAPI.baseURL + "/api/scripture/fetch-verse") else {
            throw ScriptureFetchError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RequestBody(reference: trimmedRef, translation: trimmedTrans))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ScriptureFetchError.badResponse }

        if http.statusCode == 404 {
            throw ScriptureFetchError.notFound
        }
        guard (200 ... 299).contains(http.statusCode) else {
            throw ScriptureFetchError.httpStatus(http.statusCode)
        }

        guard let decoded = try? JSONDecoder().decode(SuccessResponse.self, from: data), !decoded.text.isEmpty else {
            throw ScriptureFetchError.decoding
        }
        return decoded.text
    }
}
