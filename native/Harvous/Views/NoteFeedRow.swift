import SwiftUI

/// Shared list row for dense feeds (sidebar, home, search, library).
/// Thin note adapter over `HarvousListRow` so relative timestamps stay note-aware.
struct NoteFeedRow: View {
    let note: Note

    enum Variant {
        /// Apple Notes–style title + time/excerpt line.
        case sidebarCompact
        /// Chat-style title, preview, trailing time (X / Messages scan pattern).
        case conversation
    }

    var variant: Variant = .sidebarCompact

    private static let timelineInterval: TimeInterval = 30

    var body: some View {
        TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
            HarvousListRow(
                title: note.title,
                preview: previewText,
                timestamp: NoteRelativeTime.formatted(
                    note.updatedAt,
                    relativeTo: context.date,
                    abbreviated: true
                ),
                isPinned: note.isPinned,
                variant: variant == .conversation ? .conversation : .sidebarCompact
            )
        }
    }

    private var previewText: String? {
        if !note.excerpt.isEmpty {
            return note.excerpt
        }
        if variant == .conversation {
            if let ref = note.primaryRef {
                return ref
            }
            if let c = note.folderChipPrimaryLabelText(), !c.isEmpty {
                return c
            }
            return "No preview yet"
        }
        return nil
    }
}
