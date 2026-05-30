#if canImport(ClerkKitUI) && os(iOS)
import ClerkKitUI
import SwiftUI

/// Typography and accent tokens for ClerkKitUI sheets (`UserProfileView`, etc.).
@MainActor
enum HarvousClerkTheme {
    static var profile: ClerkTheme {
        var theme = ClerkTheme.default
        theme.fonts = ClerkTheme.Fonts(
            largeTitle: HarvousFonts.font(size: 34, weight: 600, design: .rounded),
            title: HarvousFonts.font(size: 28, weight: 580, design: .rounded),
            title2: HarvousFonts.font(size: 22, weight: 560, design: .rounded),
            title3: HarvousFonts.font(size: 20, weight: 540),
            headline: HarvousFonts.font(size: 17, weight: 600),
            subheadline: HarvousFonts.font(size: 15, weight: 480),
            body: HarvousFonts.font(size: 17, weight: 400),
            callout: HarvousFonts.font(size: 16, weight: 400),
            footnote: HarvousFonts.font(size: 13, weight: 400),
            caption: HarvousFonts.font(size: 12, weight: 420),
            caption2: HarvousFonts.font(size: 11, weight: 400)
        )
        theme.colors.primary = .harvousAccent
        theme.design.borderRadius = 10
        return theme
    }
}
#endif
