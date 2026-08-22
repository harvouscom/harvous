import SwiftUI

#if os(macOS)

/// Small floating pill that appears just above selected text in the editor.
/// Provides quick-access formatting without touching the toolbar.
struct SelectionFormatBar: View {
    let proxy: EditorProxy

    var body: some View {
        HStack(spacing: 0) {
            pill(help: "Undo", disabled: !proxy.formatToolbar.canUndo) {
                HarvousFAGlyph(assetName: "Harvous.ArrowRotateLeft", edgePt: 14)
                    .frame(width: 36, height: 36)
            } action: { proxy.undoEdit() }

            sep

            pill(help: "Redo", disabled: !proxy.formatToolbar.canRedo) {
                HarvousFAGlyph(assetName: "Harvous.ArrowRotateRight", edgePt: 14)
                    .frame(width: 36, height: 36)
            } action: { proxy.redoEdit() }

            sep

            // Bold
            pill(help: "Bold") {
                Text("B").font(HarvousTypography.formatBarKeyBold)
                    .frame(width: 36, height: 36)
            } action: { proxy.bold() }

            sep

            // Italic
            pill(help: "Italic") {
                Text("I").font(HarvousTypography.formatBarKeyBody).italic()
                    .frame(width: 36, height: 36)
            } action: { proxy.italic() }

            sep

            // Strikethrough
            pill(help: "Strikethrough") {
                strikeLabel.frame(width: 36, height: 36)
            } action: { proxy.strikethrough() }

            sep

            // Unordered list
            pill(help: "Bullet List") {
                HarvousFAGlyph(assetName: "Harvous.ListUl", edgePt: 14)
                    .frame(width: 36, height: 36)
            } action: { proxy.insertBullet() }

            sep

            // Ordered list
            pill(help: "Numbered List") {
                HarvousFAGlyph(assetName: "Harvous.ListOl", edgePt: 14)
                    .frame(width: 36, height: 36)
            } action: { proxy.insertNumbered() }

            sep

            pill(help: "Outdent", disabled: !proxy.formatToolbar.isIndented) {
                HarvousFAGlyph(assetName: "Harvous.Outdent", edgePt: 14)
                    .frame(width: 36, height: 36)
            } action: { proxy.outdent() }

            sep

            // Indent
            pill(help: "Indent") {
                HarvousFAGlyph(assetName: "Harvous.Indent", edgePt: 14)
                    .frame(width: 36, height: 36)
            } action: { proxy.indent() }
        }
        .frame(height: 36)
        // 12, not 8. This bar and `SelectionActionBar` were two floating bars with two shapes and
        // no rule between them — one a Capsule, this one an 8pt rect. Both now take
        // `HarvousRadius.floatingSurface`, which is what web uses for anything that floats.
        .background(
            .regularMaterial,
            in: RoundedRectangle(cornerRadius: HarvousRadius.floatingSurface, style: .continuous)
        )
        .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
        .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
        .fixedSize()
    }

    // MARK: - Helpers

    private var sep: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.1))
            .frame(width: 0.5, height: 22)
    }

    private var strikeLabel: some View {
        Text("S")
            .font(HarvousTypography.formatBarKeyBody)
            .strikethrough(true)
    }

    @ViewBuilder
    private func pill<Label: View>(
        help: String,
        disabled: Bool = false,
        @ViewBuilder label: () -> Label,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            label().contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(disabled ? Color.secondary : Color.primary)
        .opacity(disabled ? 0.35 : 1)
        .help(help)
        .disabled(disabled)
    }
}

private struct SelectionFormatBar_PreviewsHost: View {
    @StateObject private var proxy = EditorProxy()

    var body: some View {
        SelectionFormatBar(proxy: proxy)
            .padding(40)
    }
}

#Preview {
    SelectionFormatBar_PreviewsHost()
}

#endif
