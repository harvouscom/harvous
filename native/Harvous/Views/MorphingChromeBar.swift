import SwiftUI

// MARK: - Daily passage pill list scroll reserve (macOS sidebar + iOS lists)

enum HarvousDailyPassagePillListLayout {
    /// Pill card (~75pt) + 8pt bottom padding — used when the pill is pinned below a `List` but does not
    /// propagate into scroll content insets (macOS sidebar `Spacer` layout, iOS floating chrome, etc.).
    static let bottomScrollReserve: CGFloat = 76
}

/// Adds bottom scroll-content inset so the last `List` row clears the daily-passage pill when visible.
/// Apply directly on the `List`, not on a parent `VStack` (avoids insetting horizontal chip bars).
struct HarvousListDailyPassagePillScrollReserveModifier: ViewModifier {
    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var dismissedDay: String = ""

    private var bottomReserve: CGFloat {
        dismissedDay != VotdService.todayCalendarDayKey()
            ? HarvousDailyPassagePillListLayout.bottomScrollReserve
            : 0
    }

    func body(content: Content) -> some View {
        content.contentMargins(.bottom, bottomReserve, for: .scrollContent)
    }
}

extension View {
    func harvousListDailyPassagePillScrollReserve() -> some View {
        modifier(HarvousListDailyPassagePillScrollReserveModifier())
    }
}

#if os(macOS)
/// Applies pill scroll reserve only for lists embedded in the macOS sidebar (pinned pill below via `Spacer`).
struct MacOSSidebarDailyPassagePillListReserve: ViewModifier {
    let enabled: Bool

    func body(content: Content) -> some View {
        if enabled {
            content.modifier(HarvousListDailyPassagePillScrollReserveModifier())
        } else {
            content
        }
    }
}
#endif

#if os(iOS)
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

    /// Fills the keyboard “breathing” band under floating chrome so list background does not show through.
    @ViewBuilder
    static func keyboardGapFill(colorScheme: ColorScheme) -> some View {
        let shape = Rectangle()
        if #available(iOS 26.0, *) {
            shape
                .fill(Color.clear)
                .glassEffect(in: shape)
        } else {
            shape.fill(.ultraThinMaterial)
        }
    }
}

/// Layout metrics for the root `MorphingChromeBar` and paired editor chrome (study docks, etc.).
enum HarvousIOSMorphingChromeLayout {
    /// Gap between floating controls in the bottom row (list orb, search pill, compose, format toolbar…).
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
    /// Vertical footprint of MorphingHybrid note footer (`IOSNoteFooterHybridRow`) resting above home indicator —
    /// `safeAreaInset(edge: .bottom, spacing: interChromeSpacing)` slab + capsule row metrics from this file +
    /// `MorphingChromeBar.padding(.bottom, …)` in `ContentView.iosMorphingChromeInset`.
    ///
    /// Use when computing scroll/content padding beside the chrome slot. Study docks that replace this footer
    /// use `safeAreaInset` in `NoteEditorView` (not a positive layout `offset`) so they align with this band without clipping.
    static var morphingChromeFooterOccupiedHeightAboveMainColumnBottom: CGFloat {
        interChromeSpacing + morphingChromeLayoutHeight
    }

    /// Bottom padding inside the note editor’s outer `ScrollView` so the last lines can scroll above the floating footer (`UITextView` has `isScrollEnabled == false`).
    static var noteEditorScrollContentBottomPadding: CGFloat {
        morphingChromeFooterOccupiedHeightAboveMainColumnBottom + 16
    }

    /// Region left untapped by the camera-orb dismiss layer so morphing chrome (stacked orbs + row) stays interactive.
    static var composeCameraOrbDismissTapCatcherBottomReserve: CGFloat {
        chromeControlsHeight * 2 + 10 + chromeRowBottomPadding + interChromeSpacing + 12
    }

    /// Extra bottom inset reserved above the chrome row when the daily-passage pill is visible.
    /// See `HarvousDailyPassagePillListLayout.bottomScrollReserve` for the shared constant.
    static let dailyPassagePillBottomScrollReserve: CGFloat = HarvousDailyPassagePillListLayout.bottomScrollReserve
}

/// Adds the right amount of bottom scroll-content inset to a vertical `List` so its last
/// row clears the floating chrome bar (and the daily-passage pill when visible). Must be
/// applied directly to the List — applying it to a parent view would also affect the
/// horizontal `ScrollView`s used for category chip bars and create unwanted vertical gaps.
struct IOSListBottomChromeReserveModifier: ViewModifier {
    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var dismissedDay: String = ""

    private var pillVisible: Bool {
        dismissedDay != VotdService.todayCalendarDayKey()
    }

    private var bottomReserve: CGFloat {
        let chromeReserve = HarvousIOSMorphingChromeLayout.morphingChromeFooterOccupiedHeightAboveMainColumnBottom
        let pillReserve: CGFloat = pillVisible ? HarvousDailyPassagePillListLayout.bottomScrollReserve : 0
        return chromeReserve + pillReserve
    }

    func body(content: Content) -> some View {
        content.contentMargins(.bottom, bottomReserve, for: .scrollContent)
    }
}

extension View {
    /// iOS-only — see `IOSListBottomChromeReserveModifier`.
    func iosListBottomChromeReserve() -> some View {
        modifier(IOSListBottomChromeReserveModifier())
    }
}

/// iPad-aware wrapper: applies `iosListBottomChromeReserve` only when not in the iPad split layout.
/// In `iPadRootView`, lists live inside a `NavigationSplitView` column with no floating bottom chrome,
/// so the iPhone-sized reserve would push the daily-passage pill into the middle of the column.
struct IPadAwareListBottomChromeReserve: ViewModifier {
    let skip: Bool

    func body(content: Content) -> some View {
        if skip {
            content.modifier(HarvousListDailyPassagePillScrollReserveModifier())
        } else {
            content.iosListBottomChromeReserve()
        }
    }
}

// MARK: - Compose orb + long-press camera (scan text)

/// Reliable tap vs long-press: SwiftUI `Button` + `onLongPressGesture` often fails because gesture edges compete.
private struct HarvousIOSPencilOrbHitSurface: UIViewRepresentable {
    var longPressMinimumDuration: TimeInterval
    var onShortTap: () -> Void
    var onLongPress: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onShortTap: onShortTap, onLongPress: onLongPress)
    }

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.backgroundColor = .clear
        v.isAccessibilityElement = false

        let long = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.longPress(_:)))
        long.minimumPressDuration = longPressMinimumDuration
        long.allowableMovement = 28
        long.cancelsTouchesInView = false

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.shortTap))
        tap.cancelsTouchesInView = false
        tap.require(toFail: long)

        v.addGestureRecognizer(long)
        v.addGestureRecognizer(tap)
        context.coordinator.longPressRecognizer = long
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onShortTap = onShortTap
        context.coordinator.onLongPress = onLongPress
        context.coordinator.longPressRecognizer?.minimumPressDuration = longPressMinimumDuration
    }

    @MainActor
    final class Coordinator: NSObject {
        var onShortTap: () -> Void
        var onLongPress: () -> Void
        weak var longPressRecognizer: UILongPressGestureRecognizer?

        init(onShortTap: @escaping () -> Void, onLongPress: @escaping () -> Void) {
            self.onShortTap = onShortTap
            self.onLongPress = onLongPress
        }

        @objc func shortTap() {
            onShortTap()
        }

        @objc func longPress(_ g: UILongPressGestureRecognizer) {
            guard g.state == .began else { return }
            onLongPress()
        }
    }
}

/// Pencil compose orb; long-press reveals a circular **camera** orb above (Font Awesome `Harvous.Camera`).
struct HarvousIOSComposeOrbCluster<Chrome: View>: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewBuilder var circleChrome: () -> Chrome

    private let orbSize = HarvousIOSMorphingChromeLayout.chromeControlsHeight
    private let orbGap: CGFloat = 10
    private let longPressDuration: TimeInterval = 0.4

    private var revealAnimation: Animation {
        reduceMotion ? .easeInOut(duration: 0.18) : .spring(response: 0.34, dampingFraction: 0.82)
    }

    var body: some View {
        VStack(spacing: orbGap) {
            if appRouter.iosComposeCameraOrbPresented {
                Button {
                    appRouter.requestPresentTextCaptureForCompose()
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Camera", edgePt: 20)
                        .foregroundStyle(Color.primary.opacity(0.9))
                        .frame(width: orbSize, height: orbSize)
                        .background { circleChrome() }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Scan text from camera")
                .transition(.scale(scale: 0.88).combined(with: .opacity))
            }
            ZStack {
                HarvousFAGlyph(assetName: "Harvous.Pencil")
                    .foregroundStyle(Color.primary.opacity(0.9))
                    .frame(width: orbSize, height: orbSize)
                    .background { circleChrome() }
                HarvousIOSPencilOrbHitSurface(
                    longPressMinimumDuration: longPressDuration,
                    onShortTap: {
                        if appRouter.iosComposeCameraOrbPresented {
                            appRouter.dismissIOSComposeCameraOrbIfPresented()
                        } else {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            appRouter.requestComposeNewNote()
                        }
                    },
                    onLongPress: {
                        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                        withAnimation(revealAnimation) {
                            appRouter.iosComposeCameraOrbPresented = true
                        }
                    }
                )
                .frame(width: orbSize, height: orbSize)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("New note")
            .accessibilityHint("Long-press to show camera text scanning.")
            .accessibilityAddTraits(.isButton)
        }
        .animation(revealAnimation, value: appRouter.iosComposeCameraOrbPresented)
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
        .fullScreenCover(isPresented: $appRouter.iosTextCaptureFlowPresented) {
            IOSTextCaptureComposeFlow(
                onCapture: { text in
                    appRouter.iosTextCaptureFlowPresented = false
                    appRouter.requestComposeNewNote(initialBody: text)
                },
                onCancel: {
                    appRouter.iosTextCaptureFlowPresented = false
                }
            )
        }
    }
}

/// Bottom safe-area row on note routes: formatting toolbar when body is focused; compose orb stays.
struct IOSNoteFooterHybridRow: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        // Match hub row: bottom-align so the pencil compose orb stays on one baseline when the camera orb stacks above.
        HStack(alignment: .bottom, spacing: HarvousIOSMorphingChromeLayout.interChromeSpacing) {
            Group {
                if let proxy = appRouter.iosActiveNoteEditorChromeProxy, let supplement = appRouter.iosNoteFooterSupplement {
                    IOSNoteEditorFooterSlot(proxy: proxy, supplement: supplement)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: HarvousIOSMorphingChromeLayout.chromeControlsHeight)
                }
            }
            .simultaneousGesture(
                TapGesture().onEnded {
                    appRouter.dismissIOSComposeCameraOrbIfPresented()
                }
            )
            composeOrb
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }

    private var composeOrb: some View {
        HarvousIOSComposeOrbCluster {
            HarvousIOSFloatingChromeBackdrop.material(Circle(), colorScheme: colorScheme)
        }
        .fixedSize(horizontal: true, vertical: true)
    }
}

/// Mirrors Mac `NoteEditorView` footer branching — formatting toolbar only when the body is first responder.
private struct IOSNoteEditorFooterSlot: View {
    @ObservedObject var proxy: EditorProxy
    let supplement: HarvousIOSNoteFooterSupplement
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    private let spring = HarvousAnimation.spring

    /// Same gate as Mac `shouldShowFormatToolbarInline` in `NoteEditorView`.
    private var showsFormattingToolbar: Bool {
        proxy.isBodyFirstResponder
    }

    private var formattingToolbarChrome: some View {
        let shell = RoundedRectangle(cornerRadius: 22, style: .continuous)
        return NoteToolbar(proxy: proxy)
            .environment(\.harvousIOSNoteToolbarEmbeddedInUnifiedShell, true)
            .frame(height: HarvousIOSMorphingChromeLayout.chromeControlsHeight)
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
            } else if showsFormattingToolbar {
                formattingToolbarChrome
                    .id("iosInsetFormattingToolbar")
                    .transition(.opacity)
            } else {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: HarvousIOSMorphingChromeLayout.chromeControlsHeight)
            }
        }
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : spring, value: showsFormattingToolbar)
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : spring, value: supplement.suppressesBottomMorphingChromeContent)
    }
}

#else
enum MorphingChromeBarBuiltForIOSOnlyMarker {}
#endif
