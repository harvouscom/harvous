import SwiftUI

/// Dense highlight row matching `NoteFeedRow` / `FolderFeedRow` spacing and typography.
struct StudyHighlightFeedRow: View {
    let focusTitle: String
    let subtitle: String
    let updatedAt: Date

    enum Variant {
        case sidebarCompact
        case conversation
    }

    var variant: Variant = .sidebarCompact
    var entryKind: StudyThread.EntryKind = .workspace
    var isPinned: Bool = false

    private static let timelineInterval: TimeInterval = 30

    var body: some View {
        switch variant {
        case .sidebarCompact:
            sidebarCompactBody
        case .conversation:
            conversationBody
        }
    }

    private var displayTitle: String {
        let t = focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? "Highlight" : t
    }

    private var kindGlyphAsset: String {
        switch entryKind {
        case .workspace, .miniNote: return "Harvous.Note"
        case .linkedNote:           return "Harvous.ArrowRightArrowLeft"
        case .scriptureLink:        return "Harvous.BookOpen"
        case .reference:            return "Harvous.LinesLeaning"
        }
    }

    private var sidebarCompactBody: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                if isPinned {
                    HarvousFAGlyph(assetName: "Harvous.Thumbtack", edgePt: 9)
                        .foregroundStyle(Color.primary.opacity(0.45))
                }
                HarvousFAGlyph(assetName: kindGlyphAsset, edgePt: 11)
                    .foregroundStyle(.secondary)
                Text(displayTitle)
                    .font(HarvousTypography.noteListTitle)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
            }

            TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
                HStack(spacing: 0) {
                    Text(NoteRelativeTime.formatted(updatedAt, relativeTo: context.date))
                        .font(HarvousTypography.noteListPreview)
                        .foregroundStyle(.secondary)

                    if !subtitle.isEmpty {
                        Text("  ")
                        Text(subtitle)
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

    private var conversationBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if isPinned {
                    HarvousFAGlyph(assetName: "Harvous.Thumbtack", edgePt: 9)
                        .foregroundStyle(Color.primary.opacity(0.45))
                }
                HarvousFAGlyph(assetName: kindGlyphAsset, edgePt: 11)
                    .foregroundStyle(.secondary)
                Text(displayTitle)
                    .font(HarvousTypography.noteListTitle)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
                    Text(NoteRelativeTime.formatted(updatedAt, relativeTo: context.date, abbreviated: true))
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.tertiary)
                        .layoutPriority(1)
                }
            }

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
        let s = subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? "No preview yet" : s
    }
}
