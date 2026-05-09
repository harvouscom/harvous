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

    /// When non-nil, a third affordance clears highlights whose paint intersects the current prose selection (macOS selection bar).
    var onRemoveStudyHighlight: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 2) {
            pillButton(
                symbol: "highlighter",
                help: "Highlight selected text…"
            ) { onHighlight() }

            if let onNewStandaloneNote {
                Rectangle()
                    .fill(Color.primary.opacity(0.14))
                    .frame(width: 0.5, height: 22)

                pillButton(
                    symbol: "square.and.pencil",
                    help: "New Harvous note from selection"
                ) { onNewStandaloneNote() }
            }

            if let onRemoveStudyHighlight {
                Rectangle()
                    .fill(Color.primary.opacity(0.14))
                    .frame(width: 0.5, height: 22)

                pillButton(
                    // `highlighter.slash` is absent on SF Symbols catalogs before macOS 15 / iOS 18 — renders as an empty slot on macOS 14.
                    symbol: "eraser",
                    help: "Remove highlight from text"
                ) { onRemoveStudyHighlight() }
            }
        }
        .frame(height: 36)
        .padding(.horizontal, 6)
        .background(
            Capsule()
                .fill(.regularMaterial)
                .matchedGeometryEffect(id: morphID, in: morphNamespace, isSource: true)
        )
        .overlay(
            Capsule()
                .strokeBorder(Color.primary.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
    }

    private func pillButton(symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.primary.opacity(0.85))
        .help(help)
    }
}
