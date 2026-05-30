import Foundation
import SwiftData

/// Picks up files dropped into `_harvous/inbox` and imports them into the active space.
@MainActor
enum HarvousVaultInboxScanner {
    static func scanIfNeeded(modelContext: ModelContext, activeSpaceId: UUID) {
        guard HarvousVaultPreferences.isMirrorEnabled else { return }
        HarvousVaultLocation.withSecurityScopeIfNeeded {
            do {
                let root = try HarvousVaultLocation.vaultRootURL()
                let inbox = root
                    .appendingPathComponent("_harvous", isDirectory: true)
                    .appendingPathComponent("inbox", isDirectory: true)
                let fm = FileManager.default
                let entries = try fm.contentsOfDirectory(at: inbox, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
                var files: [URL] = []
                for e in entries {
                    if e.lastPathComponent == "_imported" { continue }
                    let isDir = (try? e.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
                    if isDir { continue }
                    files.append(e)
                }
                guard !files.isEmpty else { return }

                let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
                let destDir = inbox.appendingPathComponent("_imported", isDirectory: true).appendingPathComponent(stamp, isDirectory: true)
                try fm.createDirectory(at: destDir, withIntermediateDirectories: true)

                let report = HarvousVaultImporter.importItems(
                    urls: files,
                    targetSpaceId: activeSpaceId,
                    modelContext: modelContext,
                    skipVaultRewrite: true
                )
                for u in files {
                    let base = destDir.appendingPathComponent(u.lastPathComponent)
                    if fm.fileExists(atPath: u.path) {
                        try? fm.moveItem(at: u, to: base)
                    }
                }
                let logURL = destDir.appendingPathComponent("import-log.txt")
                try? report.writeLog(to: logURL)
                HarvousVaultExporter.rewriteAllNotes(modelContext: modelContext)
            } catch {
                print("[HarvousVaultInboxScanner] \(error)")
            }
        }
    }
}
