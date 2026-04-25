import SwiftUI

#if os(macOS)

/// Horizontal formatting toolbar — matches the Scratch / Bear aesthetic.
/// Groups: inline | headings | lists | blocks | insert
struct FormatToolbar: View {
    let proxy: EditorProxy

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                // Inline
                group {
                    textButton("B", weight: .bold)   { proxy.bold() }
                    textButton("I", italic: true)    { proxy.italic() }
                    textButton("S", strikethrough: true) { proxy.strikethrough() }
                }

                divider

                // Headings
                group {
                    textButton("H1", size: 11, weight: .bold) { proxy.heading(1) }
                    textButton("H2", size: 11, weight: .bold) { proxy.heading(2) }
                    textButton("H3", size: 11, weight: .bold) { proxy.heading(3) }
                    textButton("H4", size: 11, weight: .bold) { proxy.heading(4) }
                }

                divider

                // Lists
                group {
                    iconButton("list.bullet")       { proxy.insertBullet() }
                    iconButton("list.number")       { proxy.insertNumbered() }
                    iconButton("checklist")         { /* stub */ }
                }

                divider

                // Blocks
                group {
                    iconButton("chevron.left.forwardslash.chevron.right") { proxy.insertCode() }
                    iconButton("sum")               { /* math stub */ }
                    iconButton("minus")             { proxy.insertDivider() }
                }

                divider

                // Insert
                group {
                    iconButton("link")              { /* link stub */ }
                    iconButton("photo")             { /* image stub */ }
                    iconButton("tablecells")        { /* table stub */ }
                }
            }
            .padding(.horizontal, 8)
        }
        .frame(height: 36)
        .background(.bar)
    }

    // MARK: - Button builders

    private func textButton(
        _ label: String,
        size: CGFloat = 13,
        weight: Font.Weight = .regular,
        italic: Bool = false,
        strikethrough: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: size, weight: weight))
                .italic(italic)
                .strikethrough(strikethrough)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(FormatButtonStyle())
    }

    private func iconButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .medium))
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(FormatButtonStyle())
    }

    @ViewBuilder
    private func group<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 0) { content() }
    }

    private var divider: some View {
        Rectangle()
            .fill(.separator)
            .frame(width: 1, height: 16)
            .padding(.horizontal, 4)
    }
}

// MARK: - Button style

struct FormatButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? Color.primary : Color.secondary)
            .background(
                RoundedRectangle(cornerRadius: 5)
                    .fill(configuration.isPressed ? Color.primary.opacity(0.08) : Color.clear)
            )
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

#Preview {
    FormatToolbar(proxy: EditorProxy())
        .frame(width: 600)
}

#endif
