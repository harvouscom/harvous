import Foundation

/// Shared between app and widget extension (Codable snapshot on disk).
struct RecallCardDTO: Codable, Hashable, Sendable {
    var noteId: String
    var title: String
    var excerpt: String
    var primaryRef: String?
    var updatedAt: TimeInterval
}

struct RecallSnapshotFile: Codable, Hashable, Sendable {
    var card: RecallCardDTO?
    var streakDays: Int
    /// Stub queue size for Live Activity / widget progress (until server-backed recall exists).
    var queueTotal: Int
    var queueIndex: Int
}

enum RecallSnapshotIO {
    static let fileName = "recall_snapshot.json"

    static func fileURL() -> URL? {
        HarvousAppGroup.containerURL?.appendingPathComponent(fileName, isDirectory: false)
    }

    static func load() -> RecallSnapshotFile? {
        guard let url = fileURL(),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(RecallSnapshotFile.self, from: data)
    }

    static func save(_ snapshot: RecallSnapshotFile) {
        guard let url = fileURL() else { return }
        do {
            let data = try JSONEncoder().encode(snapshot)
            try data.write(to: url, options: [.atomic])
        } catch {}
    }
}
