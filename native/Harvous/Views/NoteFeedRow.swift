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
            HStack(spacing: 4) {
                if note.isPinned {
                    HarvousFAGlyph(assetName: "Harvous.Thumbtack", edgePt: 9)
                        .foregroundStyle(Color.primary.opacity(0.45))
                }
                Text(note.title.isEmpty ? "New Note" : note.title)
                    .font(HarvousTypography.noteListTitle)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
            }

            TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
                HStack(spacing: 0) {
                    Text(NoteRelativeTime.formatted(note.updatedAt, relativeTo: context.date))
                        .font(HarvousTypography.noteListTimestamp)
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
                if note.isPinned {
                    HarvousFAGlyph(assetName: "Harvous.Thumbtack", edgePt: 9)
                        .foregroundStyle(Color.primary.opacity(0.45))
                }

                Text(note.title.isEmpty ? "New Note" : note.title)
                    .font(HarvousTypography.noteListTitle)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
                    Text(NoteRelativeTime.formatted(note.updatedAt, relativeTo: context.date, abbreviated: true))
                        .font(HarvousTypography.noteListTrailingTimestamp)
                        .foregroundStyle(.tertiary)
                        .layoutPriority(1)
                }
            }

            // Single-line preview matches macOS sidebar rows (`sidebarCompact`); keeps hub scan density consistent.
            Text(conversationPreview)
                .font(HarvousTypography.noteListPreview)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        #if os(iOS)
        .padding(.horizontal, HarvousFeedListLayout.interiorContentHPadding)
        #endif
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
        if let c = note.folderChipPrimaryLabelText(), !c.isEmpty {
            return c
        }
        return "No preview yet"
    }
}
