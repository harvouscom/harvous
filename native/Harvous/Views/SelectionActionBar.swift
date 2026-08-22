import SwiftUI

/// Compact actions when body text has a multi-character selection. Sits **below** the selection via
/// `EditorProxy.selectionViewportRect`. The capsule chrome participates in a `matchedGeometryEffect`
/// morph with `HighlightAnnotationPopover`, so tapping Highlight grows the same shape into the note UI.
struct SelectionActionBar: View {
    var morphNamespace: Namespace.ID
    var morphID: String

    var onHighlight: () -> Void
    /// When `nil`, the second button (and divider) are hidden. Used by the scripture dock,
    /// where the selection action is just "highlight" — no standalone-note action.
    var onNewStandaloneNote: (() -> Void)?

    /// When non-nil, a third affordance removes intersecting study highlights and/or clears inline formatting (macOS selection bar).
    var onEraseInlineFormatting: (() -> Void)? = nil
    /// Tooltip for the eraser pill (depends on whether highlights vs bold/link/etc. apply).
    var eraseInlineFormattingHelp: String = "Remove highlight and formatting"

    /// When non-nil, a connect-existing-note affordance appears after New Note.
    var onConnectExistingNote: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 2) {
            pillButton(
                assetName: "Harvous.Highlight",
                help: "Highlight selected text…"
            ) { onHighlight() }

            if let onNewStandaloneNote {
                Rectangle()
                    .fill(Color.primary.opacity(0.14))
                    .frame(width: 0.5, height: 22)

                pillButton(
                    assetName: "Harvous.PenToSquare",
                    help: "New Harvous note from selection"
                ) { onNewStandaloneNote() }
            }

            if let onConnectExistingNote {
                Rectangle()
                    .fill(Color.primary.opacity(0.14))
                    .frame(width: 0.5, height: 22)

                pillButton(
                    assetName: "Harvous.ArrowRightArrowLeft",
                    help: "Connect existing note to selection"
                ) { onConnectExistingNote() }
            }

            if let onEraseInlineFormatting {
                Rectangle()
                    .fill(Color.primary.opacity(0.14))
                    .frame(width: 0.5, height: 22)

                pillButton(
                    assetName: "Harvous.Eraser",
                    help: eraseInlineFormattingHelp
                ) { onEraseInlineFormatting() }
            }
        }
        .frame(height: 36)
        // 2, not 6. Concentric corners want `outer - inner`, and a 12pt surface holding 10pt
        // tiles gives 2. The 6 came from the capsule, where round buttons had to clear an end
        // curve a rounded rect does not have. Mirrors web `.pds-native-selection-bar`.
        .padding(.horizontal, 2)
        .background(
            // A rounded rect, not a capsule. This bar and `SelectionFormatBar` were two floating
            // bars with two shapes and no rule between them — this one a Capsule, that one an
            // 8pt RoundedRectangle. Both are now `HarvousRadius.floatingSurface`, matching web.
            RoundedRectangle(cornerRadius: HarvousRadius.floatingSurface, style: .continuous)
                .fill(.regularMaterial)
                .matchedGeometryEffect(id: morphID, in: morphNamespace, isSource: true)
        )
        .overlay(
            RoundedRectangle(cornerRadius: HarvousRadius.floatingSurface, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
    }

    private func pillButton(assetName: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: 14)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.primary.opacity(0.85))
        .help(help)
    }
}
