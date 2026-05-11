#if os(iOS)
import SwiftUI
import UIKit

/// Single implementation for floating bottom chrome (compose orb, search capsule, format bar, etc.).
enum HarvousIOSFloatingChromeBackdrop {
    @ViewBuilder
    static func material<S: InsettableShape>(_ shape: S, colorScheme: ColorScheme) -> some View {
        if #available(iOS 26.0, *) {
            shape
                .fill(Color.clear)
                .glassEffect(in: shape)
        } else {
            shape
                .fill(.ultraThinMaterial)
                .overlay {
                    shape.strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.08 : 0.06), lineWidth: 0.5)
                }
                .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.35 : 0.08), radius: 6, x: 0, y: 2)
        }
    }
}

/// Layout metrics for the root `MorphingChromeBar` and paired editor chrome (study docks, etc.).
enum HarvousIOSMorphingChromeLayout {
    /// Gap between floating controls in the bottom row (list orb, search pill, compose, connections capsule…).
    static let interChromeSpacing: CGFloat = 12
    /// Padding under the morphing chrome when the keyboard is up (`safeAreaInset` `spacing:` only separates main content from chrome—not chrome from keyboard).
    static let keyboardBreathingPadding: CGFloat = interChromeSpacing
    /// Primary row height (44pt orbs and capsules).
    static let chromeControlsHeight: CGFloat = 44
    /// Inner bottom padding on `IOSNoteFooterHybridRow` / `HarvousIOSInlineBottomChromeRow`.
    static let chromeRowBottomPadding: CGFloat = 4
    /// Vertical size of the morphing chrome block inside `safeAreaInset` (controls + row padding).
    static var morphingChromeLayoutHeight: CGFloat {
        chromeControlsHeight + chromeRowBottomPadding
    }
    /// Pulls scripture/highlight docks toward the toolbar; keeps layout math centralized.
    static let studyDockDownwardNudge: CGFloat = 14
    /// Distance from study/highlight docks to the **bottom of the editor viewport** (`safeAreaInset` top).
    /// When `footerChromeCollapsed` is true (`suppressesBottomMorphingChromeContent`), the morphing footer row drops to
    /// zero height; add its former height here so docks keep the **same gap to the keyboard** as when the footer shows.
    static func studyDockOverlayBottomInset(footerChromeCollapsed: Bool) -> CGFloat {
        let nominal = morphingChromeLayoutHeight + interChromeSpacing - studyDockDownwardNudge
        return footerChromeCollapsed ? nominal + morphingChromeLayoutHeight : nominal
    }

    /// Bottom padding inside the note editor’s outer `ScrollView` so the last lines can scroll above the floating footer (`UITextView` has `isScrollEnabled == false`).
    static var noteEditorScrollContentBottomPadding: CGFloat {
        morphingChromeLayoutHeight + interChromeSpacing + 16
    }
}

/// Bottom safe-area chrome: hub list/search/compose, or note editor hybrid (connections / format / scripture + compose).
struct MorphingChromeBar: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let modeSpring = Animation.spring(response: 0.38, dampingFraction: 0.82)

    private var isNoteRoute: Bool {
        appRouter.iosActiveNoteEditorChromeProxy != nil
    }

    private var collapsesMorphingChromeForStudyDock: Bool {
        appRouter.iosNoteFooterSupplement?.suppressesBottomMorphingChromeContent == true
            && appRouter.iosActiveNoteEditorChromeProxy != nil
    }

    var body: some View {
        Group {
            if isNoteRoute {
                if collapsesMorphingChromeForStudyDock {
                    Color.clear.frame(height: 0)
                } else {
                    IOSNoteFooterHybridRow()
                }
            } else {
                HarvousIOSInlineBottomChromeRow()
            }
        }
        .animation(reduceMotion ? .easeInOut(duration: 0.22) : modeSpring, value: isNoteRoute)
        .animation(
            reduceMotion ? .easeInOut(duration: 0.22) : modeSpring,
            value: collapsesMorphingChromeForStudyDock
        )
        .background(Color.clear)
    }
}

/// Bottom safe-area row on note routes: editor footer (format / scripture / connections) replaces list + search; compose orb stays.
struct IOSNoteFooterHybridRow: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(alignment: .center, spacing: HarvousIOSMorphingChromeLayout.interChromeSpacing) {
            if let proxy = appRouter.iosActiveNoteEditorChromeProxy, let supplement = appRouter.iosNoteFooterSupplement {
                IOSNoteEditorFooterSlot(proxy: proxy, supplement: supplement)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            composeOrb
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }

    private var composeOrb: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            appRouter.requestComposeNewNote()
        } label: {
            HarvousFAGlyph(assetName: "Harvous.Pencil")
                .foregroundStyle(Color.primary.opacity(0.9))
                .frame(width: 44, height: 44)
                .background {
                    HarvousIOSFloatingChromeBackdrop.material(Circle(), colorScheme: colorScheme)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("New note")
    }
}

/// Mirrors `NoteEditorView` footer branching; format + scripture share one inset glass capsule (connections stays separate).
private struct IOSNoteEditorFooterSlot: View {
    @ObservedObject var proxy: EditorProxy
    let supplement: HarvousIOSNoteFooterSupplement
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    @StateObject private var scriptureInsetCoordinator = ScripturePillActionBarCoordinator()

    private let spring = HarvousAnimation.spring

    private var showsUnifiedFormattingScriptureCapsule: Bool {
        // Scripture toolbar + passage preview only belong in the tapped-pill dock, not the footer capsule.
        proxy.shouldShowNoteToolbar
    }

    private enum IOSInsetUnifiedLane: Equatable {
        case formatting
        case scriptureEditing
    }

    private var iosInsetUnifiedLane: IOSInsetUnifiedLane {
        proxy.shouldShowNoteToolbar ? .formatting : .scriptureEditing
    }

    private var laneContentSwapAnimation: Animation {
        reduceMotion ? .easeInOut(duration: 0.22) : .spring(response: 0.34, dampingFraction: 0.86)
    }

    /// Toolbar band: incoming slides from trailing, outgoing toward leading (invert for formatting toolbar).
    private var scriptureToolbarInShellTransition: AnyTransition {
        if reduceMotion {
            AnyTransition.opacity
        } else {
            .asymmetric(
                insertion: .opacity.combined(with: .offset(x: 16)),
                removal: .opacity.combined(with: .offset(x: -16))
            )
        }
    }

    private var formattingToolbarInShellTransition: AnyTransition {
        if reduceMotion {
            AnyTransition.opacity
        } else {
            .asymmetric(
                insertion: .opacity.combined(with: .offset(x: -16)),
                removal: .opacity.combined(with: .offset(x: 16))
            )
        }
    }

    private var scripturePassageInShellTransition: AnyTransition {
        reduceMotion ? .opacity : .opacity.combined(with: .offset(y: -6))
    }

    /// Top 44pt band swaps views with asymmetric transitions inside the clipped shell; passage fades in underneath.
    private var iosUnifiedFormatScriptureEditingChrome: some View {
        let lane = iosInsetUnifiedLane
        let shell = RoundedRectangle(cornerRadius: 22, style: .continuous)
        return VStack(spacing: 0) {
            ZStack(alignment: .leading) {
                if lane == .formatting {
                    NoteToolbar(proxy: proxy)
                        .environment(\.harvousIOSNoteToolbarEmbeddedInUnifiedShell, true)
                        .transition(formattingToolbarInShellTransition)
                } else {
                    ScripturePillToolbarLane(
                        coordinator: scriptureInsetCoordinator,
                        proxy: proxy,
                        horizontalPadding: 14
                    )
                    .transition(scriptureToolbarInShellTransition)
                }
            }
            .frame(height: 44)
            .clipped()

            if lane == .scriptureEditing {
                ScripturePillPassagePanel(coordinator: scriptureInsetCoordinator)
                    .transition(scripturePassageInShellTransition)
            }
        }
        .animation(laneContentSwapAnimation, value: lane)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            HarvousIOSFloatingChromeBackdrop.material(shell, colorScheme: colorScheme)
        }
        .clipShape(shell)
    }

    var body: some View {
        Group {
            if supplement.suppressesBottomMorphingChromeContent {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: HarvousIOSMorphingChromeLayout.chromeControlsHeight)
            } else if showsUnifiedFormattingScriptureCapsule {
                iosUnifiedFormatScriptureEditingChrome
                    .id("iosInsetUnifiedFormatScriptureCapsule")
                    .transition(.opacity)
            } else {
                NoteConnectionsBar(
                    note: supplement.note,
                    snapshot: supplement.trailSnapshot,
                    currentNoteTitle: supplement.connectionsTitleLine,
                    onOpenLinkedNote: supplement.onOpenLinkedNote,
                    onConnectionsChanged: supplement.onRefreshConnections,
                    horizontalEdgePadding: 14
                )
                .frame(height: 44)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background { HarvousIOSFloatingChromeBackdrop.material(Capsule(style: .continuous), colorScheme: colorScheme) }
                .clipShape(Capsule(style: .continuous))
                .id("iosInsetConnectionsBar")
                .transition(.opacity)
            }
        }
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : spring, value: showsUnifiedFormattingScriptureCapsule)
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : spring, value: supplement.suppressesBottomMorphingChromeContent)
        .onAppear {
            scriptureInsetCoordinator.bind(proxy: proxy)
        }
        .onChange(of: proxy.activeScripturePill) { _, _ in
            scriptureInsetCoordinator.bind(proxy: proxy)
        }
        .onChange(of: supplement.suppressScripturePillActionBar) { _, _ in
            scriptureInsetCoordinator.bind(proxy: proxy)
        }
    }
}

#else
enum MorphingChromeBarBuiltForIOSOnlyMarker {}
#endif
