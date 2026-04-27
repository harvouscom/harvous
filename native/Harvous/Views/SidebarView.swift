import SwiftUI

// MARK: - Note filter
// Used by NoteListColumn on iOS and in the macOS Home panel.

enum NoteFilter: Hashable, Sendable {
    case all

    var displayName: String {
        switch self {
        case .all: return "Home"
        }
    }
}
