import SwiftUI

private enum ScriptureReferenceMenuPillMetrics {
    static let controlHeight: CGFloat = 30
    static let chevronPt: CGFloat = 10
    static let chipFillOpacity: Double = 0.09
}

private enum ScriptureReferencePickerPopoverMetrics {
    static let outerRadius: CGFloat = 12
    static let pad: CGFloat = 4
    static let innerRadius: CGFloat = outerRadius - pad
    static let itemRadius: CGFloat = 6
    static let maxHeight: CGFloat = 220
}

/// Faded blurred stroke clipped to capsule; shared by connections pills (not scripture reference bar).
private struct HarvousCapsulePillInnerShadow: View {
    @Environment(\.colorScheme) private var colorScheme

    private var isDarkAppearance: Bool { colorScheme == .dark }

    var body: some View {
        Capsule(style: .continuous)
            .stroke(shadowTint, lineWidth: 5.5)
            .blur(radius: 3)
            .blendMode(isDarkAppearance ? .softLight : .multiply)
            .mask(Capsule(style: .continuous))
            .allowsHitTesting(false)
    }

    private var shadowTint: Color {
        isDarkAppearance ? Color.white.opacity(0.036) : Color.black.opacity(0.042)
    }
}

extension View {
    /// Capsule backing with faded perimeter stroke (`multiply` light / `softLight` dark).
    func harvousCapsulePillBackdrop(fillOpacity: Double) -> some View {
        background {
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(fillOpacity))
                .overlay {
                    HarvousCapsulePillInnerShadow()
                }
        }
    }

    /// Flat capsule for scripture reference picker segments — lighter than connections trail pills.
    func harvousReferencePickerPillBackdrop(fillOpacity: Double = 0.06) -> some View {
        background {
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(fillOpacity))
        }
    }

    /// Back-compat alias for `NoteConnectionsBar` call sites.
    func harvousConnectionsPillBackdrop(fillOpacity: Double) -> some View {
        harvousCapsulePillBackdrop(fillOpacity: fillOpacity)
    }
}

/// Capsule menu trigger — translation, book, chapter, verse segments (PDS popover, web parity).
struct ScriptureReferenceMenuPill<SelectionValue: Hashable>: View {
    let accessibilityLabel: String
    @Binding var selection: SelectionValue
    let options: [(value: SelectionValue, label: String)]
    let displayText: (SelectionValue) -> String
    var maxWidth: CGFloat?
    var inCluster: Bool = false
    var monospaceDigits: Bool = false
    /// When true, flat transparent trigger on the reference bar track (no nested capsule).
    var inReferenceBar: Bool = true

    @State private var isOpen = false
    @State private var isHovered = false

    var body: some View {
        Button {
            isOpen.toggle()
        } label: {
            HStack(spacing: 4) {
                pillLabelText
                HarvousFAGlyph(assetName: "Harvous.ChevronDown", edgePt: ScriptureReferenceMenuPillMetrics.chevronPt)
                    .foregroundStyle(.tertiary)
                    .opacity(0.75)
                    .rotationEffect(.degrees(isOpen ? 180 : 0))
            }
            .padding(.horizontal, inCluster ? 6 : 10)
            .frame(height: ScriptureReferenceMenuPillMetrics.controlHeight)
            .frame(maxWidth: maxWidth, alignment: .leading)
            .background {
                if showsChipFill {
                    Capsule(style: .continuous)
                        .fill(Color.primary.opacity(ScriptureReferenceMenuPillMetrics.chipFillOpacity))
                }
            }
            .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(ScriptureReferenceMenuPillButtonStyle())
        #if os(macOS)
        .onHover { isHovered = $0 }
        #endif
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel(accessibilityLabel)
        .popover(isPresented: $isOpen, arrowEdge: .bottom) {
            popoverContent
            #if os(iOS)
                .presentationCompactAdaptation(.popover)
            #endif
        }
    }

    private var showsChipFill: Bool {
        inReferenceBar && (isOpen || isHovered)
    }

    private var labelForeground: Color {
        if showsChipFill { return .primary }
        return .secondary
    }

    @ViewBuilder
    private var pillLabelText: some View {
        let text = Text(displayText(selection))
            .font(HarvousTypography.caption)
            .foregroundStyle(labelForeground)
            .lineLimit(1)
        if monospaceDigits {
            text.monospacedDigit()
        } else {
            text
        }
    }

    private var popoverContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    let isSelected = option.value == selection
                    let isFirst = index == 0
                    let isLast = index == options.count - 1
                    Button {
                        selection = option.value
                        isOpen = false
                    } label: {
                        Group {
                            if monospaceDigits {
                                Text(option.label)
                                    .font(HarvousTypography.caption)
                                    .fontWeight(isSelected ? .medium : .regular)
                                    .foregroundStyle(.primary)
                                    .monospacedDigit()
                            } else {
                                Text(option.label)
                                    .font(HarvousTypography.caption)
                                    .fontWeight(isSelected ? .medium : .regular)
                                    .foregroundStyle(.primary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background {
                            rowFill(isFirst: isFirst, isLast: isLast, isOnly: options.count == 1, isSelected: isSelected)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(ScriptureReferencePickerPopoverMetrics.pad)
        }
        .frame(maxHeight: ScriptureReferencePickerPopoverMetrics.maxHeight)
        .clipShape(RoundedRectangle(cornerRadius: ScriptureReferencePickerPopoverMetrics.outerRadius, style: .continuous))
        .background(
            RoundedRectangle(cornerRadius: ScriptureReferencePickerPopoverMetrics.outerRadius, style: .continuous)
                .fill(popoverPanelFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: ScriptureReferencePickerPopoverMetrics.outerRadius, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.14), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.12), radius: 14, x: 0, y: 8)
    }

    private var popoverPanelFill: Color {
        #if os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color(uiColor: .systemBackground)
        #endif
    }

    @ViewBuilder
    private func rowFill(isFirst: Bool, isLast: Bool, isOnly: Bool, isSelected: Bool) -> some View {
        let fill = isSelected ? Color.primary.opacity(0.12) : Color.clear
        let inner = ScriptureReferencePickerPopoverMetrics.innerRadius
        let mid = ScriptureReferencePickerPopoverMetrics.itemRadius
        if isOnly {
            RoundedRectangle(cornerRadius: inner, style: .continuous).fill(fill)
        } else if isFirst {
            UnevenRoundedRectangle(
                topLeadingRadius: inner,
                bottomLeadingRadius: mid,
                bottomTrailingRadius: mid,
                topTrailingRadius: inner,
                style: .continuous
            )
            .fill(fill)
        } else if isLast {
            UnevenRoundedRectangle(
                topLeadingRadius: mid,
                bottomLeadingRadius: inner,
                bottomTrailingRadius: inner,
                topTrailingRadius: mid,
                style: .continuous
            )
            .fill(fill)
        } else {
            RoundedRectangle(cornerRadius: mid, style: .continuous).fill(fill)
        }
    }
}

private struct ScriptureReferenceMenuPillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Shared row for chapter : verse (– end) number pickers — flat on the reference bar track.
struct ScriptureReferenceNumberCluster<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(alignment: .center, spacing: 3) {
            content()
        }
        .padding(.horizontal, 4)
    }
}

/// Verse-range toggle — single circular chip when active (web `.scripture-pill-chrome__range-toggle--on`).
struct ScriptureReferenceRangeToggleStyle: ButtonStyle {
    var isActive: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isActive || configuration.isPressed ? Color.primary : Color.secondary)
            .background {
                Circle()
                    .fill(
                        isActive || configuration.isPressed
                            ? Color.primary.opacity(0.09)
                            : Color.clear
                    )
            }
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
            .animation(.easeInOut(duration: 0.1), value: isActive)
    }
}
