import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Environment

private struct HarvousGlassTintKey: EnvironmentKey {
    static let defaultValue: Color? = nil
}

extension EnvironmentValues {
    /// Shell glass tint derived from the active canvas (preset or photo average).
    var harvousGlassTint: Color? {
        get { self[HarvousGlassTintKey.self] }
        set { self[HarvousGlassTintKey.self] = newValue }
    }
}

// MARK: - Canvas layer

/// Frost over a photo wallpaper — matches macOS `NoteToolbar` (`.thinMaterial`) and web
/// `html.harvous-proto-wallpaper-image .proto-shell-frame` backdrop blur.
private struct HarvousImageWallpaperFrostOverlay: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var tint: Color

    var body: some View {
        Group {
            if reduceTransparency {
                tint.opacity(colorScheme == .dark ? 0.94 : 0.92)
            } else {
                frostMaterial
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var frostMaterial: some View {
        #if os(macOS)
        ZStack {
            Rectangle().fill(.thinMaterial)
            tint.opacity(colorScheme == .dark ? 0.10 : 0.06)
        }
        #else
        ZStack {
            if #available(iOS 26.0, *) {
                Rectangle()
                    .fill(.clear)
                    .glassEffect(in: Rectangle())
            } else {
                Rectangle().fill(.ultraThinMaterial)
            }
            tint.opacity(colorScheme == .dark ? 0.10 : 0.06)
        }
        #endif
    }
}

struct HarvousCanvasLayerView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(HarvousAppearanceStore.self) private var store

    var body: some View {
        ZStack {
            wallpaperBaseLayer
            if store.isPhotoSelected() {
                HarvousImageWallpaperFrostOverlay(tint: store.canvasColor(for: colorScheme))
            }
        }
        .ignoresSafeArea()
    }

    @ViewBuilder
    private var wallpaperBaseLayer: some View {
        Group {
            if let url = store.canvasImageURL() {
                #if os(macOS)
                if let image = NSImage(contentsOf: url) {
                    GeometryReader { geo in
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: geo.size.width, height: geo.size.height)
                            .clipped()
                    }
                } else {
                    store.canvasColor(for: colorScheme)
                }
                #else
                if let uiImage = UIImage(contentsOfFile: url.path) {
                    GeometryReader { geo in
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFill()
                            .frame(width: geo.size.width, height: geo.size.height)
                            .clipped()
                    }
                } else {
                    store.canvasColor(for: colorScheme)
                }
                #endif
            } else {
                store.canvasColor(for: colorScheme)
            }
        }
    }
}

// MARK: - Sidebar column glass (canvas-tinted, not system material)

/// Sidebar / split-column glass that reads the app canvas tint (`harvousGlassTint`), matching web
/// `--pds-glass-shell` + `--pds-glass-panel-frost`. Avoids `Material` / `glassEffect` here — they sample
/// the window/desktop behind `NavigationSplitView`, not the in-app canvas layer.
struct HarvousSidebarColumnGlassBackdrop<S: Shape>: View {
    let shape: S

    @Environment(\.harvousGlassTint) private var glassTint
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(HarvousAppearanceStore.self) private var appearanceStore

    private var canvasTint: Color {
        glassTint ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme)
    }

    private var pageTint: Color {
        colorScheme == .dark ? Color(white: 0.12) : Color(white: 0.99)
    }

    var body: some View {
        ZStack {
            shape.fill(Color.clear)
            if reduceTransparency {
                shape.fill(canvasTint.opacity(colorScheme == .dark ? 0.94 : 0.92))
            } else if appearanceStore.isPhotoSelected() {
                shape.fill(pageTint.opacity(colorScheme == .dark ? 0.08 : 0.06))
            } else {
                shape.fill(canvasTint.opacity(colorScheme == .dark ? 0.56 : 0.52))
                shape.fill(pageTint.opacity(colorScheme == .dark ? 0.32 : 0.30))
            }
            if !reduceTransparency {
                shellSheen.clipShape(shape)
            }
        }
    }

    private var shellSheen: some View {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.08 : 0.22),
                Color.white.opacity(colorScheme == .dark ? 0.02 : 0.04),
                Color.clear,
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .allowsHitTesting(false)
    }
}

enum HarvousSidebarColumnGlassBackdropShape {
    static func macOSColumn() -> UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: HarvousRadius.sidebarGlassLeading,
            bottomTrailingRadius: 0,
            topTrailingRadius: 0,
            style: .continuous
        )
    }
}

// MARK: - Modifier

struct HarvousCanvasBackgroundModifier: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(HarvousAppearanceStore.self) private var store

    func body(content: Content) -> some View {
        ZStack {
            HarvousCanvasLayerView()
                .id(store.canvasVisualIdentity(for: colorScheme))
            content
        }
        .environment(\.harvousGlassTint, store.glassTint(for: colorScheme))
        .onChange(of: colorScheme) { _, scheme in
            store.refreshAppearanceForColorScheme(scheme)
        }
    }
}

extension View {
    func harvousCanvasBackground() -> some View {
        modifier(HarvousCanvasBackgroundModifier())
    }
}

#if os(iOS)
// MARK: - UIKit chrome (NavigationStack / List defaults are opaque)

enum HarvousIOSCanvasChromeAppearance {
    static func applyGlobally() {
        let nav = UINavigationBarAppearance()
        nav.configureWithTransparentBackground()
        nav.backgroundColor = .clear
        nav.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UITableView.appearance().backgroundColor = .clear
        UICollectionView.appearance().backgroundColor = .clear
    }
}

/// Walks up the hosting hierarchy and clears UIKit backgrounds so root canvas color shows through lists.
private struct HarvousIOSNavigationHostClearBackground: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            var parent: UIView? = uiView.superview
            while let current = parent {
                current.backgroundColor = .clear
                if String(describing: type(of: current)).contains("Hosting") {
                    break
                }
                parent = current.superview
            }
        }
    }
}

/// iOS 18+ navigation container background; no-op on iOS 17 (UIKit appearance handles transparency there).
struct HarvousIOSNavigationContainerBackgroundClearModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.containerBackground(.clear, for: .navigation)
        } else {
            content
        }
    }
}

// MARK: - iPhone shell (glass over canvas)

private struct HarvousIOSGlassOverCanvasShellModifier: ViewModifier {
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout

    func body(content: Content) -> some View {
        if isIPadSplitLayout {
            content
        } else {
            if #available(iOS 18.0, *) {
                content
                    .background(Color.clear)
                    .background(HarvousIOSNavigationHostClearBackground())
                    .toolbarBackground(.hidden, for: .navigationBar)
                    .containerBackground(.clear, for: .navigation)
            } else {
                content
                    .background(Color.clear)
                    .background(HarvousIOSNavigationHostClearBackground())
                    .toolbarBackground(.hidden, for: .navigationBar)
            }
        }
    }
}

extension View {
    /// Lets root `.harvousCanvasBackground()` show through iPhone hub lists and note routes.
    /// Skipped inside `iPadRootView` split chrome (sidebar keeps its material column).
    func harvousIOSGlassOverCanvasShell() -> some View {
        modifier(HarvousIOSGlassOverCanvasShellModifier())
    }
}
#endif
