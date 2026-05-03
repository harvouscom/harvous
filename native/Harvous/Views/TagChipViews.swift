import SwiftUI

// MARK: - Collection symbol (stack icon + optional SF animation)

struct CollectionSymbol: View {
    let isContextUpdating: Bool
    var font: Font = .system(size: 12, weight: .regular)
    var idleSystemName: String = "rectangle.stack.fill"
    var updatingSystemName: String = "rectangle.stack.fill"

    var body: some View {
        Image(systemName: isContextUpdating ? updatingSystemName : idleSystemName)
            .font(font)
            .rotationEffect(.degrees(isContextUpdating ? 4 : 0))
            .animation(
                isContextUpdating
                    ? .easeInOut(duration: 0.17).repeatForever(autoreverses: true)
                    : .easeOut(duration: 0.15),
                value: isContextUpdating
            )
    }
}

// MARK: - Theme / keyword tag (scripture-pill styling + tag icon)

struct ThemeTagChip: View {
    @Environment(\.harvousScriptureTheme) private var scriptureTheme
    let text: String
    private let themeCornerRadius: CGFloat = HarvousRadius.scripturePill

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "tag.fill")
                .font(.system(size: 9, weight: .semibold))
            Text(text)
                .font(HarvousTypography.inspectorCompactMedium)
        }
        .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme))
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: themeCornerRadius, style: .continuous)
                .fill(HarvousColors.scriptureChipBackground(scriptureTheme))
                .overlay(
                    LinearGradient(
                        colors: [
                            HarvousColors.scriptureChipGradientTop(scriptureTheme),
                            HarvousColors.scriptureChipGradientBottom(scriptureTheme)
                        ],
                        startPoint: HarvousColors.scriptureChipGradientStartPoint(scriptureTheme),
                        endPoint: HarvousColors.scriptureChipGradientEndPoint(scriptureTheme)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: themeCornerRadius, style: .continuous))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: themeCornerRadius, style: .continuous)
                .strokeBorder(HarvousColors.scriptureChipBorder(scriptureTheme), lineWidth: 0.5)
        )
    }
}

// MARK: - Scripture (matches inline `ScripturePillAttachment` — system blue fill + stroke, rounded rect)

struct ScriptureRefChip: View {
    @Environment(\.harvousScriptureTheme) private var scriptureTheme
    let reference: String
    var onTap: (() -> Void)? = nil
    private let scriptureCornerRadius: CGFloat = HarvousRadius.scripturePill

    var body: some View {
        let chip = HStack(spacing: 4) {
            Image(systemName: "bookmark.fill")
                .font(.system(size: 9, weight: .semibold))
            Text(reference)
                .font(HarvousTypography.inspectorCompactMedium)
        }
        .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme))
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: scriptureCornerRadius, style: .continuous)
                .fill(HarvousColors.scriptureChipBackground(scriptureTheme))
                .overlay(
                    LinearGradient(
                        colors: [
                            HarvousColors.scriptureChipGradientTop(scriptureTheme),
                            HarvousColors.scriptureChipGradientBottom(scriptureTheme)
                        ],
                        startPoint: HarvousColors.scriptureChipGradientStartPoint(scriptureTheme),
                        endPoint: HarvousColors.scriptureChipGradientEndPoint(scriptureTheme)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: scriptureCornerRadius, style: .continuous))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: scriptureCornerRadius, style: .continuous)
                .strokeBorder(HarvousColors.scriptureChipBorder(scriptureTheme), lineWidth: 0.5)
        )

        if let onTap {
            Button(action: onTap) {
                chip
            }
            .buttonStyle(.plain)
        } else {
            chip
        }
    }
}
