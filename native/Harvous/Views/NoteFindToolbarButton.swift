import SwiftUI

/// Find-in-note orb — opens a compact popover anchored to the toolbar button (⇧F).
struct NoteFindToolbarButton: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    /// macOS / iPad unified toolbar uses bordered capsule buttons.
    var useBorderedToolbarStyle: Bool = false

    @State private var showFindPopover = false

    private var editorProxy: EditorProxy? {
        #if os(macOS)
        appRouter.macActiveNoteEditorChromeProxy
        #else
        appRouter.iosActiveNoteEditorChromeProxy
        #endif
    }

    var body: some View {
        Button {
            openFindPopover()
        } label: {
            findButtonLabel
        }
        #if os(iOS)
        .buttonStyle(.plain)
        .tint(.primary)
        #else
        .modifier(FindToolbarButtonStyleModifier(useBordered: useBorderedToolbarStyle))
        #endif
        .help("Find in note (⇧F)")
        .accessibilityLabel("Find in note")
        .disabled(editorProxy == nil)
        .popover(isPresented: $showFindPopover, arrowEdge: popoverArrowEdge) {
            if let editorProxy {
                FindInNotePopoverContent(
                    editorProxy: editorProxy,
                    isPresented: $showFindPopover
                )
            }
        }
        .onChange(of: appRouter.findInNoteRequestToken) { _, token in
            guard token != nil else { return }
            openFindPopover()
        }
        .onChange(of: appRouter.noteEditorChromeGeneration) { _, _ in
            openFindPopoverIfRequested()
        }
    }

    private var popoverArrowEdge: Edge {
        #if os(iOS)
        return .top
        #else
        return .bottom
        #endif
    }

    private func openFindPopover() {
        guard editorProxy != nil else { return }
        showFindPopover = true
        appRouter.consumeFindInNoteRequest()
    }

    private func openFindPopoverIfRequested() {
        guard appRouter.findInNoteRequestToken != nil else { return }
        openFindPopover()
    }

    @ViewBuilder
    private var findButtonLabel: some View {
        let glyph = HarvousFAGlyph(
            assetName: "Harvous.MagnifyingGlass",
            edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
        )
        .frame(
            width: useBorderedToolbarStyle
                ? HarvousFAIconMetrics.catalogGlyphBoxPt
                : 40,
            height: useBorderedToolbarStyle
                ? HarvousFAIconMetrics.catalogGlyphBoxPt
                : 40
        )
        .contentShape(Rectangle())

        #if os(macOS)
        if useBorderedToolbarStyle {
            glyph.harvousToolbarShortcutHint("F")
        } else {
            glyph
        }
        #else
        glyph
        #endif
    }
}

#if os(macOS)
private struct FindToolbarButtonStyleModifier: ViewModifier {
    var useBordered: Bool

    func body(content: Content) -> some View {
        if useBordered {
            content.buttonStyle(.bordered)
        } else {
            content.buttonStyle(.plain)
        }
    }
}
#endif
