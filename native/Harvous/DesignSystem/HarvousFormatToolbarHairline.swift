import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

/// Vertical hairline matching `NoteToolbar` group dividers and web `tiptap-toolbar__group-divider--prototype`.
struct HarvousFormatToolbarHairline: View {
    var height: CGFloat = 22

#if os(iOS)
    @Environment(\.displayScale) private var displayScale
#endif

    var body: some View {
        Rectangle()
            .fill(Self.separatorColor)
            .frame(width: thickness, height: height)
    }

    static var separatorColor: Color {
#if os(macOS)
        Color(nsColor: .separatorColor)
#else
        Color(uiColor: .separator)
#endif
    }

    private var thickness: CGFloat {
#if os(iOS)
        1.0 / displayScale
#else
        0.5
#endif
    }
}
