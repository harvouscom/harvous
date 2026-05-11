import SwiftUI

// MARK: - Folder symbol (filled catalog glyph + optional jitter while suggestions update)

struct FolderSymbol: View {
    let isContextUpdating: Bool
    /// Point size for `Harvous.Folder` in the toolbar chip.
    var folderIconPt: CGFloat = {
        #if os(macOS)
        14
        #else
        16
        #endif
    }()

    var body: some View {
        HarvousFAGlyph(assetName: "Harvous.Folder", edgePt: folderIconPt)
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
            HarvousFAGlyph(assetName: "Harvous.Tag", edgePt: 9)
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

// MARK: - Removable theme tag (inspector): tag icon ↔ close, hover / tap

/// Keyword tag chip where the remove control lives inside the pill and only appears on pointer hover (macOS / iPad trackpad) or after tapping the label on iPhone.
struct RemovableThemeTagChip: View {
    @Environment(\.harvousScriptureTheme) private var scriptureTheme
    let text: String
    let onRemove: () -> Void

    @State private var hoverRemoval = false
    @State private var tapRevealRemoval = false

    private var showRemoval: Bool { hoverRemoval || tapRevealRemoval }
    private let themeCornerRadius: CGFloat = HarvousRadius.scripturePill

    var body: some View {
        HStack(spacing: 4) {
            HStack(spacing: 4) {
                ZStack(alignment: .leading) {
                    HarvousFAGlyph(assetName: "Harvous.Tag", edgePt: 9)
                        .opacity(showRemoval ? 0 : 1)
                        .accessibilityHidden(true)
                }
                .frame(width: showRemoval ? 0 : 12, alignment: .leading)
                .clipped()

                Text(text)
                    .font(HarvousTypography.inspectorCompactMedium)
                    .lineLimit(1)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                guard !hoverRemoval else { return }
                withAnimation(.easeInOut(duration: 0.18)) {
                    tapRevealRemoval.toggle()
                }
            }

            Button {
                onRemove()
                tapRevealRemoval = false
            } label: {
                HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 9)
                    .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme).opacity(0.85))
                    .frame(width: 16, height: 16)
            }
            .buttonStyle(.plain)
            .help("Remove tag")
            .accessibilityLabel("Remove tag \(text)")
            .opacity(showRemoval ? 1 : 0)
            .frame(width: showRemoval ? 22 : 0)
            .clipped()
            .allowsHitTesting(showRemoval)
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
        .animation(.easeInOut(duration: 0.18), value: showRemoval)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.18)) {
                hoverRemoval = hovering
                if hovering {
                    tapRevealRemoval = false
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tag \(text)")
        .accessibilityHint(showRemoval ? "Close icon is visible; activate it to remove this tag" : "Tag keyword")
        .accessibilityActions {
            Button("Remove tag", role: .destructive) {
                onRemove()
                tapRevealRemoval = false
            }
        }
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
            HarvousFAGlyph(assetName: "Harvous.Bookmark", edgePt: 9)
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
