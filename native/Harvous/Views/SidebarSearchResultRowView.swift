import SwiftUI

/// Renders one universal sidebar search hit using the same row chrome as its list surface.
struct SidebarSearchResultRowView: View {
    let result: SidebarSearchResult
    let searchData: SidebarUniversalSearchIndex.SearchData

    private enum Metrics {
        static let rowHInset = HarvousFeedListLayout.sidebarRowContentHInset
        static let bodySpacing: CGFloat = 3
        static let titleLineSpacing: CGFloat = 4
        static let kindIconPt: CGFloat = 11
        static let rowVerticalPadding: CGFloat = 8
    }

    var body: some View {
        Group {
            switch result.kind {
            case .note:
                if let noteId = result.noteId,
                   let note = searchData.notes.first(where: { $0.id == noteId }) {
                    NoteFeedRow(note: note, variant: .sidebarCompact)
                }
            case .highlight:
                if let threadId = result.highlightThreadId,
                   let thread = searchData.highlightThreads.first(where: { $0.id == threadId }) {
                    let parentTitle = thread.parentNote?.title ?? ""
                    StudyHighlightFeedRow(
                        focusTitle: SidebarUniversalSearchIndex.highlightListTitle(for: thread),
                        subtitle: StudyHighlightListIndex.subtitlePreview(for: thread, parentNoteTitle: parentTitle),
                        updatedAt: StudyHighlightListIndex.highlightsFeedRecencyDate(thread),
                        variant: .sidebarCompact,
                        entryKind: thread.entryKind
                    )
                }
            case .folder:
                compactKindRow(iconAsset: "Harvous.Folder")
            case .threadCluster:
                compactKindRow(iconAsset: "Harvous.ArrowRightArrowLeft")
            case .scriptureBook:
                compactKindRow(iconAsset: "Harvous.BookOpen")
            case .scripturePassage:
                compactKindRow(iconAsset: "Harvous.BookOpen")
            }
        }
        .padding(.horizontal, Metrics.rowHInset)
    }

    private func compactKindRow(iconAsset: String) -> some View {
        VStack(alignment: .leading, spacing: Metrics.bodySpacing) {
            HStack(alignment: .firstTextBaseline, spacing: Metrics.titleLineSpacing) {
                HarvousFAGlyph(assetName: iconAsset, edgePt: Metrics.kindIconPt)
                    .foregroundStyle(Color.secondary)
                Text(result.title)
                    .font(HarvousTypography.noteListTitle)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
            }

            if let subtitle = result.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(HarvousTypography.noteListPreview)
                    .foregroundStyle(.secondary)
                    .lineLimit(result.kind == .scriptureBook ? 2 : 1)
            }
        }
        .padding(.vertical, Metrics.rowVerticalPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}
