import Foundation

/// Filters `StudyThread` rows that represent user-visible highlights in the Highlights list surface.
enum StudyHighlightListIndex {
    /// Highlight created from scripture passage dock (plain excerpt + translation, no prose anchor required).
    static func isScripturePassageHighlight(_ thread: StudyThread) -> Bool {
        guard thread.entryKind == .scriptureLink else { return false }
        let excerpt = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let trans = thread.scripturePassageTranslation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return !excerpt.isEmpty && !trans.isEmpty
    }

    /// Inline prose/link/scripture-anchor highlight (persisted UTF-16 range in note body expanded plain).
    private static func isAnchoredStudyHighlight(_ thread: StudyThread) -> Bool {
        StudyThread.anchoredHighlightKinds.contains(thread.entryKind) && thread.hasPersistedHighlightAnchor
    }

    static func isEligibleListHighlight(_ thread: StudyThread) -> Bool {
        guard !thread.isArchived else { return false }
        guard thread.entryKind != .workspace else { return false }
        if isScripturePassageHighlight(thread) { return true }
        if isAnchoredStudyHighlight(thread) { return true }
        return false
    }

    /// Space-scoped rows, same recovery fallback as note lists: if active space is empty but threads exist, show all.
    static func rowsInActiveSpace(
        threads: [StudyThread],
        activeSpaceId: UUID,
        allowUnscopedFallback: Bool
    ) -> [StudyThread] {
        let scoped = threads.filter { $0.spaceId == activeSpaceId }
        if scoped.isEmpty, allowUnscopedFallback, !threads.isEmpty {
            return threads
        }
        return scoped
    }

    /// Recency stamp for Highlights list ordering only (not vault / generic `updatedAt`).
    static func highlightsListSortDate(_ thread: StudyThread) -> Date {
        thread.highlightListEditedAt ?? thread.createdAt
    }

    /// Subtitle-relative “modified” time: prefer explicit list-edit stamp when present so the caption matches perceived ordering.
    static func highlightsFeedRecencyDate(_ thread: StudyThread) -> Date {
        thread.highlightListEditedAt ?? thread.updatedAt
    }

    static func sortedForList(_ rows: [StudyThread]) -> [StudyThread] {
        rows.sorted {
            let k0 = highlightsListSortDate($0)
            let k1 = highlightsListSortDate($1)
            if k0 != k1 {
                return k0 > k1
            }
            if $0.createdAt != $1.createdAt {
                return $0.createdAt > $1.createdAt
            }
            return $0.id.uuidString < $1.id.uuidString
        }
    }

    static func filter(_ threads: [StudyThread], query: String) -> [StudyThread] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return threads }
        let lc = trimmed.lowercased()
        return threads.filter { threadMatches($0, loweredQuery: lc) }
    }

    private static func threadMatches(_ thread: StudyThread, loweredQuery lc: String) -> Bool {
        if thread.focusTitle.lowercased().contains(lc) { return true }
        if thread.sourceSnippet.lowercased().contains(lc) { return true }
        if thread.miniNoteBody.lowercased().contains(lc) { return true }
        if (thread.scriptureReference ?? "").lowercased().contains(lc) { return true }
        if (thread.scripturePassageExcerpt ?? "").lowercased().contains(lc) { return true }
        if let parent = thread.parentNote, parent.title.lowercased().contains(lc) { return true }
        return false
    }

    /// Two-line row: secondary line under `focusTitle`.
    static func subtitlePreview(for thread: StudyThread, parentNoteTitle: String) -> String {
        if isScripturePassageHighlight(thread) {
            let ref = (thread.scriptureReference ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let excerpt = (thread.scripturePassageExcerpt ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let ann = thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
            var parts: [String] = []
            if !ref.isEmpty { parts.append(ref) }
            if !excerpt.isEmpty {
                let short = excerpt.count > 120 ? String(excerpt.prefix(120)) + "…" : excerpt
                parts.append(short)
            }
            if !ann.isEmpty { parts.append(ann) }
            let head = parts.joined(separator: " · ")
            let from = parentNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            if head.isEmpty {
                return from.isEmpty ? "Scripture highlight" : "From \(from)"
            }
            return from.isEmpty ? head : "\(head) — \(from)"
        }

        let ann = thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
        if !ann.isEmpty {
            return ann
        }
        let snap = thread.sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines)
        if !snap.isEmpty {
            return snap
        }
        let from = parentNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return from.isEmpty ? "Highlight" : from
    }
}
