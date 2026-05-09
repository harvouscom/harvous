import SwiftUI

/// Dense collection bucket row matching `NoteFeedRow` spacing and typography.
struct CollectionFeedRow: View {
    let title: String
    let noteCount: Int
    let isPinned: Bool
    /// When set, shown instead of the default "N note(s)" line (e.g. scripture book index).
    var customSubtitle: String? = nil

    enum Variant {
        case sidebarCompact
        case conversation
    }

    var variant: Variant = .sidebarCompact

    private var subtitleText: String {
        if let customSubtitle { return customSubtitle }
        return "\(noteCount) note\(noteCount == 1 ? "" : "s")"
    }

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
                    pinGlyph
                }
                Text(title)
                    .font(HarvousTypography.noteListTitle)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
            }

            Text(subtitleText)
                .font(HarvousTypography.noteListPreview)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var conversationBody: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if isPinned {
                    pinGlyph
                }

                Text(title)
                    .font(HarvousTypography.noteListTitle)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer(minLength: 8)
            }

            Text(subtitleText)
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

    private var pinGlyph: some View {
        Image(systemName: "pin.fill")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(45))
    }
}
