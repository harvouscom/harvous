import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

private extension Color {
    /// Toolbar hairline separators (warm gray on Mac,UIKit separator on iOS).
    static var hvHairlineSeparator: Color {
#if os(macOS)
        Color(nsColor: .separatorColor)
#else
        Color(uiColor: .separator)
#endif
    }

    static var hvToolbarQuaternaryBacking: Color {
#if os(macOS)
        Color(nsColor: .quaternaryLabelColor)
#else
        Color(uiColor: .quaternaryLabel)
#endif
    }
}

/// Horizontal formatting toolbar — unified with macOS styling.
/// Groups: inline | structure | lists | indent | insert | history (trailing)
struct NoteToolbar: View {
    @ObservedObject var proxy: EditorProxy
#if os(iOS)
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.harvousIOSNoteToolbarEmbeddedInUnifiedShell) private var embeddedInIOSUnifiedShell
#endif

    var body: some View {
        let stack = formattingToolbarScrollStack
#if os(iOS)
        Group {
            if embeddedInIOSUnifiedShell {
                stack
            } else {
                stack
                    .background {
                        HarvousIOSFloatingChromeBackdrop.material(Capsule(style: .continuous), colorScheme: colorScheme)
                    }
                    .clipShape(Capsule(style: .continuous))
            }
        }
        // Touch parity with macOS `.onHover` — keep idle hide timer cancelled while a finger is on the bar.
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in proxy.setFormatToolbarHover(true) }
                .onEnded { _ in proxy.setFormatToolbarHover(false) }
        )
#else
        stack
            .background(.thinMaterial)
            .onHover { isHovering in
                proxy.setFormatToolbarHover(isHovering)
            }
#endif
    }

    private var formattingToolbarScrollStack: some View {
        VStack(spacing: 0) {
            #if os(macOS)
            // Top border — span full width of the bar (independent of scroll content width)
            Color.hvHairlineSeparator
                .frame(maxWidth: .infinity)
                .frame(height: 0.5)
            #endif

            HStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        // Inline marks
                        group {
                            iconButton("Harvous.Bold", isActive: proxy.formatToolbar.isBold) { proxy.bold() }
                            iconButton("Harvous.Italic", isActive: proxy.formatToolbar.isItalic) { proxy.italic() }
                            iconButton("Harvous.Strikethrough", isActive: proxy.formatToolbar.isStrikethrough) { proxy.strikethrough() }
                        }

                        NoteToolbarGroupDivider()

                        // Structure (H1 is the note title field only)
                        group {
                            textButton("H2", size: 14, weight: .bold, isActive: proxy.formatToolbar.headingLevel == 2) { proxy.heading(2) }
                            textButton("H3", size: 14, weight: .bold, isActive: proxy.formatToolbar.headingLevel == 3) { proxy.heading(3) }
                            iconButton("Harvous.Link") { proxy.addOrEditLink() }
                        }

                        NoteToolbarGroupDivider()

                        // Lists
                        group {
                            iconButton("Harvous.ListUl", isActive: proxy.formatToolbar.isBulletList) { proxy.insertBullet() }
                            iconButton("Harvous.ListOl", isActive: proxy.formatToolbar.isNumberedList) { proxy.insertNumbered() }
                        }

                        NoteToolbarGroupDivider()

                        // Indent
                        group {
                            iconButton("Harvous.Outdent", isEnabled: proxy.formatToolbar.isIndented) { proxy.outdent() }
                            iconButton("Harvous.Indent", isActive: proxy.formatToolbar.isIndented) { proxy.indent() }
                        }

                        NoteToolbarGroupDivider()

                        // Insert
                        group {
                            iconButton("Harvous.Minus") { proxy.insertDivider() }
                            iconButton("Harvous.Image") { proxy.insertImage() }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                NoteToolbarGroupDivider()

                // History — pinned trailing, always visible
                group {
                    iconButton("Harvous.ArrowRotateLeft", isEnabled: proxy.formatToolbar.canUndo) { proxy.undoEdit() }
                    iconButton("Harvous.ArrowRotateRight", isEnabled: proxy.formatToolbar.canRedo) { proxy.redoEdit() }
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
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
        _ catalogAssetName: String,
        isActive: Bool = false,
        isEnabled: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HarvousFAGlyph(assetName: catalogAssetName, edgePt: 14)
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
}

/// Vertical hairline between format-toolbar groups — one device pixel on iOS, 0.5pt on macOS (matches web `0.5px`).
private struct NoteToolbarGroupDivider: View {
    var body: some View {
        HarvousFormatToolbarHairline()
            .padding(.horizontal, 6)
    }
}

// MARK: - Button style — squishy press

struct NoteToolbarButtonStyle: ButtonStyle {
    var isActive = false

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let emphasized = pressed || isActive
        configuration.label
            .foregroundStyle(emphasized ? Color.primary : Color.secondary)
            .background(
                RoundedRectangle(cornerRadius: HarvousRadius.formatButton)
                    .fill(backgroundFill(isPressed: pressed))
            )
            .scaleEffect(pressed ? 0.88 : 1.0)
            .animation(HarvousAnimation.press, value: pressed)
    }

    private func backgroundFill(isPressed: Bool) -> Color {
        if isPressed { return Color.hvToolbarQuaternaryBacking }
        if isActive { return Color.hvToolbarQuaternaryBacking.opacity(0.5) }
        return .clear
    }
}

#if os(iOS)
private struct HarvousIOSNoteToolbarUnifiedShellEmbeddingKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Parent supplies one glass capsule; skip `NoteToolbar`'s standalone iOS glass + clip when true.
    var harvousIOSNoteToolbarEmbeddedInUnifiedShell: Bool {
        get { self[HarvousIOSNoteToolbarUnifiedShellEmbeddingKey.self] }
        set { self[HarvousIOSNoteToolbarUnifiedShellEmbeddingKey.self] = newValue }
    }
}
#endif

#if DEBUG
private struct NoteToolbar_PreviewsHost: View {
    @StateObject private var proxy = EditorProxy()

    var body: some View {
        NoteToolbar(proxy: proxy)
            .frame(width: 600)
    }
}

#Preview {
    NoteToolbar_PreviewsHost()
}
#endif
