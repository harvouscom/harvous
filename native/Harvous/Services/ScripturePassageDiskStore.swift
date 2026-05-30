import CryptoKit
import Foundation

/// Persists raw HTML passages under Application Support (`pv1/`). LRU caps at `maxEntries` files.
actor ScripturePassageDiskStore {
    static let shared = ScripturePassageDiskStore()

    private let schemaFolder = "pv1"
    private let maxEntries = 500
    private let manifestName = "lru-manifest.json"

    /// Same logical key as in-memory [`ScripturePassageCache`] (`v19|ref|translation`).
    private func fileName(forMemoryCacheKey key: String) -> String {
        let digest = SHA256.hash(data: Data(key.utf8))
        return digest.map { String(format: "%02x", $0) }.joined() + ".html"
    }

    private var vaultDirectoryURL: URL {
        let fm = FileManager.default
        guard let dir = try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else {
            return fm.temporaryDirectory.appendingPathComponent("Harvous/ScripturePassageCacheFallback", isDirectory: true)
        }
        let appDir = dir.appendingPathComponent("Harvous", isDirectory: true)
        let vault = appDir.appendingPathComponent("ScripturePassageCache", isDirectory: true)
            .appendingPathComponent(schemaFolder, isDirectory: true)
        try? fm.createDirectory(at: vault, withIntermediateDirectories: true)
        return vault
    }

    private var manifestURL: URL {
        vaultDirectoryURL.appendingPathComponent(manifestName, isDirectory: false)
    }

    private struct Manifest: Codable {
        /// Filenames newest-last (evict from the front).
        var order: [String]
    }

    private func loadManifest() -> Manifest {
        guard let data = try? Data(contentsOf: manifestURL),
              let m = try? JSONDecoder().decode(Manifest.self, from: data) else {
            return Manifest(order: [])
        }
        return m
    }

    private func saveManifest(_ m: Manifest) {
        guard let data = try? JSONEncoder().encode(m) else { return }
        try? data.write(to: manifestURL, options: [.atomic])
    }

    /// Returns HTML when a cached file exists; updates LRU touch order.
    func readHTML(memoryCacheKey key: String) -> String? {
        let fm = FileManager.default
        let fname = fileName(forMemoryCacheKey: key)
        let url = vaultDirectoryURL.appendingPathComponent(fname, isDirectory: false)
        guard fm.fileExists(atPath: url.path) else { return nil }
        guard let html = try? String(contentsOf: url, encoding: .utf8), !html.isEmpty else {
            try? fm.removeItem(at: url)
            evictFilenameFromManifest(fname)
            return nil
        }
        touchInManifest(fname)
        return html
    }

    /// Writes UTF-8 HTML and enforces LRU eviction.
    func writeHTML(_ html: String, memoryCacheKey key: String) {
        guard !html.isEmpty else { return }
        let fm = FileManager.default
        let fname = fileName(forMemoryCacheKey: key)
        let url = vaultDirectoryURL.appendingPathComponent(fname, isDirectory: false)

        guard let data = html.data(using: .utf8) else { return }

        let dir = vaultDirectoryURL
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)

        do {
            try data.write(to: url, options: [.atomic])
        } catch {
            return
        }

        touchInManifest(fname)
        evictOldestWhileOverCapacity()
    }

    private func touchInManifest(_ fname: String) {
        var m = loadManifest()
        m.order.removeAll { $0 == fname }
        m.order.append(fname)
        saveManifest(m)
    }

    private func evictFilenameFromManifest(_ fname: String) {
        var m = loadManifest()
        m.order.removeAll { $0 == fname }
        saveManifest(m)
    }

    private func evictOldestWhileOverCapacity() {
        let fm = FileManager.default
        var m = loadManifest()
        while m.order.count > maxEntries, let oldest = m.order.first {
            m.order.removeFirst()
            let url = vaultDirectoryURL.appendingPathComponent(oldest, isDirectory: false)
            try? fm.removeItem(at: url)
        }
        saveManifest(m)
    }
}
