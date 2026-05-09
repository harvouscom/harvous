import Foundation

struct VotdToday {
    let reference: String
    let translation: String
}

private struct VotdTodayResponse: Decodable {
    let reference: String?
    let translation: String?
}

/// Deduplicates concurrent `fetchToday()` network work (sidebar + prewarm should never stack URLSessions).
private actor VotdFetchCoordinator {
    static let shared = VotdFetchCoordinator()
    private var inFlight: Task<VotdToday?, Never>?

    func singleFlight(_ operation: @Sendable @escaping () async -> VotdToday?) async -> VotdToday? {
        if let inFlight {
            return await inFlight.value
        }
        let task = Task { await operation() }
        inFlight = task
        let value = await task.value
        inFlight = nil
        return value
    }
}

enum VotdService {
    /// UserDefaults key for passage card dismissal. In DEBUG the key includes `CFBundleVersion` so incrementing the Xcode build resets dismissal during development (each install/build pair sees a fresh key).
    static var passageCardDismissedDayUserDefaultsKey: String {
        #if DEBUG
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "votd_passage_card_dismissed_day.debug.build.\(build)"
        #else
        return "votd_passage_card_dismissed_day"
        #endif
    }

    /// DEBUG tries localhost first (matches typical `npm run dev`), then production — same as scripture (`HarvousAPI`) when local API is off.
    private static func fetchOrigins() -> [String] {
        #if DEBUG
        ["http://localhost:3001", HarvousAPI.baseURL]
        #else
        [HarvousAPI.baseURL]
        #endif
    }

    private static let urlSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 12
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    private static func calendarDayKey(for date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = TimeZone.current
        return fmt.string(from: date)
    }

    private static func dateKey() -> String {
        calendarDayKey(for: Date())
    }

    /// Local-calendar day string matching `fetchToday` / dismissal storage.
    static func todayCalendarDayKey(now: Date = Date()) -> String {
        calendarDayKey(for: now)
    }

    /// Returns today's VOTD. Checks UserDefaults cache first; falls back to network.
    static func fetchToday() async -> VotdToday? {
        let key = dateKey()
        let refKey = "votd_ref_\(key)"
        let transKey = "votd_translation_\(key)"
        if let ref = UserDefaults.standard.string(forKey: refKey), !ref.isEmpty {
            let translation = UserDefaults.standard.string(forKey: transKey) ?? "NET"
            return VotdToday(reference: ref, translation: translation)
        }
        guard let fetched = await VotdFetchCoordinator.shared.singleFlight({ await fetchFromNetwork() }) else { return nil }
        UserDefaults.standard.set(fetched.reference, forKey: refKey)
        UserDefaults.standard.set(fetched.translation, forKey: transKey)
        return fetched
    }

    private static func fetchFromNetwork() async -> VotdToday? {
        for origin in fetchOrigins() {
            if let v = await fetchVotd(origin: origin) { return v }
        }
        return nil
    }

    private static func fetchVotd(origin: String) async -> VotdToday? {
        let ianaTz = TimeZone.current.identifier
        var components = URLComponents(string: "\(origin)/api/votd/today")
        components?.queryItems = [URLQueryItem(name: "tz", value: ianaTz)]
        guard let url = components?.url else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        // Fail fast when local API is not running so production fallback loads quickly.
        if origin.contains("localhost") || origin.contains("127.0.0.1") {
            request.timeoutInterval = 2.5
        }
        request.setValue(ianaTz, forHTTPHeaderField: "X-Votd-Timezone")
        do {
            let (data, response) = try await urlSession.data(for: request)
            if let http = response as? HTTPURLResponse, !(200 ..< 300).contains(http.statusCode) {
                return nil
            }
            guard let decoded = try? JSONDecoder().decode(VotdTodayResponse.self, from: data),
                  let ref = decoded.reference, !ref.isEmpty else { return nil }
            return VotdToday(reference: ref, translation: decoded.translation ?? "NET")
        } catch {
            return nil
        }
    }
}
