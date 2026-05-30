import Foundation

/// Persists the Easton's slug index JSON under Application Support (`v1/`) so cold launches can
/// answer `hasEntry(forWord:)` before the network refresh completes. One document, no LRU.
actor EastonsSlugIndexDiskStore {
    static let shared = EastonsSlugIndexDiskStore()

    private let schemaFolder = "v1"
    private let fileName = "index.json"

    private var vaultDirectoryURL: URL {
        let fm = FileManager.default
        guard let dir = try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else {
            return fm.temporaryDirectory.appendingPathComponent("Harvous/EastonsSlugIndexFallback", isDirectory: true)
        }
        let appDir = dir.appendingPathComponent("Harvous", isDirectory: true)
        let vault = appDir.appendingPathComponent("EastonsSlugIndex", isDirectory: true)
            .appendingPathComponent(schemaFolder, isDirectory: true)
        try? fm.createDirectory(at: vault, withIntermediateDirectories: true)
        return vault
    }

    private var fileURL: URL {
        vaultDirectoryURL.appendingPathComponent(fileName, isDirectory: false)
    }

    private struct Envelope: Codable {
        let entries: [EastonsSlugIndexEntry]
    }

    func read() -> [EastonsSlugIndexEntry]? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data) else { return nil }
        return envelope.entries.isEmpty ? nil : envelope.entries
    }

    func write(_ entries: [EastonsSlugIndexEntry]) {
        guard !entries.isEmpty else { return }
        guard let data = try? JSONEncoder().encode(Envelope(entries: entries)) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }
}
