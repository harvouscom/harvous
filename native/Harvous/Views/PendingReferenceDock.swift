import SwiftUI

// MARK: - Pending reference dock card (carousel)
//
// The carousel sibling of `ActiveHighlightDock` for a *not-yet-saved* dictionary reference:
// the user tapped a dotted suggestion hint and this card appears in the study-dock carousel
// (alongside scripture pills and highlights) showing the Easton's entry with a Save checkmark.
// On Save the host persists the reference (which then reopens as a normal highlight dock).
// Mirrors the web ReferenceDockWeb pending mode now living in the carousel.

struct PendingReferenceDock: View {
    let slug: String
    @Binding var isExpanded: Bool
    let onSave: () -> Void
    let onDismiss: () -> Void

    @Environment(\.harvousStudyDockInCarousel) private var inStudyDockCarousel
    @Environment(\.harvousDockExpandedContentMaxHeight) private var expandedContentMaxHeight
    @Environment(\.colorScheme) private var colorScheme
    @State private var entrySlug: String
    @State private var expandedScrollContentHeight: CGFloat = 0

    init(slug: String, isExpanded: Binding<Bool>, onSave: @escaping () -> Void, onDismiss: @escaping () -> Void) {
        self.slug = slug
        self._isExpanded = isExpanded
        self.onSave = onSave
        self.onDismiss = onDismiss
        self._entrySlug = State(initialValue: slug)
    }

    private var headword: String {
        EastonsDictionaryService.shared.slugIndex[slug]?.headword ?? slug.capitalized
    }

    private var categoryMeta: (iconAsset: String, label: String)? {
        guard let entry = EastonsDictionaryService.shared.slugIndex[slug],
              let icon = entry.categoryIconAsset,
              let cat = entry.category else { return nil }
        return (icon, cat.capitalized)
    }

    var body: some View {
        applyCollapsedExpandTap {
            VStack(alignment: .leading, spacing: 10) {
                headerRow
                if isExpanded {
                    referenceScrollBody
                        .transition(.opacity)
                }
            }
            .frame(maxWidth: inStudyDockCarousel ? .infinity : nil, alignment: .topLeading)
            .padding(.horizontal, 12)
            .padding(.top, 10)
            // Expanded scroll runs to the card bottom (parity with `ActiveScripturePillDock`).
            .padding(.bottom, isExpanded ? 0 : 10)
            .background(dockChrome)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .studyDockShellBorderOverlay()
        }
        .onChange(of: isExpanded) { _, expanded in
            if !expanded { expandedScrollContentHeight = 0 }
        }
        .shadow(color: .black.opacity(0.10), radius: 12, y: 4)
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        .padding(.horizontal, inStudyDockCarousel ? 0 : 20)
        .padding(.top, inStudyDockCarousel ? 0 : 6)
        .padding(.bottom, inStudyDockCarousel ? 0 : 10)
    }

    private var referenceScrollBody: some View {
        let computedHeight = HarvousDockExpandedContentLayout.clampedScrollFrameHeight(
            measuredContentHeight: expandedScrollContentHeight,
            maxHeight: expandedContentMaxHeight
        )
        return ScrollView {
            VStack(spacing: 0) {
                EastonsEntryView(slug: $entrySlug, showHeadword: false, showDisclaimer: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .background(
                        GeometryReader { geo in
                            Color.clear.preference(key: DockScrollContentHeightKey.self, value: geo.size.height)
                        }
                    )

                Spacer(minLength: 0)
                    .allowsHitTesting(false)
            }
            .frame(
                maxWidth: .infinity,
                minHeight: HarvousDockExpandedContentLayout.nonNegativeFrameHeight(computedHeight - 1),
                alignment: .topLeading
            )
        }
        .frame(height: HarvousDockExpandedContentLayout.nonNegativeFrameHeight(computedHeight))
        .animation(nil, value: computedHeight)
        .onPreferenceChange(DockScrollContentHeightKey.self) { h in
            Task { @MainActor in
                expandedScrollContentHeight = h
            }
        }
    }

    private var headerRow: some View {
        HStack(alignment: .center, spacing: 8) {
            HarvousFAGlyph(assetName: "Harvous.LinesLeaning", edgePt: 13)
                .foregroundStyle(.secondary)
                .frame(width: 22, height: 22)

            HStack(spacing: 8) {
                Text(headword)
                    .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .layoutPriority(0)

                if let meta = categoryMeta {
                    StudyDockHeaderChipView(
                        chip: .referenceCategory(iconAsset: meta.iconAsset, label: meta.label)
                    )
                    .layoutPriority(1)
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 2) {
                if isExpanded {
                    // Primary confirm — warm-amber orb (parity with web `.reference-dock-web__save-orb`).
                    toolbarButton(assetName: "Harvous.Check", help: "Save reference", style: .saveOrb) {
                        onSave()
                    }
                    toolbarDivider
                    toolbarButton(assetName: "Harvous.ChevronDown", help: "Collapse") {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { isExpanded.toggle() }
                    }
                }
                toolbarButton(assetName: "Harvous.Xmark", help: "Dismiss") {
                    onDismiss()
                }
            }
            .fixedSize(horizontal: true, vertical: false)
            .layoutPriority(1)
            .animation(.none, value: isExpanded)
        }
    }

    private enum HeaderButtonStyle {
        /// Web `.study-dock-card__header-btn` — 28pt glass orb with control border.
        case chrome
        /// Web `.reference-dock-web__save-orb` — warm-amber fill, dark checkmark.
        case saveOrb
    }

    private var saveOrbFill: Color {
        let token = StudyHighlightAccentToken.warmAmber
        #if os(macOS)
        return Color(nsColor: token.resolvedAccentNSColor(kind: .reference, isDark: colorScheme == .dark))
        #else
        return Color(uiColor: token.resolvedAccentUIColor(kind: .reference, isDark: colorScheme == .dark))
        #endif
    }

    private func toolbarButton(
        assetName: String,
        help: String,
        style: HeaderButtonStyle = .chrome,
        action: @escaping () -> Void
    ) -> some View {
        let iconPt: CGFloat = style == .saveOrb ? 14 : 12
        return Button(action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: iconPt)
                .contentTransition(.identity)
                .frame(width: 28, height: 28)
                .background {
                    Circle()
                        .fill(style == .saveOrb ? AnyShapeStyle(saveOrbFill) : AnyShapeStyle(headerChromeFill))
                }
                .overlay {
                    if style == .chrome {
                        Circle()
                            .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
                    }
                }
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.primary)
        #if os(macOS)
        .help(help)
        #endif
    }

    /// Web `--pds-bg-glass-medium` on study-dock header controls.
    private var headerChromeFill: Color {
        colorScheme == .dark
            ? Color(white: 0.18, opacity: 0.72)
            : Color.white.opacity(0.70)
    }

    private var toolbarDivider: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.12))
            .frame(width: 0.5, height: 16)
            .padding(.horizontal, 2)
    }

    @ViewBuilder
    private func applyCollapsedExpandTap<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if isExpanded {
            content()
        } else {
            content()
                .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .onTapGesture {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) { isExpanded = true }
                }
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Expand reference")
        }
    }

    private var dockChrome: some View {
        ZStack {
            let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
            shape.fill(.background)
            if #available(macOS 26.0, iOS 26.0, *) {
                shape.fill(.clear).glassEffect(in: shape)
            } else {
                shape.fill(.ultraThinMaterial)
            }
        }
        .allowsHitTesting(false)
    }
}
