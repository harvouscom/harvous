import Foundation

// MARK: - Per-note study dock carousel (scripture pill + highlight)

enum StudyDockEntryPayload: Equatable {
    case scripture(ActiveScripturePillDockItem)
    case highlight(threadId: UUID)
}

struct StudyDockEntry: Identifiable, Equatable {
    let id: UUID
    var payload: StudyDockEntryPayload
    let openedAt: Date
    var expanded: Bool

    var stableKey: String {
        switch payload {
        case .scripture(let item):
            return item.id
        case .highlight(let threadId):
            return "highlight:\(threadId.uuidString)"
        }
    }
}

struct StudyDockStack: Equatable {
    static let maxEntries = 8

    var entries: [StudyDockEntry] = []
    var activeId: UUID?

    var isEmpty: Bool { entries.isEmpty }

    var activeEntry: StudyDockEntry? {
        guard let activeId else { return nil }
        return entries.first { $0.id == activeId }
    }

    var activeScripture: ActiveScripturePillDockItem? {
        guard let entry = activeEntry, case .scripture(let item) = entry.payload else { return nil }
        return item
    }

    var activeHighlightThreadId: UUID? {
        guard let entry = activeEntry, case .highlight(let tid) = entry.payload else { return nil }
        return tid
    }

    mutating func clear() {
        entries = []
        activeId = nil
    }

    mutating func openOrFocusScripture(_ item: ActiveScripturePillDockItem) {
        let key = item.id
        if let existing = entries.first(where: { $0.stableKey == key }) {
            activeId = existing.id
            entries = entries.map { entry in
                if entry.id == existing.id {
                    var updated = entry
                    updated.payload = .scripture(item)
                    updated.expanded = true
                    return updated
                }
                var collapsed = entry
                collapsed.expanded = false
                return collapsed
            }
            return
        }
        let id = UUID()
        let entry = StudyDockEntry(id: id, payload: .scripture(item), openedAt: Date(), expanded: true)
        var next = entries.map { var e = $0; e.expanded = false; return e }
        next.append(entry)
        trimOldestIfNeeded(&next)
        entries = next
        activeId = id
    }

    mutating func openOrFocusHighlight(threadId: UUID) {
        let key = "highlight:\(threadId.uuidString)"
        if let existing = entries.first(where: { $0.stableKey == key }) {
            activeId = existing.id
            entries = entries.map { entry in
                var updated = entry
                updated.expanded = entry.id == existing.id
                return updated
            }
            return
        }
        let id = UUID()
        let entry = StudyDockEntry(
            id: id,
            payload: .highlight(threadId: threadId),
            openedAt: Date(),
            expanded: true
        )
        var next = entries.map { var e = $0; e.expanded = false; return e }
        next.append(entry)
        trimOldestIfNeeded(&next)
        entries = next
        activeId = id
    }

    mutating func setActive(_ id: UUID) {
        guard entries.contains(where: { $0.id == id }) else { return }
        activeId = id
        entries = entries.map { entry in
            var updated = entry
            updated.expanded = entry.id == id
            return updated
        }
    }

    /// Reorders `id` to `toIndex` (live carousel drag).
    mutating func moveEntry(id: UUID, toIndex: Int) {
        guard let fromIndex = entries.firstIndex(where: { $0.id == id }) else { return }
        let clamped = max(0, min(entries.count - 1, toIndex))
        guard fromIndex != clamped else { return }
        let entry = entries.remove(at: fromIndex)
        entries.insert(entry, at: clamped)
    }

    mutating func closeEntry(id: UUID) {
        guard let idx = entries.firstIndex(where: { $0.id == id }) else { return }
        entries.remove(at: idx)
        if entries.isEmpty {
            activeId = nil
            return
        }
        if activeId == id {
            let last = entries[entries.count - 1]
            activeId = last.id
            entries = entries.map { entry in
                var updated = entry
                updated.expanded = entry.id == last.id
                return updated
            }
        }
    }

    mutating func collapseActiveScriptureIfNeeded() {
        guard let activeId,
              let idx = entries.firstIndex(where: { $0.id == activeId }),
              case .scripture = entries[idx].payload else { return }
        entries[idx].expanded = false
    }

    mutating func prune(where isValid: (StudyDockEntry) -> Bool) {
        let filtered = entries.filter(isValid)
        guard filtered.count != entries.count else { return }
        entries = filtered
        if entries.isEmpty {
            activeId = nil
            return
        }
        if activeId == nil || !entries.contains(where: { $0.id == activeId }) {
            let last = entries[entries.count - 1]
            activeId = last.id
            entries = entries.map { entry in
                var updated = entry
                updated.expanded = entry.id == last.id
                return updated
            }
        }
    }

    func highlightEntriesInStackOrder() -> [UUID] {
        entries.compactMap { entry in
            if case .highlight(let tid) = entry.payload { return tid }
            return nil
        }
    }

    private mutating func trimOldestIfNeeded(_ list: inout [StudyDockEntry]) {
        guard list.count > Self.maxEntries else { return }
        let drop = list.count - Self.maxEntries
        list.removeFirst(drop)
        if let activeId, !list.contains(where: { $0.id == activeId }) {
            self.activeId = list.last?.id
        }
    }
}

func studyDockChipLabel(entry: StudyDockEntry, excerptByThreadId: [UUID: String]) -> String {
    switch entry.payload {
    case .scripture(let item):
        return item.translation.isEmpty ? item.reference : "\(item.reference) · \(item.translation)"
    case .highlight(let threadId):
        return studyDockHighlightCollapsedTitle(
            threadId: threadId,
            excerptByThreadId: excerptByThreadId,
            focusTitleByThreadId: [:]
        )
    }
}

/// Title line for a collapsed carousel card (inactive slot or chip).
func studyDockCollapsedTitle(
    entry: StudyDockEntry,
    excerptByThreadId: [UUID: String],
    focusTitleByThreadId: [UUID: String] = [:]
) -> String {
    switch entry.payload {
    case .scripture(let item):
        return item.reference
    case .highlight(let threadId):
        return studyDockHighlightCollapsedTitle(
            threadId: threadId,
            excerptByThreadId: excerptByThreadId,
            focusTitleByThreadId: focusTitleByThreadId
        )
    }
}

func studyDockCollapsedIconAsset(entry: StudyDockEntry, highlightEntryKind: StudyThread.EntryKind?) -> String {
    switch entry.payload {
    case .scripture:
        return "Harvous.BookOpen"
    case .highlight:
        guard let kind = highlightEntryKind else { return "Harvous.Highlight" }
        switch kind {
        case .miniNote: return "Harvous.Highlight"
        case .linkedNote: return "Harvous.ArrowRightArrowLeft"
        case .scriptureLink: return "Harvous.BookOpen"
        case .reference: return "Harvous.LinesLeaning"
        case .workspace: return "Harvous.WandMagicSparkles"
        }
    }
}

private func studyDockHighlightCollapsedTitle(
    threadId: UUID,
    excerptByThreadId: [UUID: String],
    focusTitleByThreadId: [UUID: String]
) -> String {
    let custom = focusTitleByThreadId[threadId]?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !custom.isEmpty {
        return custom.count > 32 ? String(custom.prefix(32)) + "…" : custom
    }
    if let excerpt = excerptByThreadId[threadId]?.trimmingCharacters(in: .whitespacesAndNewlines), !excerpt.isEmpty {
        if excerpt.count > 28 {
            return String(excerpt.prefix(28)) + "…"
        }
        return excerpt
    }
    return "Highlight"
}
