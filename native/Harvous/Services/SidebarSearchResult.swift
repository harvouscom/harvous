import Foundation

enum SidebarSearchScope: String, Sendable {
    case active
    case elsewhere
}

enum SidebarSearchResultKind: String, Sendable {
    case note
    case folder
    case threadCluster
    case highlight
    case scriptureBook
    case scripturePassage
}

enum SidebarElsewhereTypeFilter: String, CaseIterable, Identifiable, Sendable {
    case all
    case notes
    case folders
    case threads
    case highlights
    case scripture

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .notes: return "Notes"
        case .folders: return "Folders"
        case .threads: return "Threads"
        case .highlights: return "Highlights"
        case .scripture: return "Scripture"
        }
    }

    var iconAsset: String? {
        switch self {
        case .all: return nil
        case .notes: return "Harvous.Note"
        case .folders: return "Harvous.Folder"
        case .threads: return "Harvous.ArrowRightArrowLeft"
        case .highlights: return "Harvous.Highlight"
        case .scripture: return "Harvous.BookOpen"
        }
    }

    func matches(_ kind: SidebarSearchResultKind) -> Bool {
        switch self {
        case .all: return true
        case .notes: return kind == .note
        case .folders: return kind == .folder
        case .threads: return kind == .threadCluster
        case .highlights: return kind == .highlight
        case .scripture: return kind == .scriptureBook || kind == .scripturePassage
        }
    }
}

struct SidebarSearchResult: Identifiable, Hashable, Sendable {
    let id: String
    let kind: SidebarSearchResultKind
    let title: String
    let subtitle: String?
    let highlightEntryKind: StudyThread.EntryKind?
    let noteId: UUID?
    let folderLabel: String?
    let threadClusterRepresentativeId: UUID?
    let highlightThreadId: UUID?
    let scriptureBookIndex: Int?
    let scripturePassage: ParsedScriptureFields?

    static func stableId(_ kind: SidebarSearchResultKind, key: String) -> String {
        "\(kind.rawValue):\(key)"
    }

    static func kindGlyphAsset(kind: SidebarSearchResultKind, highlightEntryKind: StudyThread.EntryKind?) -> String {
        if kind == .highlight {
            switch highlightEntryKind {
            case .linkedNote: return "Harvous.ArrowRightArrowLeft"
            case .scriptureLink: return "Harvous.BookOpen"
            case .reference: return "Harvous.LinesLeaning"
            case .workspace, .miniNote, .none: return "Harvous.Note"
            }
        }
        switch kind {
        case .note: return "Harvous.Note"
        case .folder: return "Harvous.Folder"
        case .threadCluster: return "Harvous.ArrowRightArrowLeft"
        case .scriptureBook, .scripturePassage: return "Harvous.BookOpen"
        case .highlight: return "Harvous.Note"
        }
    }
}
