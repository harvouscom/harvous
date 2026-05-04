#if os(iOS)
import SwiftUI
import UIKit

/// Single morphing bottom lane (`orb-row` ↔ `format` ↔ `scripture`) for iPhone.
struct MorphingChromeBar: View {
    @ObservedObject var coordinator: ChromeCoordinator
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let modeSpring = Animation.spring(response: 0.38, dampingFraction: 0.82)

    private var laneMinHeight: CGFloat {
        switch coordinator.mode {
        case .orbRow: return 62
        case .format: return 54
        case .scripture: return 220
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Color(uiColor: .separator).frame(height: 0.333)
                .allowsHitTesting(false)

            ZStack(alignment: .bottom) {
                Group {
                    switch coordinator.mode {
                    case .orbRow:
                        HarvousIOSInlineBottomChromeRow()
                            .transition(.opacity)
                    case .format:
                        if let p = appRouter.iosActiveNoteEditorChromeProxy {
                            NoteToolbar(proxy: p)
                                .transition(.opacity)
                        } else {
                            HarvousIOSInlineBottomChromeRow()
                                .transition(.opacity)
                        }
                    case .scripture:
                        if let p = appRouter.iosActiveNoteEditorChromeProxy {
                            ScripturePillActionBar(proxy: p)
                                .transition(.opacity)
                        } else {
                            HarvousIOSInlineBottomChromeRow()
                                .transition(.opacity)
                        }
                    }
                }
                .animation(reduceMotion ? .easeInOut(duration: 0.22) : modeSpring, value: coordinator.mode)
            }
            .frame(minHeight: laneMinHeight, alignment: .bottom)
            .clipped()
            .animation(reduceMotion ? nil : modeSpring, value: coordinator.mode)
        }
        .frame(maxWidth: .infinity)
    }
}

#else
enum MorphingChromeBarBuiltForIOSOnlyMarker {}
#endif
