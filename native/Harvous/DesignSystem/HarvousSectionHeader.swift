import SwiftUI

enum HarvousSectionHeaderVariant {
    /// Inspector / settings labels — 10pt uppercase tracked.
    case inspector
    /// Search result group headers — slightly larger, quieter.
    case search
    /// Dense list section labels.
    case list
}

/// Canonical section label — mirrors web `PrototypeSectionHeader` / `.pds-section-header`.
struct HarvousSectionHeader: View {
    let title: String
    var variant: HarvousSectionHeaderVariant = .inspector

    var body: some View {
        Text(title)
            .font(font)
            .foregroundStyle(foreground)
            .textCase(usesUppercase ? .uppercase : nil)
            .tracking(tracking)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }

    private var usesUppercase: Bool {
        switch variant {
        case .inspector, .list, .search:
            return true
        }
    }

    private var font: Font {
        switch variant {
        case .inspector, .list:
            return HarvousTypography.inspectorSectionLabel
        case .search:
            return HarvousFonts.font(size: 11, weight: 600, design: .default)
        }
    }

    private var tracking: CGFloat {
        switch variant {
        case .inspector: return 0.6
        case .list: return 0.5
        case .search: return 0.4
        }
    }

    private var foreground: Color {
        switch variant {
        case .inspector:
            return Color.secondary
        case .search, .list:
            return Color.secondary.opacity(0.85)
        }
    }
}
