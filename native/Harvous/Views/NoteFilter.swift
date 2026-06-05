import SwiftUI

// MARK: - Note filter
// Used by NoteListColumn on iOS and in the macOS Home panel.

enum NoteFilter: Hashable, Sendable {
    case all
    case folder(String?) // nil = ungrouped
    case scriptureBook(bookIndex: Int)
    /// Notes that cite this exact parsed passage (canonical book/chapter/verses).
    case scripturePassage(ParsedScriptureFields)
    /// Notes that cite this exact URL (matches `URLLinkPillAttachment.href`).
    case urlReference(href: String)
    /// Notes in a connected-note thread cluster (member note UUIDs snapshotted at drill-in).
    case thread(memberIds: Set<UUID>)

    var displayName: String {
        switch self {
        case .all: return "Home"
        case .thread: return "Thread"
        case .folder(let name):
            if let name, !name.isEmpty { return name }
            return "No folder"
        case .scriptureBook(let idx):
            guard idx >= 0, idx < ScriptureCanonicalBooks.titles.count else { return "Scripture" }
            return ScriptureCanonicalBooks.titles[idx]
        case .scripturePassage(let p):
            return ScriptureReferenceParser.format(
                bookIndex: p.bookIndex,
                chapter: p.chapter,
                verseStart: p.verseStart,
                verseEnd: p.verseEnd
            )
        case .urlReference(let href):
            return urlLinkPillDisplayHost(href)
        }
    }
}
