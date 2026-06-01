import Foundation

/// Prototype / web parity — hide notes with no user-visible title or body from sidebar lists.
enum HarvousNoteListVisibility {
    private static let serverAutoUntitledPattern = try! NSRegularExpression(
        pattern: #"^\s*Untitled Note(?: \d+)?\s*$"#,
        options: [.caseInsensitive]
    )

    static func stripServerAutoUntitledTitleForDisplay(_ title: String) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
        if serverAutoUntitledPattern.firstMatch(in: trimmed, range: range) != nil {
            return ""
        }
        return title
    }

    static func isEffectivelyEmpty(title: String, body: String) -> Bool {
        let displayTitle = stripServerAutoUntitledTitleForDisplay(title)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !displayTitle.isEmpty { return false }
        return body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// One-line list preview: newline-separated body lines become spaces; skips empty lines;
    /// keeps adding lines until `maxLength`.
    static func listPreviewExcerpt(from body: String, maxLength: Int = 120) -> String {
        var decoded = body
            .replacingOccurrences(of: "&nbsp;", with: " ", options: .caseInsensitive)
            .replacingOccurrences(of: "&amp;", with: "&", options: .caseInsensitive)
            .replacingOccurrences(of: "&lt;", with: "<", options: .caseInsensitive)
            .replacingOccurrences(of: "&gt;", with: ">", options: .caseInsensitive)
            .replacingOccurrences(of: "&quot;", with: "\"", options: .caseInsensitive)
            .replacingOccurrences(of: "&#39;", with: "'", options: .caseInsensitive)
            .replacingOccurrences(of: "&apos;", with: "'", options: .caseInsensitive)
        decoded = decoded
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = decoded.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { line in
                !line.isEmpty && line != "---"
            }
        var out = ""
        for line in lines {
            let next = out.isEmpty ? line : "\(out) \(line)"
            if next.count > maxLength {
                if out.isEmpty {
                    let end = next.index(next.startIndex, offsetBy: min(maxLength, next.count))
                    return String(next[..<end]) + "…"
                }
                break
            }
            out = next
        }
        return out
    }

    /// Active-space scoping plus empty-note filter for sidebar / hub lists.
    static func notesInActiveSpace(
        from notes: [Note],
        spaceId: UUID,
        includeRecoveryFallback: Bool = true
    ) -> [Note] {
        let scoped = notes.filter { $0.resolvedSpaceId() == spaceId }
        let base: [Note]
        if scoped.isEmpty, includeRecoveryFallback, !notes.isEmpty {
            base = notes
        } else {
            base = scoped
        }
        return base.filter { !isEffectivelyEmpty(title: $0.title, body: $0.body) }
    }
}

enum HarvousLazyComposeDraft {
    /// iOS navigation sentinel — no SwiftData row until the user adds title or body.
    static let navigationNoteId = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!

    static func isDraftNavigationId(_ id: UUID) -> Bool {
        id == navigationNoteId
    }
}
