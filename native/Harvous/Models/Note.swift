import Foundation
import SwiftData

@Model
final class Note {
    var id: UUID
    var title: String
    var body: String                    // plain text body, pills re-detected on open
    var detectedRefs: [String]          // e.g. ["John 3:16", "Phil 4:13"]
    /// Legacy — unused in UI; kept for SwiftData compatibility.
    var threadColor: String?
    var threadName: String?
    /// Smart folder label (theme / subject) from on-device keyword tagging.
    @Attribute(originalName: "primaryCollection") var primaryFolder: String?
    /// Additional auto- or user-managed folder buckets beyond `primaryFolder`.
    @Attribute(originalName: "secondaryCollections") var secondaryFolders: [String] = []
    /// User-set folder should not be replaced by auto-tagging.
    @Attribute(originalName: "isCollectionUserOverride") var isFolderUserOverride: Bool = false
    /// Optional user pin to keep current folder fixed.
    @Attribute(originalName: "isCollectionPinned") var isFolderPinned: Bool = false
    /// Confidence of the last auto-assigned primary folder.
    @Attribute(originalName: "collectionAutoConfidence") var folderAutoConfidence: Double? = nil
    /// Timestamp of the last auto-assignment of primary folder.
    @Attribute(originalName: "collectionLastAutoUpdatedAt") var folderLastAutoUpdatedAt: Date? = nil
    var tags: [String]
    /// User pin (note-level); surface in list/chrome and keep stable under auto-tag churn.
    var isPinned: Bool = false
    /// Scoped to a `Space.id`; `nil` is treated as the default personal home during migration.
    var spaceId: UUID?
    /// Server UUID when syncing (v2). Always `nil` in v1.
    var cloudId: UUID?
    /// Tracks rows pending upload in v2. Unused locally in v1.
    var needsSync: Bool = false
    /// Cached filename (no path) last written under the space folder in the Markdown vault mirror.
    var vaultFilename: String?
    /// Optional 1–7 “stickiness” score (Steph-style rating); `nil` means unset.
    var rating: Int?
    /// Local per-device sequential ID for human-readable labels (`N001`), assigned on create/backfill.
    /// TODO: When native cloud sync lands, reconcile with server `simpleNoteId` on conflict.
    var simpleNoteId: Int?
    /// Source attribution (`user`, `harvous`, `mcp-*`, etc.). Defaults to user until cloud sync maps server values.
    var addedBy: String = "user"
    var createdAt: Date
    var updatedAt: Date

    /// Per-note + per-reference scripture pill accent overrides.
    /// Encoded JSON: `{ "John 3:16": "amber", "Phil 4:13": "teal" }` — keys are the pill reference
    /// string (translation-agnostic), values are `StudyHighlightAccentToken.rawValue`. Pills with
    /// no entry here render with the neutral default palette (space theme intentionally ignored).
    var scripturePillAccentsJSON: String = "{}"

    @Relationship(deleteRule: .cascade, inverse: \StudyThread.parentNote)
    var studyThreads: [StudyThread] = []

    /// Time-Machine-style version history. Cascaded so deleting a note disposes of its snapshots.
    @Relationship(deleteRule: .cascade)
    var snapshots: [NoteSnapshot] = []

    init(
        title: String = "",
        body: String = "",
        detectedRefs: [String] = [],
        threadColor: String? = nil,
        threadName: String? = nil,
        primaryFolder: String? = nil,
        secondaryFolders: [String] = [],
        isFolderUserOverride: Bool = false,
        isFolderPinned: Bool = false,
        folderAutoConfidence: Double? = nil,
        folderLastAutoUpdatedAt: Date? = nil,
        tags: [String] = [],
        spaceId: UUID? = nil,
        cloudId: UUID? = nil,
        needsSync: Bool = false,
        isPinned: Bool = false,
        vaultFilename: String? = nil,
        rating: Int? = nil,
        simpleNoteId: Int? = nil
    ) {
        self.id = UUID()
        self.title = title
        self.body = body
        self.detectedRefs = detectedRefs
        self.threadColor = threadColor
        self.threadName = threadName
        self.primaryFolder = primaryFolder
        self.secondaryFolders = secondaryFolders
        self.isFolderUserOverride = isFolderUserOverride
        self.isFolderPinned = isFolderPinned
        self.folderAutoConfidence = folderAutoConfidence
        self.folderLastAutoUpdatedAt = folderLastAutoUpdatedAt
        self.isPinned = isPinned
        self.tags = tags
        self.spaceId = spaceId
        self.cloudId = cloudId
        self.needsSync = needsSync
        self.vaultFilename = vaultFilename
        self.rating = rating
        self.simpleNoteId = simpleNoteId
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    /// Short excerpt for card display
    var excerpt: String {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 120 else { return trimmed }
        return String(trimmed.prefix(120)) + "…"
    }

    /// Primary scripture reference for card badge
    var primaryRef: String? { detectedRefs.first }

    // MARK: - Scripture pill accent map

    private var decodedScripturePillAccents: [String: String] {
        guard let data = scripturePillAccentsJSON.data(using: .utf8) else { return [:] }
        return (try? JSONDecoder().decode([String: String].self, from: data)) ?? [:]
    }

    private func encodeScripturePillAccents(_ map: [String: String]) {
        guard let data = try? JSONEncoder().encode(map),
              let str = String(data: data, encoding: .utf8) else { return }
        scripturePillAccentsJSON = str
    }

    /// Raw accent token value for a given reference, or `nil` if none set (use neutral default).
    func scripturePillAccentRaw(forReference reference: String) -> String? {
        decodedScripturePillAccents[reference]
    }

    /// Persist or clear a reference's accent. Pass `nil` to fall back to the neutral default.
    func setScripturePillAccent(_ accentRaw: String?, forReference reference: String) {
        var map = decodedScripturePillAccents
        if let accentRaw {
            map[reference] = accentRaw
        } else {
            map.removeValue(forKey: reference)
        }
        encodeScripturePillAccents(map)
        updatedAt = Date()
    }
}

extension Note {
    func normalizedSecondaryFolderLabels() -> [String] {
        secondaryFolders.compactMap { s in
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
    }

    /// Primary first, then secondaries; case-insensitive dedupe. Omits legacy “My Pile” thread title used as folder.
    func allFolderMembershipLabels() -> [String] {
        var out: [String] = []
        if let p = primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines),
           !p.isEmpty,
           !Self.isMyPileFolderTitle(p) {
            out.append(p)
        }
        for s in normalizedSecondaryFolderLabels() {
            guard !Self.isMyPileFolderTitle(s) else { continue }
            if out.contains(where: { $0.caseInsensitiveCompare(s) == .orderedSame }) { continue }
            out.append(s)
        }
        return out
    }

    func folderChipPrimaryLabelText() -> String? {
        allFolderMembershipLabels().first
    }

    func folderChipAdditionalCount() -> Int {
        let labels = allFolderMembershipLabels()
        guard !labels.isEmpty else { return 0 }
        return max(0, labels.count - 1)
    }

    /// Same rules as web `isMyPileDisplayTitle` (`src/utils/my-pile-thread.ts`).
    private static func isMyPileFolderTitle(_ title: String) -> Bool {
        let n = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return n == "my pile" || n == "unorganized" || n == "sort later"
    }

    func noteBelongsToFolderBucket(_ bucket: String?) -> Bool {
        let labels = allFolderMembershipLabels()
        if let b = bucket?.trimmingCharacters(in: .whitespacesAndNewlines), !b.isEmpty {
            return labels.contains { $0.caseInsensitiveCompare(b) == .orderedSame }
        }
        return labels.isEmpty
    }

    /// Canonical book indices from persisted `detectedRefs` (parsed references only).
    func scriptureBookIndicesFromDetectedRefs() -> Set<Int> {
        var s = Set<Int>()
        for r in detectedRefs {
            guard let p = ScriptureReferenceParser.parse(r) else { continue }
            s.insert(p.bookIndex)
        }
        return s
    }

    func noteBelongsToScriptureBook(_ bookIndex: Int) -> Bool {
        scriptureBookIndicesFromDetectedRefs().contains(bookIndex)
    }

    /// True when any parsed `detectedRefs` entry matches this canonical passage (including verse range).
    func noteBelongsToScripturePassage(_ passage: ParsedScriptureFields) -> Bool {
        detectedRefs.contains { ref in
            guard let p = ScriptureReferenceParser.parse(ref) else { return false }
            return p == passage
        }
    }

    /// Source name for inspector rows where the label is already "Added by".
    var addedBySourceLabel: String {
        addedBy == "harvous" ? "Harvous" : "You"
    }
}
