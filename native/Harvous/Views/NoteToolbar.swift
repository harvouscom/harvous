import SwiftUI

#if os(macOS)

/// Horizontal formatting toolbar — appears only when text is selected.
/// Groups: inline | headings | lists | blocks | insert
struct NoteToolbar: View {
    @ObservedObject var proxy: EditorProxy

    var body: some View {
        VStack(spacing: 0) {
            // Top border — span full width of the bar (independent of scroll content width)
            Color(nsColor: .separatorColor)
                .frame(maxWidth: .infinity)
                .frame(height: 0.5)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    // Undo / redo
                    group {
                        iconButton("arrow.uturn.backward", isEnabled: proxy.formatToolbar.canUndo) { proxy.undoEdit() }
                        iconButton("arrow.uturn.forward", isEnabled: proxy.formatToolbar.canRedo) { proxy.redoEdit() }
                    }

                    warmDivider

                    // Inline
                    group {
                        textButton("B", weight: .bold, isActive: proxy.formatToolbar.isBold) { proxy.bold() }
                        textButton("I", italic: true, isActive: proxy.formatToolbar.isItalic) { proxy.italic() }
                        textButton("S", strikethrough: true, isActive: proxy.formatToolbar.isStrikethrough) { proxy.strikethrough() }
                    }

                    warmDivider

                    // Headings (H1 is the note title field only)
                    group {
                        textButton("H2", size: 14, weight: .bold, isActive: proxy.formatToolbar.headingLevel == 2) { proxy.heading(2) }
                        textButton("H3", size: 14, weight: .bold, isActive: proxy.formatToolbar.headingLevel == 3) { proxy.heading(3) }
                        textButton("H4", size: 14, weight: .bold, isActive: proxy.formatToolbar.headingLevel == 4) { proxy.heading(4) }
                    }

                    warmDivider

                    // Lists + indent
                    group {
                        iconButton("list.bullet", isActive: proxy.formatToolbar.isBulletList) { proxy.insertBullet() }
                        iconButton("list.number", isActive: proxy.formatToolbar.isNumberedList) { proxy.insertNumbered() }
                        iconButton("decrease.indent", isEnabled: proxy.formatToolbar.isIndented) { proxy.outdent() }
                        iconButton("increase.indent", isActive: proxy.formatToolbar.isIndented) { proxy.indent() }
                    }

                    warmDivider

                    // Insert
                    group {
                        iconButton("minus") { proxy.insertDivider() }
                        iconButton("link") { proxy.addOrEditLink() }
                        iconButton("photo") { proxy.insertImage() }
                    }
                }
                .padding(.horizontal, 20)
            }
            .frame(height: 44)
        }
        .background(.regularMaterial)
        .onHover { isHovering in
            proxy.setFormatToolbarHover(isHovering)
        }
    }

    // MARK: - Button builders

    private func textButton(
        _ label: String,
        size: CGFloat = 15,
        weight: Font.Weight = .regular,
        italic: Bool = false,
        strikethrough: Bool = false,
        isActive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(HarvousFonts.font(size: size, weight: weight, design: .default))
                .italic(italic)
                .strikethrough(strikethrough)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(NoteToolbarButtonStyle(isActive: isActive))
    }

    private func iconButton(
        _ symbol: String,
        isActive: Bool = false,
        isEnabled: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(NoteToolbarButtonStyle(isActive: isActive))
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.35)
    }

    @ViewBuilder
    private func group<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 0) { content() }
    }

    private var warmDivider: some View {
        Color(nsColor: .separatorColor)
            .frame(width: 0.5, height: 22)
            .padding(.horizontal, 6)
    }
}

// MARK: - Button style — squishy press

struct NoteToolbarButtonStyle: ButtonStyle {
    var isActive = false

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        configuration.label
            .foregroundStyle(pressed || isActive ? Color.primary : Color.secondary)
            .background(
                RoundedRectangle(cornerRadius: HarvousRadius.formatButton)
                    .fill(backgroundFill(isPressed: pressed))
            )
            .scaleEffect(pressed ? 0.88 : 1.0)
            .animation(HarvousAnimation.press, value: pressed)
    }

    private func backgroundFill(isPressed: Bool) -> Color {
        if isPressed { return Color(nsColor: .quaternaryLabelColor) }
        if isActive { return Color(nsColor: .quaternaryLabelColor).opacity(0.5) }
        return .clear
    }
}

#Preview {
    let proxy = EditorProxy()
    NoteToolbar(proxy: proxy)
        .frame(width: 600)
}

#endif
