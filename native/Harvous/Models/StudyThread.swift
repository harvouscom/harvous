import Foundation
import SwiftData

/// A native deep-study branch anchored to a parent note (product: “Thread”).
/// Named `StudyThread` to avoid colliding with Foundation’s `Thread` type.
@Model
final class StudyThread {
    enum EntryKind: String, CaseIterable {
        case workspace
        case miniNote
        case linkedNote
        case scriptureLink
    }

    @Attribute(.unique) var id: UUID
    var createdAt: Date
    var updatedAt: Date

    /// Resolved space for scoped queries (matches `Note.resolvedSpaceId()`).
    /// Default matches personal home so SwiftData lightweight migration can populate older rows.
    var spaceId: UUID = HarvousSpaceBootstrap.personalHomeSpaceId

    /// Stable parent link for predicates; kept in sync with `parentNote`.
    var parentNoteId: UUID

    /// Excerpt from the note that this thread extends.
    var sourceSnippet: String

    /// Title or framing question for the line of study.
    var focusTitle: String

    /// Deeper notes for this thread (plain text for MVP).
    var notesBody: String = ""

    var isArchived: Bool = false

    /// Suggested prompts; can grow into structured questions later.
    var suggestedQuestions: [String] = []

    /// One entry per resource line (URL or free text) for MVP.
    var resourceLines: [String] = []

    /// Defines whether this row is classic deep workspace, lightweight mini-note, or a linked-note marker.
    var entryKindRaw: String = StudyThread.EntryKind.workspace.rawValue
    /// Lightweight annotation body used by mini-note entries.
    var miniNoteBody: String = ""
    /// Linked-note destination for create-and-stay flow.
    var linkedNoteId: UUID?
    /// Cached title for linked-note marker rendering.
    var linkedNoteTitle: String = ""

    /// Optional anchor in **`harvousExpandedPlainText` UTF-16** coordinates (`HarvousStudyHighlightMapper`).
    var anchorLocation: Int?
    var anchorLength: Int?
    /// Snapshot of anchored excerpt for reconcile when note body edits drift.
    var anchorTextSnapshot: String?

    /// Scripture reference backing `.scriptureLink` highlights.
    var scriptureReference: String?

    /// Inline highlight pastel override (`StudyHighlightAccentToken.rawValue`). Empty resolves to `.auto` (entry-kind hues).
    var highlightAccentRaw: String = StudyHighlightAccentToken.auto.rawValue

    var parentNote: Note?

    init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        spaceId: UUID,
        parentNoteId: UUID,
        sourceSnippet: String,
        focusTitle: String,
        notesBody: String = "",
        isArchived: Bool = false,
        suggestedQuestions: [String] = [],
        resourceLines: [String] = [],
        entryKindRaw: String = EntryKind.workspace.rawValue,
        miniNoteBody: String = "",
        linkedNoteId: UUID? = nil,
        linkedNoteTitle: String = "",
        anchorLocation: Int? = nil,
        anchorLength: Int? = nil,
        anchorTextSnapshot: String? = nil,
        scriptureReference: String? = nil,
        highlightAccentRaw: String = StudyHighlightAccentToken.auto.rawValue,
        parentNote: Note? = nil
    ) {
        self.id = id
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.spaceId = spaceId
        self.parentNoteId = parentNoteId
        self.sourceSnippet = sourceSnippet
        self.focusTitle = focusTitle
        self.notesBody = notesBody
        self.isArchived = isArchived
        self.suggestedQuestions = suggestedQuestions
        self.resourceLines = resourceLines
        self.entryKindRaw = entryKindRaw
        self.miniNoteBody = miniNoteBody
        self.linkedNoteId = linkedNoteId
        self.linkedNoteTitle = linkedNoteTitle
        self.anchorLocation = anchorLocation
        self.anchorLength = anchorLength
        self.anchorTextSnapshot = anchorTextSnapshot
        self.scriptureReference = scriptureReference
        self.highlightAccentRaw = highlightAccentRaw
        self.parentNote = parentNote
    }

    var sourceExcerptForList: String {
        let t = sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.count <= 140 else { return String(t.prefix(140)) + "…" }
        return t
    }

    var entryKind: EntryKind {
        get { EntryKind(rawValue: entryKindRaw) ?? .workspace }
        set { entryKindRaw = newValue.rawValue }
    }

    /// Kinds that render as inline prose highlights when anchored.
    static let anchoredHighlightKinds: Set<EntryKind> = [.miniNote, .linkedNote, .scriptureLink]

    /// True when inline prose highlight should paint (`anchorLocation` non-negative and positive length).
    /// Unanchored linked-note markers use sentinels `anchorLocation == -1`, `anchorLength == 0`.
    var hasPersistedHighlightAnchor: Bool {
        guard StudyThread.anchoredHighlightKinds.contains(entryKind) else { return false }
        guard let loc = anchorLocation, let len = anchorLength, len > 0 else { return false }
        return loc >= 0
    }

    /// Repairs UTF-16 anchor offsets relative to expanded plain body (`harvousExpandedPlainText`). Mutates persisted anchor fields when drift repairs succeed.
    func resolveHighlightRangeAgainstExpandedBody(_ expandedPlain: String, searchRadius: Int = 112) -> NSRange? {
        guard StudyThread.anchoredHighlightKinds.contains(entryKind),
              let snap = anchorTextSnapshot,
              !snap.isEmpty else { return nil }

        let whole = expandedPlain as NSString
        let len = whole.length
        guard len > 0 else { clearAnchors(); return nil }

        let needleLen = (snap as NSString).length
        guard needleLen > 0, needleLen <= len else { clearAnchors(); return nil }

        if anchorLocation == nil || anchorLength == nil || (anchorLength ?? 0) == 0 {
            let r = whole.range(of: snap)
            guard r.location != NSNotFound else { return nil }
            persistAnchors(r, expandedPlain)
            return r
        }

        guard let loc = anchorLocation, let anchoredLen = anchorLength,
              anchoredLen > 0,
              loc >= 0,
              loc + anchoredLen <= len else {
            return repairOrForget(expandedPlain: expandedPlain, haystack: whole, searchRadius: searchRadius)
        }

        let current = whole.substring(with: NSRange(location: loc, length: anchoredLen))
        guard current == snap else {
            return repairOrForget(expandedPlain: expandedPlain, haystack: whole, searchRadius: searchRadius)
        }
        return NSRange(location: loc, length: anchoredLen)
    }

    private func repairOrForget(expandedPlain: String, haystack whole: NSString, searchRadius: Int) -> NSRange? {
        guard let snap = anchorTextSnapshot, !snap.isEmpty else { clearAnchors(); return nil }
        let needleLen = (snap as NSString).length
        let hayLen = whole.length

        let near = anchorLocation ?? 0
        if let found = fuzzyFind(snapshot: snap, centeredNearUTF16Index: near, haystack: whole, searchRadius: searchRadius, needleLen: needleLen, hayLen: hayLen) {
            persistAnchors(found, expandedPlain)
            return found
        }
        let brute = whole.range(of: snap)
        guard brute.location != NSNotFound else { clearAnchors(); return nil }
        persistAnchors(brute, expandedPlain)
        return brute
    }

    private func persistAnchors(_ r: NSRange, _ expandedPlain: String) {
        anchorLocation = r.location
        anchorLength = r.length
        let nsExpanded = expandedPlain as NSString
        guard r.location >= 0, NSMaxRange(r) <= nsExpanded.length else { return }
        anchorTextSnapshot = nsExpanded.substring(with: r)
    }

    private func clearAnchors() {
        anchorLocation = nil
        anchorLength = nil
        anchorTextSnapshot = nil
    }

    private func fuzzyFind(
        snapshot: String,
        centeredNearUTF16Index center: Int,
        haystack: NSString,
        searchRadius: Int,
        needleLen: Int,
        hayLen: Int
    ) -> NSRange? {
        guard needleLen > 0, hayLen >= needleLen else { return nil }

        let c = max(0, min(center, max(0, hayLen - 1)))
        var loStart = max(0, c - searchRadius)
        let hiEnd = hayLen - needleLen
        if loStart > hiEnd { loStart = 0 }

        for start in loStart ... hiEnd {
            let test = NSRange(location: start, length: needleLen)
            if haystack.substring(with: test) == snapshot {
                return test
            }
        }
        return nil
    }
}
