import SwiftUI

#if os(macOS)

/// Horizontal formatting toolbar — appears only when text is selected.
/// Groups: inline | headings | lists | blocks | insert
struct FormatToolbar: View {
    let proxy: EditorProxy

    var body: some View {
        VStack(spacing: 0) {
            // Warm top border
            Color.separatorWarm.frame(height: 0.5)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    // Inline
                    group {
                        textButton("B", weight: .bold)       { proxy.bold() }
                        textButton("I", italic: true)         { proxy.italic() }
                        textButton("S", strikethrough: true)  { proxy.strikethrough() }
                    }

                    warmDivider

                    // Headings
                    group {
                        textButton("H1", size: 11, weight: .bold) { proxy.heading(1) }
                        textButton("H2", size: 11, weight: .bold) { proxy.heading(2) }
                        textButton("H3", size: 11, weight: .bold) { proxy.heading(3) }
                        textButton("H4", size: 11, weight: .bold) { proxy.heading(4) }
                    }

                    warmDivider

                    // Lists
                    group {
                        iconButton("list.bullet")  { proxy.insertBullet() }
                        iconButton("list.number")  { proxy.insertNumbered() }
                        iconButton("checklist")    { /* stub */ }
                    }

                    warmDivider

                    // Blocks
                    group {
                        iconButton("chevron.left.forwardslash.chevron.right") { proxy.insertCode() }
                        iconButton("sum")          { /* math stub */ }
                        iconButton("minus")        { proxy.insertDivider() }
                    }

                    warmDivider

                    // Insert
                    group {
                        iconButton("link")         { /* link stub */ }
                        iconButton("photo")        { /* image stub */ }
                        iconButton("tablecells")   { /* table stub */ }
                    }
                }
                .padding(.horizontal, 8)
            }
            .frame(height: 40)
        }
        .background(Color.surfaceInset)
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
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(FormatButtonStyle())
    }

    private func iconButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .medium))
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(FormatButtonStyle())
    }

    @ViewBuilder
    private func group<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 0) { content() }
    }

    private var warmDivider: some View {
        Color.separatorWarm
            .frame(width: 0.5, height: 18)
            .padding(.horizontal, 4)
    }
}

// MARK: - Button style — squishy press

struct FormatButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? Color.inkPrimary : Color.inkSecondary)
            .background(
                RoundedRectangle(cornerRadius: HarvousRadius.formatButton)
                    .fill(configuration.isPressed ? Color.separatorWarm : Color.clear)
            )
            .scaleEffect(configuration.isPressed ? 0.88 : 1.0)
            .animation(HarvousAnimation.press, value: configuration.isPressed)
    }
}

#Preview {
    let proxy = EditorProxy()
    FormatToolbar(proxy: proxy)
        .frame(width: 600)
}

#endif
