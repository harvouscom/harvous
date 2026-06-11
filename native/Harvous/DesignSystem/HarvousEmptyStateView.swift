import SwiftUI

enum HarvousEmptyStateScale {
    /// Wide detail panes (editor canvas when no note is selected).
    case prominent
    /// Sidebars, list columns, sheets, and iOS hub tabs.
    case compact
}

enum HarvousEmptyStateMetrics {
    static func iconPt(for scale: HarvousEmptyStateScale) -> CGFloat {
        switch scale {
        case .prominent:
            #if os(iOS)
            return 36
            #else
            return 40
            #endif
        case .compact:
            #if os(iOS)
            return 24
            #else
            return 28
            #endif
        }
    }

    static func iconToTitleSpacing(for scale: HarvousEmptyStateScale) -> CGFloat {
        switch scale {
        case .prominent:
            #if os(iOS)
            return 10
            #else
            return 12
            #endif
        case .compact:
            return 8
        }
    }

    static func titleToDescriptionSpacing(for scale: HarvousEmptyStateScale) -> CGFloat {
        switch scale {
        case .prominent:
            return 4
        case .compact:
            return 3
        }
    }

    /// Caps description width on wide detail panes so copy wraps into a short centered column.
    static func descriptionMaxWidth(for scale: HarvousEmptyStateScale) -> CGFloat? {
        switch scale {
        case .prominent:
            return 288
        case .compact:
            return nil
        }
    }

    static func horizontalPadding(for scale: HarvousEmptyStateScale) -> CGFloat {
        switch scale {
        case .prominent:
            return 28
        case .compact:
            #if os(iOS)
            return 20
            #else
            return 24
            #endif
        }
    }
}

/// Harvous-branded empty / no-content states. Built on `ContentUnavailableView` so layout matches
/// system search-empty states (which already render correctly in sidebar lists).
struct HarvousEmptyStateView: View {
    let iconAsset: String
    let title: String
    var scale: HarvousEmptyStateScale = .prominent
    /// When nil, uses scale-appropriate default inset so copy never hugs container edges.
    var horizontalPadding: CGFloat? = nil

    private let descriptionText: String?
    private let customDescription: AnyView?

    init(
        iconAsset: String,
        title: String,
        description: String? = nil,
        scale: HarvousEmptyStateScale = .prominent,
        horizontalPadding: CGFloat? = nil
    ) {
        self.iconAsset = iconAsset
        self.title = title
        self.scale = scale
        self.horizontalPadding = horizontalPadding
        self.descriptionText = Self.trimmedDescription(description)
        self.customDescription = nil
    }

    init(
        iconAsset: String,
        title: String,
        scale: HarvousEmptyStateScale = .prominent,
        horizontalPadding: CGFloat? = nil,
        @ViewBuilder descriptionView: () -> some View
    ) {
        self.iconAsset = iconAsset
        self.title = title
        self.scale = scale
        self.horizontalPadding = horizontalPadding
        self.descriptionText = nil
        self.customDescription = AnyView(descriptionView())
    }

    private static func trimmedDescription(_ description: String?) -> String? {
        guard let description else { return nil }
        let trimmed = description.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private var resolvedHorizontalPadding: CGFloat {
        horizontalPadding ?? HarvousEmptyStateMetrics.horizontalPadding(for: scale)
    }

    private var hasDescription: Bool {
        customDescription != nil || descriptionText != nil
    }

    var body: some View {
        // Title + description live in one stack — `ContentUnavailableView`'s label/description
        // slots add extra system gap between the heading and supporting text.
        ContentUnavailableView {
            VStack(spacing: 0) {
                emptyStateIcon
                Spacer().frame(height: HarvousEmptyStateMetrics.iconToTitleSpacing(for: scale))
                Text(title)
                    .font(titleFont)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if hasDescription {
                    Spacer().frame(height: HarvousEmptyStateMetrics.titleToDescriptionSpacing(for: scale))
                    descriptionBody
                        .frame(maxWidth: HarvousEmptyStateMetrics.descriptionMaxWidth(for: scale))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, resolvedHorizontalPadding)
    }

    @ViewBuilder
    private var descriptionBody: some View {
        if let customDescription {
            customDescription
        } else if let descriptionText {
            Text(descriptionText)
                .font(descriptionFont)
                .foregroundStyle(descriptionForeground)
                .multilineTextAlignment(.center)
        }
    }

    @ViewBuilder
    private var emptyStateIcon: some View {
        let iconPt = HarvousEmptyStateMetrics.iconPt(for: scale)
        // Asset catalog vectors (`template-rendering-intent`) tint reliably; rasterized toolbar glyphs do not.
        Image(iconAsset)
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: iconPt, height: iconPt)
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
    }

    private var titleFont: Font {
        switch scale {
        case .prominent:
            #if os(iOS)
            HarvousFonts.font(size: 17, weight: 600, design: .rounded)
            #else
            HarvousTypography.title
            #endif
        case .compact:
            #if os(iOS)
            HarvousFonts.font(size: 18, weight: 600, design: .default)
            #else
            HarvousFonts.font(size: 18, weight: 580, design: .rounded)
            #endif
        }
    }

    private var descriptionFont: Font {
        switch scale {
        case .prominent:
            #if os(iOS)
            HarvousTypography.noteListPreview
            #else
            HarvousTypography.body
            #endif
        case .compact:
            #if os(iOS)
            HarvousTypography.caption
            #else
            HarvousTypography.noteListPreview
            #endif
        }
    }

    private var descriptionForeground: AnyShapeStyle {
        switch scale {
        case .prominent:
            #if os(iOS)
            AnyShapeStyle(.secondary)
            #else
            AnyShapeStyle(.secondary)
            #endif
        case .compact:
            AnyShapeStyle(.secondary)
        }
    }

    /// Sidebar search/filter no-match — magnifying glass + title only.
    static func searchNoMatch(title: String) -> HarvousEmptyStateView {
        HarvousEmptyStateView(
            iconAsset: "Harvous.MagnifyingGlass",
            title: title,
            scale: .compact
        )
    }
}

/// Sidebar search/filter no-match copy — keep aligned with web `SIDEBAR_NO_MATCH_COPY`.
enum SidebarNoMatchCopy {
    static let noResultsInSpace = "Nothing found here"
    static let noMatchesInView = "Nothing in this view"
    static let noOtherMatches = "Nothing elsewhere"
    static let noNotesMatch = "No notes found"
    static let noFoldersMatch = "No folders found"
    static let noHighlightsMatch = "No highlights found"
    static let noScriptureMatch = "No references found"
    static let noThreadsMatch = "No threads found"
}

/// Description line with inline shortcut keycaps (Settings → Keyboard shortcuts style).
struct HarvousEmptyStateShortcutLine: View {
    /// When set, renders on its own line above the shortcut clause (e.g. sidebar hint before “or press …”).
    var firstLine: String? = nil
    let prefix: String
    let keys: String
    let suffix: String
    var font: Font = HarvousTypography.body

    var body: some View {
        VStack(spacing: firstLine == nil ? 0 : 4) {
            if let firstLine {
                Text(firstLine)
                    .font(font)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            HarvousCenteredInlineFlowLayout(hSpacing: 0, vSpacing: 4) {
                ForEach(Array(flowWordTokens(prefix, leadingSpace: false).enumerated()), id: \.offset) { _, word in
                    Text(word)
                        .font(font)
                        .foregroundStyle(.secondary)
                }
                HarvousShortcutKeycapsRow(keys: keys)
                ForEach(Array(flowWordTokens(suffix, leadingSpace: true).enumerated()), id: \.offset) { _, word in
                    Text(word)
                        .font(font)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabelText)
    }

    private var accessibilityLabelText: String {
        let lead = firstLine.map { $0 + " " } ?? ""
        return "\(lead)\(prefix)\(keysAccessibilityLabel)\(suffix)"
    }

    /// One Text token per word; leading space carries word separation (no extra layout gap).
    private func flowWordTokens(_ text: String, leadingSpace: Bool) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            return text.hasPrefix(" ") ? [" "] : []
        }
        let parts = trimmed.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        return parts.enumerated().map { idx, word in
            var token = (idx == 0 && !leadingSpace) ? word : " " + word
            if idx == parts.count - 1, text.hasSuffix(" ") {
                token += " "
            }
            return token
        }
    }

    private var keysAccessibilityLabel: String {
        keys
            .replacingOccurrences(of: "⇧", with: "Shift ")
            .replacingOccurrences(of: "⌘", with: "Command ")
            .replacingOccurrences(of: "⌥", with: "Option ")
            .replacingOccurrences(of: "⌃", with: "Control ")
    }
}

/// Flex-wrap row layout — each child (word, keycap, …) flows inline and wraps as a unit; rows are centered.
private struct HarvousCenteredInlineFlowLayout: Layout {
    var hSpacing: CGFloat = 4
    var vSpacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let rows = packRows(subviews: subviews, maxWidth: width)
        guard !rows.isEmpty else { return .zero }
        let height = rows.reduce(CGFloat(0)) { $0 + $1.height } + vSpacing * CGFloat(rows.count - 1)
        let maxRowWidth = rows.map(\.width).max() ?? 0
        return CGSize(width: min(maxRowWidth, width), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = packRows(subviews: subviews, maxWidth: bounds.width)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX + max(0, (bounds.width - row.width) / 2)
            for item in row.items {
                let size = item.size
                let yOffset = (row.height - size.height) / 2
                item.subview.place(
                    at: CGPoint(x: x, y: y + yOffset),
                    proposal: ProposedViewSize(size)
                )
                x += size.width + hSpacing
            }
            y += row.height + vSpacing
        }
    }

    private struct RowItem {
        let subview: LayoutSubview
        let size: CGSize
    }

    private struct Row {
        var items: [RowItem] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func packRows(subviews: Subviews, maxWidth: CGFloat) -> [Row] {
        var rows: [Row] = []
        var current = Row()

        func flushRow() {
            guard !current.items.isEmpty else { return }
            if current.width > 0 { current.width -= hSpacing }
            rows.append(current)
            current = Row()
        }

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            let nextWidth = current.items.isEmpty ? size.width : current.width + hSpacing + size.width
            if nextWidth > maxWidth, !current.items.isEmpty {
                flushRow()
            }
            current.items.append(RowItem(subview: subview, size: size))
            current.width = current.items.count == 1 ? size.width : current.width + hSpacing + size.width
            current.height = max(current.height, size.height)
        }
        flushRow()
        return rows
    }
}
