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
    @State private var entrySlug: String

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
                    ScrollView {
                        EastonsEntryView(slug: $entrySlug, showHeadword: false, showDisclaimer: true)
                            .padding(.top, 2)
                    }
                    .frame(maxHeight: 280)
                    .transition(.opacity)
                }
            }
            .frame(maxWidth: inStudyDockCarousel ? .infinity : nil, alignment: .topLeading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(dockChrome)
            .studyDockShellBorderOverlay()
        }
        .shadow(color: .black.opacity(0.10), radius: 12, y: 4)
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        .padding(.horizontal, inStudyDockCarousel ? 0 : 20)
        .padding(.top, inStudyDockCarousel ? 0 : 6)
        .padding(.bottom, inStudyDockCarousel ? 0 : 10)
    }

    private var headerRow: some View {
        HStack(alignment: .center, spacing: 8) {
            HarvousFAGlyph(assetName: "Harvous.LinesLeaning", edgePt: 13)
                .foregroundStyle(.secondary)
                .frame(width: 22, height: 22)

            Text(headword)
                .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)

            if let meta = categoryMeta {
                categoryBadge(iconAsset: meta.iconAsset, label: meta.label)
                    .fixedSize(horizontal: true, vertical: false)
            }

            HStack(spacing: 2) {
                if isExpanded {
                    // Primary confirm — accent checkmark orb (parity with web dock's header orb).
                    toolbarButton(assetName: "Harvous.Check", help: "Save reference", tint: .accentColor) {
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

    private func categoryBadge(iconAsset: String, label: String) -> some View {
        HStack(spacing: 3) {
            HarvousFAGlyph(assetName: iconAsset, edgePt: 10)
            Text(label)
                .font(HarvousFonts.font(size: 11, weight: .medium, design: .default))
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .foregroundStyle(Color.primary.opacity(0.5))
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Capsule().fill(Color.primary.opacity(0.07)))
    }

    private func toolbarButton(
        assetName: String,
        help: String,
        tint: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: 13)
                .contentTransition(.identity)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(tint ?? Color.primary)
        #if os(macOS)
        .help(help)
        #endif
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
