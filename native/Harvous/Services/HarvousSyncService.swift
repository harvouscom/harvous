import Foundation
import Observation
import SwiftData
import os

private let kLastSyncCursorKey = "HarvousSyncCursor"

/// Two-way sync between the local SwiftData store and the Harvous Hono backend.
///
/// Read path (`pullAll`):  GET spaces → notes → highlights, upsert keyed on
/// `serverId` (the server's `space_…` / `note_…` / `study_…` string ids).
///
/// Write path (`flushPending`):  walks every `@Model` with `needsSync == true`,
/// POSTs new rows (no `serverId`) or PATCHes existing ones, writes back the
/// returned id, then clears the dirty flag.
///
/// Conflict policy v1: server wins for full-row pulls; locally-dirty rows are
/// not overwritten on pull (they queue for upload first). Last-write-wins on
/// upload.
@MainActor
@Observable
final class HarvousSyncService {
    static let shared = HarvousSyncService()

    /// In-memory snapshot of the last successful pull. Useful for debugging
    /// and as a sanity surface before the SwiftData rows have been ingested.
    private(set) var remote = RemoteSnapshot()
    private(set) var lastPullAt: Date?
    private(set) var lastFlushAt: Date?
    private(set) var isPulling = false
    private(set) var isFlushing = false
    private(set) var lastError: HarvousAPIError?

    /// Cursor returned by the last bootstrap or changes call.
    /// Persisted to UserDefaults so delta-sync survives app restarts.
    var lastSyncCursor: String? {
        get { UserDefaults.standard.string(forKey: kLastSyncCursorKey) }
        set { UserDefaults.standard.set(newValue, forKey: kLastSyncCursorKey) }
    }

    /// Highest `simpleNoteId` reserved from the server. Stored locally so
    /// new offline notes pick the next value without a round-trip.
    var highestSimpleNoteId: Int {
        get { UserDefaults.standard.integer(forKey: "HarvousHighestSimpleNoteId") }
        set { UserDefaults.standard.set(newValue, forKey: "HarvousHighestSimpleNoteId") }
    }

    private let api: HarvousAPIClient

    private init(api: HarvousAPIClient = .shared) {
        self.api = api
    }

    // MARK: - Read path

    /// Best-effort pull. On first call (no cursor) uses `/api/sync/bootstrap` to
    /// hydrate the full library. On subsequent calls uses `/api/sync/changes` for
    /// a delta pull keyed on the last cursor. Concurrent calls coalesce.
    func pullAll(context: ModelContext? = nil) async {
        if isPulling { return }
        isPulling = true
        defer { isPulling = false }
        lastError = nil

        do {
            if lastSyncCursor == nil {
                try await bootstrap(context: context)
            } else {
                try await fetchChanges(context: context)
            }
        } catch let apiErr as HarvousAPIError {
            lastError = apiErr
            Logger.app.error("Sync pull failed: \(apiErr.localizedDescription, privacy: .public)")
        } catch {
            lastError = .transport(error)
            Logger.app.error("Sync pull failed (transport): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Full library pull from `/api/sync/bootstrap`. Replaces per-space N+1 polling.
    private func bootstrap(context: ModelContext?) async throws {
        let payload: APIBootstrapResponse = try await api.get("/api/sync/bootstrap")
        lastSyncCursor = payload.cursor
        reconcileSimpleNoteId(from: payload.userMetadata)

        remote.spaces = payload.spaces
        remote.allNotes = payload.notes
        remote.allHighlights = payload.studyThreadEntries
        lastPullAt = Date()

        Logger.app.info("Sync bootstrap: \(payload.spaces.count) spaces, \(payload.notes.count) notes, \(payload.studyThreadEntries.count) highlights")

        if let context { ingestBootstrap(context: context) }
    }

    /// Delta pull from `/api/sync/changes?since=<cursor>`.
    private func fetchChanges(context: ModelContext?) async throws {
        guard let cursor = lastSyncCursor else { return }
        let payload: APIChangesResponse = try await api.get("/api/sync/changes", query: ["since": cursor])
        lastSyncCursor = payload.cursor
        reconcileSimpleNoteId(from: payload.userMetadata)

        if payload.hasChanges {
            remote.spaces = payload.spaces
            remote.allNotes = payload.notes
            remote.allHighlights = payload.studyThreadEntries
            lastPullAt = Date()
            Logger.app.info("Sync changes: \(payload.notes.count) notes, \(payload.studyThreadEntries.count) highlights")
            if let context { ingestBootstrap(context: context) }
        }
    }

    private func reconcileSimpleNoteId(from meta: APIUserMetadata?) {
        if let serverHighest = meta?.highestSimpleNoteId, serverHighest > highestSimpleNoteId {
            highestSimpleNoteId = serverHighest
        }
        if let range = meta?.reservedSimpleNoteIdRange, range.end > highestSimpleNoteId {
            highestSimpleNoteId = range.end
        }
    }

    /// Upserts notes, spaces, and highlights from the last fetched snapshot into SwiftData.
    /// Rows currently dirty (`needsSync == true`) are skipped — they upload first, then reconcile.
    func ingestBootstrap(context: ModelContext) {
        for apiSpace in remote.spaces {
            upsertSpace(apiSpace, context: context)
        }
        for apiNote in remote.allNotes {
            upsertNote(apiNote, context: context)
        }
        for apiEntry in remote.allHighlights {
            upsertHighlight(apiEntry, context: context)
        }
        do {
            try context.save()
        } catch {
            Logger.app.error("SwiftData save after ingest failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Legacy shim — kept so call-sites that pass a context still compile.
    func ingestIntoSwiftData(context: ModelContext) {
        ingestBootstrap(context: context)
    }

    private func upsertSpace(_ api: APISpace, context: ModelContext) {
        let id = api.id
        let predicate = #Predicate<Space> { $0.serverId == id }
        let existing = try? context.fetch(FetchDescriptor<Space>(predicate: predicate)).first
        if let existing {
            if existing.needsSync { return }
            if let name = api.name { existing.name = name }
            existing.updatedAt = Date()
        } else {
            let space = Space(
                name: api.name ?? "Untitled space",
                visibility: .personal,
                ownerUserId: HarvousClerkBridge.shared.userId ?? ""
            )
            space.serverId = api.id
            context.insert(space)
        }
    }

    private func upsertNote(_ api: APINote, context: ModelContext) {
        let id = api.id
        let predicate = #Predicate<Note> { $0.serverId == id }
        let existing = try? context.fetch(FetchDescriptor<Note>(predicate: predicate)).first
        if let existing {
            if existing.needsSync { return }
            if let title = api.title { existing.title = title }
            if let content = api.content { existing.body = Self.htmlToPlainText(content) }
            if let isPub = api.isPublic { existing.isPublic = isPub }
            existing.shareToken = api.shareToken
            // Folder / collection fields — server is authoritative on pull.
            if let folder = api.primaryCollection { existing.primaryFolder = folder.isEmpty ? nil : folder }
            if let secondaries = api.secondaryCollections { existing.secondaryFolders = secondaries }
            if let pinned = api.collectionPinned { existing.isFolderPinned = pinned }
            if let userOverride = api.collectionUserOverride { existing.isFolderUserOverride = userOverride }
            if let simpleId = api.simpleNoteId, existing.simpleNoteId == nil { existing.simpleNoteId = simpleId }
            existing.updatedAt = Date()
        } else {
            let note = Note(
                title: api.title ?? "",
                body: Self.htmlToPlainText(api.content ?? ""),
                primaryFolder: api.primaryCollection.flatMap { $0.isEmpty ? nil : $0 },
                secondaryFolders: api.secondaryCollections ?? [],
                isFolderUserOverride: api.collectionUserOverride ?? false,
                isFolderPinned: api.collectionPinned ?? false,
                spaceId: nil
            )
            note.serverId = api.id
            note.isPublic = api.isPublic ?? false
            note.shareToken = api.shareToken
            note.simpleNoteId = api.simpleNoteId
            note.addedBy = api.addedBy ?? "user"
            context.insert(note)
        }
    }

    private func upsertHighlight(_ api: APIStudyThreadEntry, context: ModelContext) {
        let id = api.id
        let predicate = #Predicate<StudyThread> { $0.serverId == id }
        let existing = try? context.fetch(FetchDescriptor<StudyThread>(predicate: predicate)).first
        if let existing {
            if existing.needsSync { return }
            if let accent = api.highlightAccentRaw { existing.highlightAccentRaw = accent }
            if let snippet = api.sourceSnippet { existing.sourceSnippet = snippet }
            if let title = api.focusTitle { existing.focusTitle = title }
            if let mini = api.miniNoteBody { existing.miniNoteBody = mini }
            existing.updatedAt = Date()
        } else {
            // First-pull highlights without a local parent are skipped — the
            // parent note must exist locally before we can wire the relationship.
            let parentServerId = api.parentNoteId
            let parentPredicate = #Predicate<Note> { $0.serverId == parentServerId }
            guard let parent = try? context.fetch(FetchDescriptor<Note>(predicate: parentPredicate)).first else {
                return
            }
            let entry = StudyThread(
                spaceId: parent.spaceId ?? HarvousSpaceBootstrap.personalHomeSpaceId,
                parentNoteId: parent.id,
                sourceSnippet: api.sourceSnippet ?? "",
                focusTitle: api.focusTitle ?? "",
                notesBody: "",
                entryKindRaw: api.entryKind ?? StudyThread.EntryKind.miniNote.rawValue,
                miniNoteBody: api.miniNoteBody ?? "",
                scriptureReference: api.scriptureReference,
                scripturePassageTranslation: api.scripturePassageTranslation,
                scripturePassageExcerpt: api.scripturePassageExcerpt,
                highlightAccentRaw: api.highlightAccentRaw ?? StudyHighlightAccentToken.warmAmber.rawValue,
                parentNote: parent
            )
            entry.serverId = api.id
            context.insert(entry)
        }
    }

    /// Server stores TipTap HTML; the native model holds plain text. Strip
    /// tags for a first-pass display — full HTML→Markdown is out of scope here.
    private static func htmlToPlainText(_ html: String) -> String {
        guard !html.isEmpty else { return "" }
        let withoutTags = html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        let collapsed = withoutTags.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return collapsed.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Wraps plain text as minimal TipTap-compatible HTML so the SPA renders
    /// it as paragraphs (rather than a single squashed line).
    static func plainTextToHTML(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "<p></p>" }
        let paragraphs = trimmed
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return paragraphs
            .map { escapeHTML($0).replacingOccurrences(of: "\n", with: "<br>") }
            .map { "<p>\($0)</p>" }
            .joined()
    }

    private static func escapeHTML(_ s: String) -> String {
        s
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }

    // MARK: - Write path

    /// Walks the SwiftData store for dirty rows and pushes them upstream.
    /// Idempotent: failed rows stay dirty for the next attempt.
    func flushPending(context: ModelContext) async {
        if isFlushing { return }
        isFlushing = true
        defer { isFlushing = false }

        await flushTombstones()
        await flushDirtyNotes(context: context)
        await flushDirtyHighlights(context: context)

        do { try context.save() } catch {
            Logger.app.error("SwiftData save after flush failed: \(error.localizedDescription, privacy: .public)")
        }
        lastFlushAt = Date()
    }

    private func flushTombstones() async {
        for tombstone in HarvousTombstoneQueue.all() {
            do {
                switch tombstone.kind {
                case .note:
                    let _: DeleteEnvelope = try await api.delete(
                        "/api/notes/delete",
                        query: ["noteId": tombstone.serverId]
                    )
                case .studyThread:
                    let _: DeleteEnvelope = try await api.delete(
                        "/api/study-threads/\(tombstone.serverId)"
                    )
                }
                HarvousTombstoneQueue.remove(tombstone)
            } catch HarvousAPIError.http(let status, _) where status == 404 {
                // Already gone server-side — drop the tombstone.
                HarvousTombstoneQueue.remove(tombstone)
            } catch {
                Logger.app.error("flush tombstone \(tombstone.serverId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private func flushDirtyNotes(context: ModelContext) async {
        let predicate = #Predicate<Note> { $0.needsSync == true }
        let dirty = (try? context.fetch(FetchDescriptor<Note>(predicate: predicate))) ?? []
        for note in dirty {
            if let serverId = note.serverId {
                let body = UpdateNotePayload(
                    noteId: serverId,
                    title: note.title,
                    content: Self.plainTextToHTML(note.body),
                    primaryCollection: note.primaryFolder,
                    secondaryCollections: note.secondaryFolders.isEmpty ? nil : note.secondaryFolders,
                    collectionPinned: note.isFolderPinned,
                    collectionUserOverride: note.isFolderUserOverride
                )
                do {
                    let _: NoteEnvelope = try await api.put("/api/notes/update", body: body)
                    note.needsSync = false
                } catch {
                    Logger.app.error("flush note update \(serverId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
                }
            } else {
                // First upload — we need a spaceId on the server side. Skip if
                // the local note doesn't yet have a synced parent space.
                guard let space = try? resolveServerSpaceId(for: note, context: context) else { continue }
                let body = CreateNotePayload(
                    spaceId: space,
                    title: note.title,
                    content: Self.plainTextToHTML(note.body),
                    noteType: "default",
                    threadId: ""
                )
                do {
                    let resp: CreateNoteResponse = try await api.post("/api/notes/create", body: body)
                    if let serverNote = resp.note {
                        note.serverId = serverNote.id
                    }
                    note.needsSync = false
                } catch {
                    Logger.app.error("flush note create failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func flushDirtyHighlights(context: ModelContext) async {
        let predicate = #Predicate<StudyThread> { $0.needsSync == true }
        let dirty = (try? context.fetch(FetchDescriptor<StudyThread>(predicate: predicate))) ?? []
        for entry in dirty {
            // Highlights require a synced parent note — skip until the parent uploads.
            guard let parent = entry.parentNote, let parentServerId = parent.serverId else { continue }

            if let serverId = entry.serverId {
                let body = PatchHighlightPayload(
                    highlightAccentRaw: entry.highlightAccentRaw,
                    miniNoteBody: entry.miniNoteBody,
                    focusTitle: entry.focusTitle
                )
                do {
                    let _: HighlightEnvelope = try await api.patch("/api/study-threads/\(serverId)", body: body)
                    entry.needsSync = false
                } catch {
                    Logger.app.error("flush highlight update \(serverId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
                }
            } else {
                let body = CreateHighlightPayload(
                    entryKind: entry.entryKindRaw,
                    sourceSnippet: entry.sourceSnippet,
                    highlightAccentRaw: entry.highlightAccentRaw,
                    miniNoteBody: entry.miniNoteBody,
                    focusTitle: entry.focusTitle,
                    scriptureReference: entry.scriptureReference,
                    scripturePassageTranslation: entry.scripturePassageTranslation,
                    scripturePassageExcerpt: entry.scripturePassageExcerpt,
                    anchorLocation: entry.anchorLocation,
                    anchorLength: entry.anchorLength,
                    anchorTextSnapshot: entry.anchorTextSnapshot
                )
                do {
                    let resp: HighlightEnvelope = try await api.post("/api/notes/\(parentServerId)/study-threads", body: body)
                    if let serverEntry = resp.studyThread {
                        entry.serverId = serverEntry.id
                    }
                    entry.needsSync = false
                } catch {
                    Logger.app.error("flush highlight create failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
    }

    private func resolveServerSpaceId(for note: Note, context: ModelContext) throws -> String? {
        guard let localSpaceUUID = note.spaceId else { return nil }
        let predicate = #Predicate<Space> { $0.id == localSpaceUUID }
        let space = try context.fetch(FetchDescriptor<Space>(predicate: predicate)).first
        return space?.serverId
    }
}

/// Read-only snapshot the UI can consult while the SwiftData ingestion path
/// is being finalized.
struct RemoteSnapshot {
    var spaces: [APISpace] = []
    var allNotes: [APINote] = []
    var allHighlights: [APIStudyThreadEntry] = []

    // Legacy per-space keyed views — kept so any remaining call-sites compile.
    var notesBySpace: [String: [APINote]] {
        Dictionary(grouping: allNotes, by: { $0.spaceId ?? "" })
    }
    var highlightsBySpace: [String: [APIStudyThreadEntry]] {
        Dictionary(grouping: allHighlights, by: { $0.spaceId ?? "" })
    }
}

// MARK: - Outbound payloads
// Field names mirror server expectations (see server/routes/notes.ts and
// server/routes/study-threads.ts).

private struct UpdateNotePayload: Encodable {
    let noteId: String
    let title: String
    let content: String
    let primaryCollection: String?
    let secondaryCollections: [String]?
    let collectionPinned: Bool?
    let collectionUserOverride: Bool?
}

private struct CreateNotePayload: Encodable {
    let spaceId: String
    let title: String
    let content: String
    let noteType: String
    let threadId: String
}

private struct NoteEnvelope: Decodable {
    let success: Bool?
    let note: APINote?
}

private struct CreateNoteResponse: Decodable {
    let success: String?
    let note: APINote?
}

private struct PatchHighlightPayload: Encodable {
    let highlightAccentRaw: String
    let miniNoteBody: String
    let focusTitle: String
}

private struct CreateHighlightPayload: Encodable {
    let entryKind: String
    let sourceSnippet: String
    let highlightAccentRaw: String
    let miniNoteBody: String
    let focusTitle: String
    let scriptureReference: String?
    let scripturePassageTranslation: String?
    let scripturePassageExcerpt: String?
    let anchorLocation: Int?
    let anchorLength: Int?
    let anchorTextSnapshot: String?
}

private struct HighlightEnvelope: Decodable {
    let success: Bool?
    let studyThread: APIStudyThreadEntry?
}

private struct DeleteEnvelope: Decodable {
    let success: Bool?
    let deletedId: String?
}

// MARK: - Dirty helpers
//
// Call these at mutation sites so the next `flushPending` will pick them up.
// Keep them on the models so call-sites read like a verb on the model itself.

extension Note {
    /// Stamp this note as locally modified — will upload on the next sync flush.
    func markDirty() {
        needsSync = true
        updatedAt = Date()
    }
}

extension StudyThread {
    /// Stamp this highlight as locally modified — will upload on the next sync flush.
    func markDirty() {
        needsSync = true
        updatedAt = Date()
    }
}

extension Space {
    func markDirty() {
        needsSync = true
        updatedAt = Date()
    }
}
