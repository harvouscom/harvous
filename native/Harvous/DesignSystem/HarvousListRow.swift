import SwiftUI

enum HarvousListRowVariant {
    /// Apple Notes–style title + time/excerpt line (sidebar density).
    case sidebarCompact
    /// Chat-style title, preview, trailing time.
    case conversation
}

/// Canonical list-row chrome — mirrors web `PrototypeListRow`.
/// Prefer this for new dense feeds; existing `NoteFeedRow` remains the note-specific adapter.
struct HarvousListRow: View {
    let title: String
    var preview: String? = nil
    var timestamp: String? = nil
    var isPinned: Bool = false
    var variant: HarvousListRowVariant = .sidebarCompact

    var body: some View {
        switch variant {
        case .sidebarCompact:
            sidebarCompactBody
        case .conversation:
            conversationBody
        }
    }

    private var sidebarCompactBody: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                if isPinned {
                    HarvousFAGlyph(assetName: "Harvous.Thumbtack", edgePt: 9)
                        .foregroundStyle(Color.primary.opacity(0.45))
                }
                Text(displayTitle)
                    .font(HarvousTypography.noteListTitle)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
            }

            if timestamp != nil || !(preview ?? "").isEmpty {
                HStack(spacing: 0) {
                    if let timestamp, !timestamp.isEmpty {
                        Text(timestamp)
                            .font(HarvousTypography.noteListTimestamp)
                            .foregroundStyle(.secondary)
                    }
                    if let preview, !preview.isEmpty {
                        if timestamp != nil { Text("  ") }
                        Text(preview)
                            .font(HarvousTypography.noteListPreview)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(.vertical, HarvousSpacing.space2)
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
                Text(displayTitle)
                    .font(HarvousTypography.noteListTitle)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if let timestamp, !timestamp.isEmpty {
                    Text(timestamp)
                        .font(HarvousTypography.noteListTrailingTimestamp)
                        .foregroundStyle(.tertiary)
                        .layoutPriority(1)
                }
            }

            Text(preview?.isEmpty == false ? preview! : "No preview yet")
                .font(HarvousTypography.noteListPreview)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        #if os(iOS)
        .padding(.horizontal, HarvousFeedListLayout.interiorContentHPadding)
        #endif
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    private var displayTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "New Note" : title
    }
}
