#if os(iOS)
import SwiftUI
import UIKit

/// Trailing nav-bar profile control — photo fills the glass disc; glyph-only fallback matches `SpaceSwitcherView` (system glass, no inner gray orb).
enum HarvousIOSProfileToolbarMetrics {
    /// Fills the iOS 26 toolbar glass circle when shared background is hidden.
    static let photoDiscPointSize: CGFloat = 44
    /// Same edge as home space glyph in `SpaceSwitcherView` (iPhone toolbar).
    static let toolbarGlyphEdgePt: CGFloat = 16
}

/// Trailing profile `ToolbarItem` with iOS 26 glass suppression when a Clerk photo is shown.
struct HarvousIOSProfileToolbarTrailingItem: ToolbarContent {
    let action: () -> Void
    @Bindable private var bridge = HarvousClerkBridge.shared

    private var hasPhoto: Bool {
        bridge.currentProfile?.hasImage == true
    }

    var body: some ToolbarContent {
        if #available(iOS 26.0, *), hasPhoto {
            ToolbarItem(placement: .topBarTrailing) {
                HarvousIOSProfileToolbarButton(action: action)
            }
            .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .topBarTrailing) {
                HarvousIOSProfileToolbarButton(action: action)
            }
        }
    }
}

struct HarvousIOSProfileToolbarButton: View {
    @Bindable private var bridge = HarvousClerkBridge.shared
    let action: () -> Void

    private var hasPhoto: Bool {
        bridge.currentProfile?.hasImage == true
    }

    var body: some View {
        if hasPhoto, let url = HarvousProfilePhotoLoader.validatedURL(from: bridge.currentProfile?.imageUrl) {
            Button(action: action) {
                HarvousProfilePhotoView(url: url, size: HarvousIOSProfileToolbarMetrics.photoDiscPointSize)
                    .frame(
                        width: HarvousIOSProfileToolbarMetrics.photoDiscPointSize,
                        height: HarvousIOSProfileToolbarMetrics.photoDiscPointSize
                    )
                    .clipShape(Circle())
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .tint(.primary)
            .accessibilityLabel("Account, profile, and settings")
        } else {
            Button(action: action) {
                HarvousFAGlyph(
                    assetName: "Harvous.UserFilled",
                    edgePt: HarvousIOSProfileToolbarMetrics.toolbarGlyphEdgePt
                )
                .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)
            .tint(.primary)
            .accessibilityLabel("Account, profile, and settings")
        }
    }
}
#endif
