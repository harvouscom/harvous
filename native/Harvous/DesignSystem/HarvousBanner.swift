import SwiftUI

/// Deprecated — not the product feedback pattern.
/// Ephemeral feedback uses floating toasts; sticky inspector failures use quiet
/// inline copy + Retry (see `NoteInspectorView.syncErrorBanner`).
/// Kept temporarily for residual references; do not use in new UI.
enum HarvousBannerTone {
    case info
    case warning
    case destructive
    case success
}

/// Deprecated — see `HarvousBannerTone`. Prefer toasts or dedicated inline chrome.
struct HarvousBanner: View {
    let title: String
    var description: String? = nil
    var tone: HarvousBannerTone = .info
    var iconAsset: String? = nil
    var actionTitle: String? = nil
    var actionEnabled: Bool = true
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: HarvousSpacing.space2) {
            HStack(alignment: .firstTextBaseline, spacing: HarvousSpacing.space2) {
                HarvousFAGlyph(assetName: resolvedIcon, edgePt: 13)
                    .foregroundStyle(accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(HarvousTypography.inspectorBody)
                        .fontWeight(.semibold)
                        .foregroundStyle(titleColor)
                    if let description, !description.isEmpty {
                        Text(description)
                            .font(HarvousTypography.inspectorCompact)
                            .foregroundStyle(.primary.opacity(0.75))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }

            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(HarvousTypography.inspectorCompactMedium)
                        .foregroundStyle(Color.harvousAccent)
                }
                .buttonStyle(.plain)
                .disabled(!actionEnabled)
                .padding(.leading, 13 + HarvousSpacing.space2)
            }
        }
        .padding(.bottom, HarvousSpacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Self.dividerColor)
                .frame(height: 0.5)
        }
        .accessibilityElement(children: .combine)
    }

    private static var dividerColor: Color {
        #if os(macOS)
        Color(nsColor: .separatorColor)
        #else
        Color(uiColor: .separator)
        #endif
    }

    private var accent: Color {
        switch tone {
        case .info: return .harvousInfo
        case .warning: return .harvousWarning
        case .destructive: return .harvousDestructive
        case .success: return .harvousSuccess
        }
    }

    private var titleColor: Color {
        switch tone {
        case .destructive: return .harvousDestructive
        default: return .primary
        }
    }

    private var resolvedIcon: String {
        if let iconAsset { return iconAsset }
        switch tone {
        case .info: return "Harvous.CircleInfo"
        case .warning: return "Harvous.CircleInfo"
        case .destructive: return "Harvous.CircleXmark"
        case .success: return "Harvous.CircleCheck"
        }
    }
}
