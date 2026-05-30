import Foundation

/// Supabase project URL + anon key for Realtime (from Info.plist / xcconfig).
enum HarvousSupabaseConfig {
    static var projectURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "HarvousSupabaseURL") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("REPLACE_ME"), let url = URL(string: trimmed) else { return nil }
        return url
    }

    static var anonKey: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "HarvousSupabaseAnonKey") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("REPLACE_ME") else { return nil }
        return trimmed
    }

    static var isConfigured: Bool {
        projectURL != nil && anonKey != nil
    }

    static func syncChannelName(userId: String) -> String {
        "sync-\(userId)"
    }
}
