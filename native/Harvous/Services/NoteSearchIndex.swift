import Foundation

/// Offline filtering for sidebar / home note search — substring fields plus structured scripture when the query parses.
enum NoteSearchIndex {
    static func filter(_ notes: [Note], query: String) -> [Note] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return notes }
        let lc = trimmed.lowercased()
        let parsed = ScriptureReferenceParser.parse(trimmed)
        return notes.filter { noteMatches($0, loweredQuery: lc, structuredQuery: parsed) }
    }

    private static func noteMatches(_ note: Note, loweredQuery lc: String, structuredQuery parsed: ParsedScriptureFields?) -> Bool {
        if let parsed, ScriptureReferenceParser.anyDetectedReference(note.detectedRefs, overlapsStructured: parsed) {
            return true
        }
        if note.title.lowercased().contains(lc) { return true }
        if note.body.lowercased().contains(lc) { return true }
        if note.detectedRefs.contains(where: { $0.lowercased().contains(lc) }) { return true }
        if note.tags.contains(where: { $0.lowercased().contains(lc) }) { return true }
        if let col = note.primaryFolder?.lowercased(), col.contains(lc) { return true }
        if note.normalizedSecondaryFolderLabels().contains(where: { $0.lowercased().contains(lc) }) {
            return true
        }
        return false
    }
}
