import SwiftUI

enum HarvousTypography {
    // MARK: - App default (SF)

    /// Common body size — use explicitly on views (global `.environment(\.font, …)` was forcing 16pt into `.searchable` and other system fields on macOS).
    static let appDefault = HarvousFonts.font(size: 16, weight: 400, design: .default)

    // MARK: - Display (SF Rounded)

    /// 34pt — empty states, page headers
    static let largeTitle = HarvousFonts.font(size: 34, weight: 620, design: .rounded)

    /// 20pt — section headers
    static let title = HarvousFonts.font(size: 20, weight: 580, design: .rounded)

    /// Sidebar list — note title
    static let noteListTitle = HarvousFonts.font(size: {
        #if os(iOS)
        return 17
        #else
        return 15
        #endif
    }(), weight: 500, design: .default)

    /// Sidebar list — time + excerpt preview
    static let noteListPreview = HarvousFonts.font(size: {
        #if os(iOS)
        return 14
        #else
        return 12
        #endif
    }(), weight: 400, design: .default)

    /// Card stack — note title
    static let noteCardTitle = HarvousFonts.font(size: 16, weight: 600, design: .default)

    /// 16pt — body text
    static let body = HarvousFonts.font(size: 16, weight: 400, design: .default)

    /// 13pt — metadata, dates, tags
    static let caption = HarvousFonts.font(size: 13, weight: 500, design: .default)

    /// 11pt — secondary metadata
    static let footnote = HarvousFonts.font(size: 11, weight: 400, design: .default)

    // MARK: - Search (custom `TextField` / overlay UIs; `.searchable` uses platform defaults)

    static let searchField = HarvousFonts.font(size: 15, weight: 400, design: .default)

    static let searchFieldCompact = HarvousFonts.font(size: 14, weight: 400, design: .default)

    static let searchEmptyState = HarvousFonts.font(size: 13, weight: 400, design: .default)

    static let searchSpotlightTitle = HarvousFonts.font(size: 13, weight: 500, design: .default)

    static let searchSpotlightMeta = HarvousFonts.font(size: 11, weight: 400, design: .default)

    // MARK: - UI chrome

    /// Note title field — matches in-editor casual display
    static let composeTitleField = HarvousFonts.font(size: 22, weight: 600, design: .rounded)

    static let subheadline = HarvousFonts.font(size: 15, weight: 400, design: .default)

    static let actionBarChip = HarvousFonts.font(size: 15, weight: 500, design: .default)
    static let actionBarMeta = HarvousFonts.font(size: 15, weight: 400, design: .default)

    static let inspectorBody = HarvousFonts.font(size: 12, weight: 400, design: .default)
    static let inspectorCompact = HarvousFonts.font(size: 11, weight: 400, design: .default)
    static let inspectorCompactMedium = HarvousFonts.font(size: 11, weight: 500, design: .default)
    static let inspectorSectionLabel = HarvousFonts.font(size: 10, weight: 600, design: .default)

    static let formatBarKeyBold = HarvousFonts.font(size: 15, weight: .bold, design: .default)
    static let formatBarKeyBody = HarvousFonts.font(size: 15, weight: .regular, design: .default)
}
