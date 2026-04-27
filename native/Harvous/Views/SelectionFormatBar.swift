import SwiftUI

#if os(macOS)

/// Small floating pill that appears just above selected text in the editor.
/// Provides quick-access formatting without touching the toolbar.
struct SelectionFormatBar: View {
    let proxy: EditorProxy

    var body: some View {
        HStack(spacing: 0) {
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
                Image(systemName: "list.bullet")
                    .font(.system(size: 14))
                    .frame(width: 36, height: 36)
            } action: { proxy.insertBullet() }

            sep

            // Ordered list
            pill(help: "Numbered List") {
                Image(systemName: "list.number")
                    .font(.system(size: 14))
                    .frame(width: 36, height: 36)
            } action: { proxy.insertNumbered() }

            sep

            // Indent
            pill(help: "Indent") {
                Image(systemName: "increase.indent")
                    .font(.system(size: 14))
                    .frame(width: 36, height: 36)
            } action: { proxy.indent() }
        }
        .frame(height: 36)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
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
        @ViewBuilder label: () -> Label,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            label().contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
        .help(help)
    }
}

#Preview {
    SelectionFormatBar(proxy: EditorProxy())
        .padding(40)
}

#endif
