import SwiftUI

enum HarvousTypography {
    // MARK: - App default (Google Sans Flex)

    /// Common body size — use explicitly on views (global `.environment(\.font, …)` was forcing 16pt into `.searchable` and other system fields on macOS).
    static let appDefault = HarvousFonts.font(size: 16, weight: 400, design: .default)

    // MARK: - Display (rounded terminal axis)

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

    /// Note title field — matches in-editor casual display; scales with Dynamic Type / larger text (anchored like the body editor).
    static func composeTitleFieldFont() -> Font {
        #if os(iOS)
        Font(HarvousFonts.noteComposeTitleUIFont())
        #else
        Font(HarvousFonts.noteComposeTitleNSFont())
        #endif
    }

    static let subheadline = HarvousFonts.font(size: 15, weight: 400, design: .default)

    static let actionBarChip = HarvousFonts.font(size: 15, weight: 500, design: .default)
    static let actionBarMeta = HarvousFonts.font(size: 15, weight: 400, design: .default)

    static let inspectorBody = HarvousFonts.font(size: 12, weight: 400, design: .default)
    static let inspectorCompact = HarvousFonts.font(size: 11, weight: 400, design: .default)
    static let inspectorCompactMedium = HarvousFonts.font(size: 11, weight: 500, design: .default)
    static let inspectorSectionLabel = HarvousFonts.font(size: 10, weight: 600, design: .default)

    static let formatBarKeyBold = HarvousFonts.font(size: 15, weight: .bold, design: .default)
    static let formatBarKeyBody = HarvousFonts.font(size: 15, weight: .regular, design: .default)

    /// Settings / profile list rows and menu item labels.
    static let settingsListRow = HarvousFonts.font(size: {
        #if os(iOS)
        return 17
        #else
        return 13
        #endif
    }(), weight: 400, design: .default)

    /// Settings forms and grouped lists — macOS uses 14pt so Google Sans Flex matches SF ~13pt body.
    static let settingsFormEnvironment = HarvousFonts.font(size: {
        #if os(iOS)
        return 16
        #else
        return 14
        #endif
    }(), weight: 400, design: .default)

    /// macOS toolbar profile menu actions (e.g. Settings…).
    static let profileMenuAction = HarvousFonts.font(size: 13, weight: 400, design: .default)

    // MARK: - Share popover (matches prototype `proto-share-popover__*` sizes)

    static let sharePopoverTitle = HarvousFonts.font(size: 15, weight: 600, design: .default)
    static let sharePopoverBody = HarvousFonts.font(size: 13.5, weight: 400, design: .default)
    static let sharePopoverAction = HarvousFonts.font(size: 15, weight: 500, design: .default)
    static let sharePopoverPrimaryButton = HarvousFonts.font(size: 15, weight: 600, design: .default)
}

extension View {
    /// Apply Google Sans Flex to SwiftUI lists, menus, and form rows that otherwise inherit SF via environment defaults.
    func harvousListMenuTypography() -> some View {
        environment(\.font, HarvousTypography.settingsFormEnvironment)
    }
}
