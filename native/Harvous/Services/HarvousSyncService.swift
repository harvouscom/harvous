import Foundation
import Observation
import SwiftData
import os

private let kLastSyncCursorKey = "HarvousSyncCursor"

/// Errors surfaced by ``HarvousSyncService/refreshFromServer(context:)``.
enum HarvousSyncRefreshError: Error, LocalizedError {
    case requiresProductionAPI
    case notSignedIn
    case unsyncedLocalChanges(count: Int)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .requiresProductionAPI:
            return "Switch to the Debug-Prod scheme to refresh from production."
        case .notSignedIn:
            return "Sign in to refresh from your account."
        case .unsyncedLocalChanges(let count):
            let noun = count == 1 ? "change" : "changes"
            return "\(count) local \(noun) couldn't upload. Check your connection and try again."
        case .transport(let message):
            return message
        }
    }
}

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
    /// True while SwiftData ingest from a pull is in progress (chunked on the main actor).
    private(set) var isIngesting = false
    private(set) var lastError: HarvousAPIError?

    private static let ingestNoteChunkSize = 25

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

    /// True while we're in a known-unreachable state, so repeated polls don't
    /// spam an `error`-level log on every cycle while offline. Flips back on the
    /// next successful pull (logged once as connectivity restored).
    private var isOffline = false

    /// True while local-dev writes are deferred (localhost down). Flips back on
    /// the next successful flush upload.
    private var isWriteOffline = false

    /// Tracks the userId the last successful sync was for, so we can detect
    /// account switches (e.g. test→live Clerk keys) and re-bootstrap.
    private var lastSyncedUserId: String? {
        get { UserDefaults.standard.string(forKey: "HarvousSyncLastUserId") }
        set { UserDefaults.standard.set(newValue, forKey: "HarvousSyncLastUserId") }
    }

    private init(api: HarvousAPIClient = .shared) {
        self.api = api
    }

    /// Uploads pending local changes, then replaces the on-device library with a
    /// full server bootstrap. Requires a production API base (Debug-Prod / Release).
    func refreshFromServer(context: ModelContext) async throws {
        guard HarvousClerkBridge.shared.isAuthenticated else {
            throw HarvousSyncRefreshError.notSignedIn
        }
        guard !api.isLocalDevBase else {
            throw HarvousSyncRefreshError.requiresProductionAPI
        }

        HarvousSyncScheduler.cancelPendingScheduledSync()
        await flushPending(context: context)

        let pending = pendingLocalChangeCount(context: context)
        if pending > 0 {
            throw HarvousSyncRefreshError.unsyncedLocalChanges(count: pending)
        }

        lastSyncCursor = nil
        HarvousTombstoneQueue.clearAll()
        wipeLocalStore(context: context)
        HarvousSpaceBootstrap.ensureBootstrap(modelContext: context)

        await pullAll(context: context)
        if let err = lastError {
            throw HarvousSyncRefreshError.transport(err.localizedDescription ?? "Sync failed.")
        }

        isOffline = false
        isWriteOffline = false
        Logger.app.info("Sync refresh from server completed.")
    }

    /// Drops all SwiftData rows so the next bootstrap starts from a clean slate.
    func wipeLocalStore(context: ModelContext) {
        try? context.delete(model: Note.self)
        try? context.delete(model: NoteSnapshot.self)
        try? context.delete(model: StudyThread.self)
        try? context.delete(model: Space.self)
        try? context.delete(model: SpaceMember.self)
        try? context.delete(model: SpaceInvite.self)
        try? context.delete(model: SpaceJoinLink.self)
        try? context.save()
    }

    /// Count of local rows still waiting to upload (notes, highlights, tombstones).
    func pendingLocalChangeCount(context: ModelContext) -> Int {
        let dirtyNotes = (try? context.fetch(FetchDescriptor<Note>(predicate: #Predicate { $0.needsSync == true }))) ?? []
        let unuploadedNotes = (try? context.fetch(FetchDescriptor<Note>(predicate: #Predicate { $0.serverId == nil }))) ?? []
        var seenNotes = Set<UUID>()
        for note in dirtyNotes + unuploadedNotes {
            seenNotes.insert(note.id)
        }

        let dirtyHighlights = (try? context.fetch(
            FetchDescriptor<StudyThread>(predicate: #Predicate { $0.needsSync == true })
        )) ?? []

        return seenNotes.count + dirtyHighlights.count + HarvousTombstoneQueue.all().count
    }

    /// Resets local sync state so the next pull does a full bootstrap.
    /// Called when the authenticated user changes.
    func resetIfUserChanged(currentUserId: String?) {
        guard let currentUserId, !currentUserId.isEmpty else { return }
        if lastSyncedUserId != currentUserId {
            let previous = lastSyncedUserId ?? "nil"
            lastSyncCursor = nil
            lastSyncedUserId = currentUserId
            Logger.app.info("Sync reset: user changed from \(previous, privacy: .public) to \(currentUserId, privacy: .public)")
        }
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
            if isOffline {
                isOffline = false
                Logger.app.info("Sync connectivity restored.")
            }
        } catch let apiErr as HarvousAPIError {
            lastError = apiErr
            switch apiErr {
            case .transport:
                noteOfflineFailure(apiErr.localizedDescription)
            case .unauthorized:
                // Expected in Debug when local dev is down and GETs fall back to prod
                // with a pk_test_ token — log once, not every sync cycle.
                noteOfflineFailure("Remote API session not valid (local dev server may be down).")
            default:
                Logger.app.error("Sync pull failed: \(apiErr.localizedDescription, privacy: .public)")
            }
        } catch {
            lastError = .transport(error)
            noteOfflineFailure(error.localizedDescription)
        }
    }

    /// Records an unreachable-server failure, logging at `error` level only on
    /// the first failure after being online to avoid per-poll log spam.
    private func noteOfflineFailure(_ description: String) {
        guard !isOffline else { return }
        isOffline = true
        Logger.app.error("Sync pull failed (transport): \(description, privacy: .public)")
    }

    /// Records a deferred local-dev write failure, logging once until the next
    /// successful upload so per-note flush retries don't spam the console.
    private func noteWriteOfflineFailure(_ description: String) {
        guard !isWriteOffline else { return }
        isWriteOffline = true
        Logger.app.error("Sync flush deferred (local dev API unreachable): \(description, privacy: .public)")
    }

    /// Full library pull from `/api/sync/bootstrap`. Replaces per-space N+1 polling.
    private func bootstrap(context: ModelContext?) async throws {
        // Decode the (potentially large) bootstrap payload off the main actor so
        // first-sync JSON parsing doesn't hitch the UI.
        let payload: APIBootstrapResponse = try await api.getDecodedOffMain("/api/sync/bootstrap")
        lastSyncCursor = payload.cursor
        reconcileSimpleNoteId(from: payload.userMetadata)

        remote.spaces = payload.spaces
        remote.allNotes = payload.notes
        remote.allHighlights = payload.studyThreadEntries ?? []
        remote.deletedNoteIds = payload.deletedNoteIds ?? []
        remote.deletedHighlightIds = payload.deletedStudyThreadIds ?? []
        lastPullAt = Date()

        Logger.app.info("Sync bootstrap: \(payload.spaces.count) spaces, \(payload.notes.count) notes, \(self.remote.allHighlights.count) highlights")

        if let context {
            await ingestBootstrap(context: context)
            if payload.notesTruncated == true {
                Logger.app.warning("Bootstrap notes truncated; paging /api/sync/changes to catch up.")
                try await fetchChanges(context: context)
            }
        }
    }

    /// Delta pull from `/api/sync/changes?since=<cursor>`. Pages while `hasMore` is set.
    private func fetchChanges(context: ModelContext?) async throws {
        guard lastSyncCursor != nil else { return }

        var mergedSpaces: [APISpace] = []
        var mergedNotes: [APINote] = []
        var mergedHighlights: [APIStudyThreadEntry] = []
        var mergedDeletedNoteIds = Set<String>()
        var mergedDeletedHighlightIds = Set<String>()
        var sawUpserts = false
        var hasMore = true

        while hasMore {
            guard let cursor = lastSyncCursor else { break }
            let payload: APIChangesResponse = try await api.getDecodedOffMain(
                "/api/sync/changes",
                query: ["since": cursor]
            )
            lastSyncCursor = payload.cursor
            reconcileSimpleNoteId(from: payload.userMetadata)
            hasMore = payload.hasMore == true

            mergedDeletedNoteIds.formUnion(payload.deletedNoteIds ?? [])
            mergedDeletedHighlightIds.formUnion(payload.deletedStudyThreadIds ?? [])

            if payload.hasChanges {
                sawUpserts = true
                mergedSpaces.append(contentsOf: payload.spaces)
                mergedNotes.append(contentsOf: payload.notes)
                mergedHighlights.append(contentsOf: payload.studyThreadEntries ?? [])
            }
        }

        let hasDeletions = !mergedDeletedNoteIds.isEmpty || !mergedDeletedHighlightIds.isEmpty
        guard sawUpserts || hasDeletions else { return }

        remote.spaces = mergedSpaces
        remote.allNotes = mergedNotes
        remote.allHighlights = mergedHighlights
        remote.deletedNoteIds = Array(mergedDeletedNoteIds)
        remote.deletedHighlightIds = Array(mergedDeletedHighlightIds)
        lastPullAt = Date()
        Logger.app.info(
            "Sync changes: \(mergedNotes.count) notes, \(mergedHighlights.count) highlights, \(mergedDeletedNoteIds.count) note tombstones"
        )
        if let context { await ingestBootstrap(context: context) }
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
    func ingestBootstrap(context: ModelContext) async {
        isIngesting = true
        defer { isIngesting = false }

        let pendingNoteDeletes = Set(
            HarvousTombstoneQueue.all()
                .filter { $0.kind == .note }
                .map(\.serverId)
        )
        let deletedNoteIds = Set(remote.deletedNoteIds).union(pendingNoteDeletes)
        let deletedHighlightIds = Set(remote.deletedHighlightIds)
        if !deletedNoteIds.isEmpty {
            pruneDeletedNotes(serverIds: deletedNoteIds, context: context)
        }
        if !deletedHighlightIds.isEmpty {
            pruneDeletedHighlights(serverIds: deletedHighlightIds, context: context)
        }

        linkPersonalHomeSpaceIfNeeded(serverSpaces: remote.spaces, context: context)
        for apiSpace in remote.spaces {
            upsertSpace(apiSpace, context: context)
        }

        let notesToIngest = remote.allNotes.filter { note in
            note.noteType != "scripture" && !pendingNoteDeletes.contains(note.id)
        }
        var index = 0
        while index < notesToIngest.count {
            let end = min(index + Self.ingestNoteChunkSize, notesToIngest.count)
            for apiNote in notesToIngest[index..<end] {
                upsertNote(apiNote, context: context)
            }
            index = end
            if index < notesToIngest.count {
                await Task.yield()
            }
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

    private func pruneDeletedNotes(serverIds: Set<String>, context: ModelContext) {
        for serverId in serverIds {
            let predicate = #Predicate<Note> { $0.serverId == serverId }
            guard let note = try? context.fetch(FetchDescriptor<Note>(predicate: predicate)).first else { continue }
            HarvousVaultExporter.removeMirrorFiles(for: note, modelContext: context)
            HarvousNoteSpotlightIndexer.removeNote(id: note.id)
            context.delete(note)
        }
    }

    private func pruneDeletedHighlights(serverIds: Set<String>, context: ModelContext) {
        for serverId in serverIds {
            let predicate = #Predicate<StudyThread> { $0.serverId == serverId }
            guard let highlight = try? context.fetch(FetchDescriptor<StudyThread>(predicate: predicate)).first else { continue }
            context.delete(highlight)
        }
    }

    /// Legacy shim — kept so call-sites that pass a context still compile.
    func ingestIntoSwiftData(context: ModelContext) async {
        await ingestBootstrap(context: context)
    }

    /// On first sync, the local personal home space has no serverId. If the server
    /// returns a space and our personal home is unlinked, adopt the first server
    /// space as the personal home's server identity so flushDirtyNotes can upload.
    private func linkPersonalHomeSpaceIfNeeded(serverSpaces: [APISpace], context: ModelContext) {
        guard let firstServerSpace = serverSpaces.first else { return }
        let homeId = HarvousSpaceBootstrap.personalHomeSpaceId
        let homePredicate = #Predicate<Space> { $0.id == homeId }
        guard let homeSpace = try? context.fetch(FetchDescriptor<Space>(predicate: homePredicate)).first else { return }
        if homeSpace.serverId != nil { return }

        // Check if this server space is already claimed by another local row.
        let sid = firstServerSpace.id
        let existingPredicate = #Predicate<Space> { $0.serverId == sid }
        if let duplicate = try? context.fetch(FetchDescriptor<Space>(predicate: existingPredicate)).first,
           duplicate.id != homeId {
            // Another local space already maps to this server space — migrate its
            // serverId to the personal home and delete the duplicate.
            homeSpace.serverId = sid
            if let name = firstServerSpace.displayName { homeSpace.name = name }
            context.delete(duplicate)
        } else {
            homeSpace.serverId = sid
            if let name = firstServerSpace.displayName { homeSpace.name = name }
        }
        Logger.app.info("Linked personal home space to server space \(sid, privacy: .public)")
    }

    private func upsertSpace(_ api: APISpace, context: ModelContext) {
        let id = api.id
        let predicate = #Predicate<Space> { $0.serverId == id }
        let existing = try? context.fetch(FetchDescriptor<Space>(predicate: predicate)).first
        if let existing {
            if existing.needsSync { return }
            if let name = api.displayName { existing.name = name }
            existing.updatedAt = Date()
        } else {
            let space = Space(
                name: api.displayName ?? "Untitled space",
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
            if existing.needsSync {
                // Preserve local editor content while still reconciling lightweight server fields
                // that are commonly changed on other surfaces (share/pin/folder metadata).
                if let isPub = api.isPublic { existing.isPublic = isPub }
                if let pinned = api.isPinned { existing.isPinned = pinned }
                existing.shareToken = api.shareToken
                if let encrypted = api.contentEncrypted { existing.contentEncrypted = encrypted }
                if let folder = api.primaryCollection { existing.primaryFolder = folder.isEmpty ? nil : folder }
                if let secondaries = api.secondaryCollections { existing.secondaryFolders = secondaries }
                if let pinned = api.collectionPinned { existing.isFolderPinned = pinned }
                if let userOverride = api.collectionUserOverride { existing.isFolderUserOverride = userOverride }
                if let simpleId = api.simpleNoteId, existing.simpleNoteId == nil { existing.simpleNoteId = simpleId }
                return
            }
            if let title = api.title { existing.title = title }
            if let content = api.content {
                existing.body = Self.htmlToPlainText(content)
                existing.serverContentHTML = content
                existing.applyServerScripturePillAccents(HarvousContentBridge.extractPillAccents(fromHTML: content))
            }
            if let isPub = api.isPublic { existing.isPublic = isPub }
            if let pinned = api.isPinned { existing.isPinned = pinned }
            existing.shareToken = api.shareToken
            if let encrypted = api.contentEncrypted { existing.contentEncrypted = encrypted }
            // Folder / collection fields — server is authoritative on pull.
            if let folder = api.primaryCollection { existing.primaryFolder = folder.isEmpty ? nil : folder }
            if let secondaries = api.secondaryCollections { existing.secondaryFolders = secondaries }
            if let pinned = api.collectionPinned { existing.isFolderPinned = pinned }
            if let userOverride = api.collectionUserOverride { existing.isFolderUserOverride = userOverride }
            if let simpleId = api.simpleNoteId, existing.simpleNoteId == nil { existing.simpleNoteId = simpleId }
            if let serverUpdated = Self.parseISO8601(api.updatedAt) {
                existing.updatedAt = serverUpdated
            }
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
            note.serverContentHTML = api.content
            note.applyServerScripturePillAccents(HarvousContentBridge.extractPillAccents(fromHTML: api.content ?? ""))
            note.isPublic = api.isPublic ?? false
            note.isPinned = api.isPinned ?? false
            note.shareToken = api.shareToken
            note.contentEncrypted = api.contentEncrypted ?? false
            note.simpleNoteId = api.simpleNoteId
            note.addedBy = api.addedBy ?? "user"
            if let serverCreated = Self.parseISO8601(api.createdAt) {
                note.createdAt = serverCreated
            }
            if let serverUpdated = Self.parseISO8601(api.updatedAt) {
                note.updatedAt = serverUpdated
            } else if let serverCreated = Self.parseISO8601(api.createdAt) {
                note.updatedAt = serverCreated
            }
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

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static func parseISO8601(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        if let d = iso8601Formatter.date(from: string) { return d }
        // Fallback without fractional seconds
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        return fallback.date(from: string)
    }

    /// HTML to upload for an existing note. Non-destructive guard: if the local body
    /// still matches what the server last sent (and accents are unchanged), flush the
    /// original server HTML verbatim so web-authored formatting the plain-text `body`
    /// cannot represent (bold, headings) survives untouched. Only when the body has
    /// actually changed locally do we regenerate HTML from the native serialization.
    static func outboundHTML(for note: Note) -> String {
        let accents = note.scripturePillAccentMap
        if let serverHTML = note.serverContentHTML,
           !serverHTML.isEmpty,
           htmlToPlainText(serverHTML) == note.body,
           HarvousContentBridge.extractPillAccents(fromHTML: serverHTML) == accents {
            return serverHTML
        }
        return HarvousContentBridge.markdownToHTML(note.body, accents: accents)
    }

    // MARK: - Write path

    /// Walks the SwiftData store for dirty rows and pushes them upstream.
    /// Idempotent: failed rows stay dirty for the next attempt.
    /// - Returns: `true` when at least one tombstone, note, or highlight was applied on the server.
    @discardableResult
    func flushPending(context: ModelContext) async -> Bool {
        if isFlushing { return false }
        isFlushing = true
        defer { isFlushing = false }

        if api.isLocalDevBase, await LocalDevAPIGate.shared.isInCooldown() { return false }

        let didSyncTombstones = await flushTombstones()
        let didSyncNotes = await flushDirtyNotes(context: context)
        let didSyncHighlights = await flushDirtyHighlights(context: context)
        let didSync = didSyncTombstones || didSyncNotes || didSyncHighlights

        do { try context.save() } catch {
            Logger.app.error("SwiftData save after flush failed: \(error.localizedDescription, privacy: .public)")
        }
        lastFlushAt = Date()
        return didSync
    }

    @discardableResult
    private func flushTombstones() async -> Bool {
        var didSync = false
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
                isWriteOffline = false
                didSync = true
            } catch HarvousAPIError.http(let status, _) where status == 404 {
                // Already gone server-side — drop the tombstone.
                HarvousTombstoneQueue.remove(tombstone)
                isWriteOffline = false
                didSync = true
            } catch HarvousAPIError.transport(let underlying) {
                noteWriteOfflineFailure(underlying.localizedDescription)
            } catch {
                Logger.app.error("flush tombstone \(tombstone.serverId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        return didSync
    }

    @discardableResult
    private func flushDirtyNotes(context: ModelContext) async -> Bool {
        // Upload notes that are explicitly dirty (edited locally)
        let dirtyPredicate = #Predicate<Note> { $0.needsSync == true }
        let dirty = (try? context.fetch(FetchDescriptor<Note>(predicate: dirtyPredicate))) ?? []

        // Also catch notes that were created locally but never uploaded (no serverId).
        // These may not be marked dirty if created before the markDirty-on-create fix.
        let unuploadedPredicate = #Predicate<Note> { $0.serverId == nil }
        let unuploaded = (try? context.fetch(FetchDescriptor<Note>(predicate: unuploadedPredicate))) ?? []

        // Merge both sets, deduplicate by id
        var seen = Set<UUID>()
        var allToFlush: [Note] = []
        for note in dirty + unuploaded {
            if seen.insert(note.id).inserted {
                allToFlush.append(note)
            }
        }

        var didSync = false
        for note in allToFlush {
            if note.serverId != nil {
                let updated = await flushNoteUpdate(note, context: context)
                if updated {
                    didSync = true
                    continue
                }
            }
            if await flushNoteCreate(note, context: context) {
                didSync = true
            }
        }
        return didSync
    }

    /// Returns `true` when the note was updated on the server.
    private func flushNoteUpdate(_ note: Note, context: ModelContext) async -> Bool {
        guard let serverId = note.serverId else { return false }
        let body = UpdateNotePayload(
            noteId: serverId,
            title: note.title,
            content: Self.outboundHTML(for: note),
            isPinned: note.isPinned,
            primaryCollection: note.primaryFolder,
            secondaryCollections: note.secondaryFolders.isEmpty ? nil : note.secondaryFolders,
            collectionPinned: note.isFolderPinned,
            collectionUserOverride: note.isFolderUserOverride
        )
        do {
            let _: NoteEnvelope = try await api.put("/api/notes/update", body: body)
            note.needsSync = false
            note.syncError = nil
            isWriteOffline = false
            return true
        } catch HarvousAPIError.http(let status, _) where status == 404 {
            note.serverId = nil
            note.syncError = nil
            Logger.app.info("flush note update \(serverId, privacy: .public) missing on server — will re-create.")
            return false
        } catch let apiErr as HarvousAPIError where apiErr.isPermanentClientError {
            note.needsSync = false
            note.syncError = apiErr.errorDescription
            Logger.app.error("flush note update \(serverId, privacy: .public) rejected (permanent), giving up: \(apiErr.localizedDescription, privacy: .public)")
            return true
        } catch HarvousAPIError.transport(let underlying) {
            noteWriteOfflineFailure(underlying.localizedDescription)
            return false
        } catch {
            Logger.app.error("flush note update \(serverId, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    @discardableResult
    private func flushNoteCreate(_ note: Note, context: ModelContext) async -> Bool {
        let spaceId = (try? resolveServerSpaceId(for: note, context: context)) ?? ""
        let body = CreateNotePayload(
            spaceId: spaceId,
            title: note.title,
            content: HarvousContentBridge.markdownToHTML(note.body, accents: note.scripturePillAccentMap),
            noteType: "default",
            threadId: ""
        )
        do {
            let resp: CreateNoteResponse = try await api.post("/api/notes/create", body: body)
            if let serverNote = resp.note {
                note.serverId = serverNote.id
            }
            note.needsSync = false
            note.syncError = nil
            isWriteOffline = false
            return true
        } catch let apiErr as HarvousAPIError where apiErr.isPermanentClientError {
            note.needsSync = false
            note.syncError = apiErr.errorDescription
            Logger.app.error("flush note create rejected (permanent), giving up: \(apiErr.localizedDescription, privacy: .public)")
            return true
        } catch HarvousAPIError.transport(let underlying) {
            noteWriteOfflineFailure(underlying.localizedDescription)
            return false
        } catch {
            Logger.app.error("flush note create failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    @discardableResult
    private func flushDirtyHighlights(context: ModelContext) async -> Bool {
        let predicate = #Predicate<StudyThread> { $0.needsSync == true }
        let dirty = (try? context.fetch(FetchDescriptor<StudyThread>(predicate: predicate))) ?? []
        var didSync = false
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
                    isWriteOffline = false
                    didSync = true
                } catch HarvousAPIError.transport(let underlying) {
                    noteWriteOfflineFailure(underlying.localizedDescription)
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
                    isWriteOffline = false
                    didSync = true
                } catch HarvousAPIError.transport(let underlying) {
                    noteWriteOfflineFailure(underlying.localizedDescription)
                } catch {
                    Logger.app.error("flush highlight create failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
        return didSync
    }

    private func resolveServerSpaceId(for note: Note, context: ModelContext) throws -> String? {
        let localSpaceUUID = note.resolvedSpaceId(in: context)
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
    var deletedNoteIds: [String] = []
    var deletedHighlightIds: [String] = []

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
    let isPinned: Bool?
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
    let note: APINote?

    private enum CodingKeys: String, CodingKey {
        case success, note
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.note = try container.decodeIfPresent(APINote.self, forKey: .note)
    }
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
    /// Stamp metadata-only changes (pin, share flags) without bumping list sort order.
    func markDirtyMetadata() {
        needsSync = true
        HarvousSyncScheduler.scheduleFlush()
    }

    /// Stamp this note as locally modified — will upload on the next sync flush.
    func markDirty() {
        needsSync = true
        updatedAt = Date()
        HarvousSyncScheduler.scheduleFlush()
    }
}

extension StudyThread {
    /// Stamp this highlight as locally modified — will upload on the next sync flush.
    func markDirty() {
        needsSync = true
        updatedAt = Date()
        HarvousSyncScheduler.scheduleFlush()
    }
}

extension Space {
    func markDirty() {
        needsSync = true
        updatedAt = Date()
        HarvousSyncScheduler.scheduleFlush()
    }
}
