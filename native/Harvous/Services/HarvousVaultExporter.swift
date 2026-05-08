import Foundation
import SwiftData

// MARK: - Highlight sidecar DTO

struct HarvousVaultStudyThreadsFile: Codable {
    var version: Int = 1
    var noteId: UUID
    var threads: [HarvousVaultStudyThreadDTO]
}

struct HarvousVaultStudyThreadDTO: Codable {
    var id: UUID
    var createdAt: Date
    var updatedAt: Date
    var spaceId: UUID
    var parentNoteId: UUID
    var sourceSnippet: String
    var focusTitle: String
    var notesBody: String
    var isArchived: Bool
    var suggestedQuestions: [String]
    var resourceLines: [String]
    var entryKindRaw: String
    var miniNoteBody: String
    var linkedNoteId: UUID?
    var linkedNoteTitle: String
    var anchorLocation: Int?
    var anchorLength: Int?
    var anchorTextSnapshot: String?
    var scriptureReference: String?
    var scripturePassageTranslation: String?
    var scripturePassageExcerpt: String?
    var highlightAccentRaw: String

    init(from thread: StudyThread) {
        self.id = thread.id
        self.createdAt = thread.createdAt
        self.updatedAt = thread.updatedAt
        self.spaceId = thread.spaceId
        self.parentNoteId = thread.parentNoteId
        self.sourceSnippet = thread.sourceSnippet
        self.focusTitle = thread.focusTitle
        self.notesBody = thread.notesBody
        self.isArchived = thread.isArchived
        self.suggestedQuestions = thread.suggestedQuestions
        self.resourceLines = thread.resourceLines
        self.entryKindRaw = thread.entryKindRaw
        self.miniNoteBody = thread.miniNoteBody
        self.linkedNoteId = thread.linkedNoteId
        self.linkedNoteTitle = thread.linkedNoteTitle
        self.anchorLocation = thread.anchorLocation
        self.anchorLength = thread.anchorLength
        self.anchorTextSnapshot = thread.anchorTextSnapshot
        self.scriptureReference = thread.scriptureReference
        self.scripturePassageTranslation = thread.scripturePassageTranslation
        self.scripturePassageExcerpt = thread.scripturePassageExcerpt
        self.highlightAccentRaw = thread.highlightAccentRaw
    }

    func makeStudyThread(parent: Note) -> StudyThread {
        StudyThread(
            id: id,
            createdAt: createdAt,
            updatedAt: updatedAt,
            spaceId: spaceId,
            parentNoteId: parentNoteId,
            sourceSnippet: sourceSnippet,
            focusTitle: focusTitle,
            notesBody: notesBody,
            isArchived: isArchived,
            suggestedQuestions: suggestedQuestions,
            resourceLines: resourceLines,
            entryKindRaw: entryKindRaw,
            miniNoteBody: miniNoteBody,
            linkedNoteId: linkedNoteId,
            linkedNoteTitle: linkedNoteTitle,
            anchorLocation: anchorLocation,
            anchorLength: anchorLength,
            anchorTextSnapshot: anchorTextSnapshot,
            scriptureReference: scriptureReference,
            scripturePassageTranslation: scripturePassageTranslation,
            scripturePassageExcerpt: scripturePassageExcerpt,
            highlightAccentRaw: highlightAccentRaw,
            parentNote: parent
        )
    }
}

// MARK: - Debouncing

@MainActor
final class HarvousVaultExportCoordinator {
    static let shared = HarvousVaultExportCoordinator()

    private var pendingNoteIds: Set<UUID> = []
    private var tasks: [UUID: Task<Void, Never>] = [:]

    func schedule(noteId: UUID, modelContext: ModelContext) {
        pendingNoteIds.insert(noteId)
        tasks[noteId]?.cancel()
        tasks[noteId] = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 750_000_000)
            self.tasks[noteId] = nil
            self.pendingNoteIds.remove(noteId)
            guard !Task.isCancelled else { return }
            HarvousVaultExporter.writeNoteNow(noteId: noteId, modelContext: modelContext)
        }
    }

    func cancel(noteId: UUID) {
        tasks[noteId]?.cancel()
        tasks[noteId] = nil
        pendingNoteIds.remove(noteId)
    }

    /// Cancels debounced work and immediately writes every note id that was queued.
    func flush(modelContext: ModelContext) {
        let ids = pendingNoteIds
        for (_, t) in tasks { t.cancel() }
        tasks.removeAll()
        pendingNoteIds.removeAll()
        for id in ids {
            HarvousVaultExporter.writeNoteNow(noteId: id, modelContext: modelContext)
        }
    }
}

// MARK: - Exporter

@MainActor
enum HarvousVaultExporter {
    static func scheduleWrite(note: Note, modelContext: ModelContext) {
        guard HarvousVaultPreferences.isMirrorEnabled else { return }
        HarvousVaultExportCoordinator.shared.schedule(noteId: note.id, modelContext: modelContext)
    }

    static func removeMirrorFiles(for note: Note, modelContext: ModelContext) {
        HarvousVaultExportCoordinator.shared.cancel(noteId: note.id)
        guard HarvousVaultPreferences.isMirrorEnabled else { return }
        HarvousVaultLocation.withSecurityScopeIfNeeded {
            do {
                try deleteFiles(for: note, modelContext: modelContext)
            } catch {
                print("[HarvousVaultExporter] delete failed: \(error)")
            }
        }
    }

    static func rewriteAllNotes(modelContext: ModelContext) {
        guard HarvousVaultPreferences.isMirrorEnabled else { return }
        HarvousVaultExportCoordinator.shared.flush(modelContext: modelContext)
        HarvousVaultLocation.withSecurityScopeIfNeeded {
            do {
                let root = try HarvousVaultLocation.vaultRootURL()
                let desc = FetchDescriptor<Note>()
                let all = (try? modelContext.fetch(desc)) ?? []
                try writeSpacesSidecar(modelContext: modelContext, root: root)
                var count = 0
                for note in all {
                    try writeOne(note: note, modelContext: modelContext, root: root)
                    count += 1
                }
                HarvousVaultPreferences.cachedExportedNoteCount = count
                HarvousVaultPreferences.lastVaultWriteAt = Date()
            } catch {
                print("[HarvousVaultExporter] rewriteAll failed: \(error)")
            }
        }
    }

    static func writeNoteNow(noteId: UUID, modelContext: ModelContext) {
        guard HarvousVaultPreferences.isMirrorEnabled else { return }
        let target = noteId
        let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == target })
        guard let note = try? modelContext.fetch(fd).first else { return }
        HarvousVaultLocation.withSecurityScopeIfNeeded {
            do {
                let root = try HarvousVaultLocation.vaultRootURL()
                try writeSpacesSidecar(modelContext: modelContext, root: root)
                try writeOne(note: note, modelContext: modelContext, root: root)
                refreshExportStats(modelContext: modelContext, root: root)
                HarvousVaultPreferences.lastVaultWriteAt = Date()
            } catch {
                print("[HarvousVaultExporter] write failed: \(error)")
            }
        }
    }

    private static func refreshExportStats(modelContext: ModelContext, root: URL) {
        let desc = FetchDescriptor<Note>()
        let n = (try? modelContext.fetch(desc))?.count ?? 0
        HarvousVaultPreferences.cachedExportedNoteCount = n
    }

    private static func spaceName(for id: UUID, modelContext: ModelContext) -> String {
        let fd = FetchDescriptor<Space>(predicate: #Predicate { $0.id == id && !$0.isArchived })
        if let s = try? modelContext.fetch(fd).first { return s.name }
        return "My Home"
    }

    private static func deleteFiles(for note: Note, modelContext: ModelContext) throws {
        let root = try HarvousVaultLocation.vaultRootURL()
        let sid = note.resolvedSpaceId()
        let folder = HarvousVaultMarkdown.sanitizeSpaceFolderName(spaceName(for: sid, modelContext: modelContext))
        let spaceDir = root.appendingPathComponent(folder, isDirectory: true)
        if let name = note.vaultFilename {
            let url = spaceDir.appendingPathComponent(name)
            try? FileManager.default.removeItem(at: url)
        }
        let hl = root
            .appendingPathComponent("_harvous", isDirectory: true)
            .appendingPathComponent("highlights", isDirectory: true)
            .appendingPathComponent("\(note.id.uuidString).json")
        try? FileManager.default.removeItem(at: hl)
    }

    private static func writeOne(note: Note, modelContext: ModelContext, root: URL) throws {
        let sid = note.resolvedSpaceId()
        let folder = HarvousVaultMarkdown.sanitizeSpaceFolderName(spaceName(for: sid, modelContext: modelContext))
        let spaceDir = root.appendingPathComponent(folder, isDirectory: true)
        try FileManager.default.createDirectory(at: spaceDir, withIntermediateDirectories: true)

        let prefix = HarvousVaultMarkdown.datePrefix(for: note.createdAt)
        let slug = HarvousVaultMarkdown.slugTitleForFilename(note.title)
        let base = "\(prefix) \(slug).md"
        let resolved = resolveUniqueFilename(spaceDir: spaceDir, base: base, noteId: note.id)
        if let old = note.vaultFilename, old != resolved {
            let oldURL = spaceDir.appendingPathComponent(old)
            if FileManager.default.fileExists(atPath: oldURL.path) {
                try? FileManager.default.removeItem(at: oldURL)
            }
        }
        note.vaultFilename = resolved

        let md = HarvousVaultMarkdown.buildMarkdown(note: note, spaceName: spaceName(for: sid, modelContext: modelContext))
        let dest = spaceDir.appendingPathComponent(resolved)
        try writeAtomicUTF8(md, to: dest)

        let side = HarvousVaultStudyThreadsFile(
            noteId: note.id,
            threads: note.studyThreads.map { HarvousVaultStudyThreadDTO(from: $0) }
        )
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try enc.encode(side)
        let hlURL = root
            .appendingPathComponent("_harvous", isDirectory: true)
            .appendingPathComponent("highlights", isDirectory: true)
            .appendingPathComponent("\(note.id.uuidString).json")
        try writeAtomicData(data, to: hlURL)
    }

    private static func resolveUniqueFilename(spaceDir: URL, base: String, noteId: UUID) -> String {
        let fm = FileManager.default
        let target = spaceDir.appendingPathComponent(base)
        if !fm.fileExists(atPath: target.path) { return base }
        guard let data = try? Data(contentsOf: target),
              let s = String(data: data, encoding: .utf8) else {
            return fallbackName(base: base, noteId: noteId)
        }
        let parsed = HarvousVaultMarkdown.parseDocument(s)
        if parsed.id == noteId { return base }
        return fallbackName(base: base, noteId: noteId)
    }

    private static func fallbackName(base: String, noteId: UUID) -> String {
        let stem = (base as NSString).deletingPathExtension
        let suffix = String(noteId.uuidString.prefix(8))
        return "\(stem) (\(suffix)).md"
    }

    private static func writeAtomicUTF8(_ text: String, to url: URL) throws {
        guard let data = text.data(using: .utf8) else { return }
        try writeAtomicData(data, to: url)
    }

    private static func writeAtomicData(_ data: Data, to url: URL) throws {
        let fm = FileManager.default
        let tmp = url.appendingPathExtension("tmp-\(UUID().uuidString)")
        try data.write(to: tmp, options: .atomic)
        if fm.fileExists(atPath: url.path) {
            try fm.removeItem(at: url)
        }
        try fm.moveItem(at: tmp, to: url)
    }

    private struct SpaceSnapshot: Codable {
        var id: UUID
        var name: String
        var scriptureThemeRaw: String
    }

    private static func writeSpacesSidecar(modelContext: ModelContext, root: URL) throws {
        let fd = FetchDescriptor<Space>(predicate: #Predicate { !$0.isArchived })
        let spaces = (try? modelContext.fetch(fd)) ?? []
        let snaps = spaces.map { SpaceSnapshot(id: $0.id, name: $0.name, scriptureThemeRaw: $0.scriptureThemeRaw) }
        let data = try JSONEncoder().encode(snaps)
        let url = root.appendingPathComponent("_harvous", isDirectory: true).appendingPathComponent("spaces.json")
        try writeAtomicData(data, to: url)
    }
}
