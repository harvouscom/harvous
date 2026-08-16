import SwiftUI

/// Reader text-size steps, shared by the reading canvas and its inspector control.
///
/// Point sizes are the source of truth for `--pds-reader-font-size` on web — change
/// them here first. Reading is the one place a user sets their own size, so the steps
/// are deliberately few and each is a visible jump.
enum ReaderTextSize: String, CaseIterable, Codable, Sendable {
    case small
    case medium
    case large
    case xlarge

    var pointSize: CGFloat {
        switch self {
        case .small: return 17
        case .medium: return 19
        case .large: return 21
        case .xlarge: return 24
        }
    }

    /// Longer measures need more leading to stay trackable.
    var lineHeightMultiple: CGFloat {
        switch self {
        case .small, .medium: return 1.75
        case .large, .xlarge: return 1.7
        }
    }

    var displayLabel: String {
        switch self {
        case .small: return "Small"
        case .medium: return "Medium"
        case .large: return "Large"
        case .xlarge: return "Extra large"
        }
    }
}

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

    /// Sidebar list — relative update time (same size as preview, medium weight)
    static let noteListTimestamp = HarvousFonts.font(size: {
        #if os(iOS)
        return 14
        #else
        return 12
        #endif
    }(), weight: 500, design: .default)

    /// Conversation list — trailing abbreviated time (footnote size, medium weight)
    static let noteListTrailingTimestamp = HarvousFonts.font(size: 11, weight: 500, design: .default)

    /// Card stack — note title
    static let noteCardTitle = HarvousFonts.font(size: 16, weight: 600, design: .default)

    /// 16pt — body text
    static let body = HarvousFonts.font(size: 16, weight: 400, design: .default)

    // MARK: - Bible reader

    /// Scripture reading canvas — the one user-scalable role in the system.
    /// Steps mirror `--pds-reader-font-size` on web; `.medium` is the default.
    /// Reading is a sustained task, so this runs larger than `body` (16pt).
    static func readerBody(_ size: ReaderTextSize = .medium) -> Font {
        HarvousFonts.font(size: size.pointSize, weight: 400, design: .default)
    }

    /// Verse number set inline with reading text. Sits quiet — the text leads,
    /// the number is a locator.
    static let readerVerseNumber = HarvousFonts.font(size: 11, weight: 600, design: .default)

    /// Chapter heading above the reading canvas. Rounded, like other display roles.
    static let readerChapterTitle = HarvousFonts.font(size: 28, weight: 600, design: .rounded)

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

    // MARK: - Compact popovers (share, folder chip — prototype `proto-share-popover__*` / `proto-fte-*`)

    /// Popover card title — `.proto-share-popover__title` 14px.
    static let popoverTitle = HarvousFonts.font(size: 14, weight: 600, design: .default)
    /// Secondary copy under the title — share subtitle 12.5px.
    static let popoverBody = HarvousFonts.font(size: 12.5, weight: 400, design: .default)
    /// Row labels — lock toggle, destructive actions — `.proto-fte-lock__label` 13px.
    static let popoverRow = HarvousFonts.font(size: 13, weight: 500, design: .default)
    /// Folder name fields and secondary row text — `.proto-fte-field__input` 14px.
    static let popoverField = HarvousFonts.font(size: 14, weight: 400, design: .default)
    /// Copy button, link actions — `.proto-share-popover__copy` 12.5px.
    static let popoverAction = HarvousFonts.font(size: 12.5, weight: 500, design: .default)
    /// Read-only share URL — `.proto-share-popover__url-input` 12px monospace.
    static let popoverURL = Font.system(size: 12, weight: .regular, design: .monospaced)

    static let sharePopoverTitle = popoverTitle
    static let sharePopoverBody = popoverBody
    static let sharePopoverAction = popoverAction
    /// Primary CTA — `.proto-share-popover__primary` 13.5px.
    static let sharePopoverPrimaryButton = HarvousFonts.font(size: 13.5, weight: 600, design: .default)
}

extension View {
    /// Apply Google Sans Flex to SwiftUI lists, menus, and form rows that otherwise inherit SF via environment defaults.
    func harvousListMenuTypography() -> some View {
        environment(\.font, HarvousTypography.settingsFormEnvironment)
    }
}
