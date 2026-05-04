import SwiftUI

// MARK: - Note filter
// Used by NoteListColumn on iOS and in the macOS Home panel.

enum NoteFilter: Hashable, Sendable {
    case all
    case collection(String?) // nil = ungrouped

    var displayName: String {
        switch self {
        case .all: return "Home"
        case .collection(let name):
            if let name, !name.isEmpty { return name }
            return "Ungrouped"
        }
    }
}
