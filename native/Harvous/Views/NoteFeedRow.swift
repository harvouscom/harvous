import SwiftUI

/// Shared list row for dense feeds (sidebar, home, search, library).
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
        switch variant {
        case .sidebarCompact:
            sidebarCompactBody
        case .conversation:
            conversationBody
        }
    }

    // MARK: - Sidebar compact (legacy NoteRow)

    private var sidebarCompactBody: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(note.title.isEmpty ? "New Note" : note.title)
                .font(HarvousTypography.noteListTitle)
                .lineLimit(1)
                .foregroundStyle(.primary)

            TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
                HStack(spacing: 0) {
                    Text(NoteRelativeTime.formatted(note.updatedAt, relativeTo: context.date))
                        .font(HarvousTypography.noteListPreview)
                        .foregroundStyle(.secondary)

                    if !note.excerpt.isEmpty {
                        Text("  ")
                        Text(note.excerpt)
                            .font(HarvousTypography.noteListPreview)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    // MARK: - Conversation (iOS home / search / library)

    private var conversationBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(note.title.isEmpty ? "New Note" : note.title)
                    .font(HarvousTypography.noteListTitle)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
                    Text(NoteRelativeTime.formatted(note.updatedAt, relativeTo: context.date, abbreviated: true))
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.tertiary)
                        .layoutPriority(1)
                }
            }

            Text(conversationPreview)
                .font(HarvousTypography.noteListPreview)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var conversationPreview: String {
        if !note.excerpt.isEmpty {
            return note.excerpt
        }
        if let ref = note.primaryRef {
            return ref
        }
        if let c = note.primaryCollection, !c.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return c
        }
        return "No preview yet"
    }
}
