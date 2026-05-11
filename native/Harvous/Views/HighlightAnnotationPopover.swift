import SwiftUI

/// Inline capsule for confirming a fresh highlight: accent + save/dismiss row, then optional note + label.
/// `excerptPreview` is kept for VoiceOver context; it is no longer shown above the color row.
struct HighlightAnnotationPopover: View {
    /// Source selection shown in accessibility only (not headline UI).
    let excerptPreview: String
    @Binding var annotationText: String
    @Binding var titleText: String
    @Binding var selectedAccent: StudyHighlightAccentToken
    var morphNamespace: Namespace.ID
    var morphID: String
    var onCancel: () -> Void
    var onSave: () -> Void
    /// When `true`, Save is allowed without annotation text (excerpt/context is enforced by callers).
    var allowsEmptyAnnotation: Bool = true

    @Environment(\.colorScheme) private var colorScheme

    private enum Metrics {
        static let capsuleWidth: CGFloat = 360
        static let iconColumn: CGFloat = 30
        static let rowMinHeight: CGFloat = 34
        static let primaryToolbarHeight: CGFloat = 32
        static let accentOuter: CGFloat = 24
        static let accentInner: CGFloat = 16
        /// Matches `HarvousTypography.searchField` (15pt) so glyphs read at the same scale as the fields.
        static let rowGlyphFont: Font = HarvousFonts.font(size: 15, weight: .medium, design: .default)
    }

    private var trimmedAnnotation: String {
        annotationText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var saveEnabled: Bool {
        allowsEmptyAnnotation || !trimmedAnnotation.isEmpty
    }

    /// Truncated excerpt for accessibility hint (avoids huge strings).
    private var accessibilityExcerptSummary: String {
        let t = excerptPreview.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return "" }
        if t.count > 120 { return String(t.prefix(120)) + "…" }
        return t
    }

    private var popoverAccessibilityHint: String {
        let summary = accessibilityExcerptSummary
        if summary.isEmpty {
            return "Choose a color, optionally add a note and label, then save."
        }
        return "Selected text: \(summary). Choose a color, then save."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            accentPrimaryRow
                .frame(minHeight: Metrics.primaryToolbarHeight, alignment: .center)

            Divider()
                .opacity(colorScheme == .dark ? 0.18 : 0.12)

            VStack(alignment: .leading, spacing: 8) {
                optionalNoteRow
                labelRow
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(width: Metrics.capsuleWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.regularMaterial)
                .matchedGeometryEffect(id: morphID, in: morphNamespace, isSource: false)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.75)
        )
        .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        .accessibilityElement(children: .contain)
        .accessibilityHint(popoverAccessibilityHint)
    }

    private var accentPrimaryRow: some View {
        HStack(spacing: 8) {
            iconButton(assetName: "Harvous.Xmark", help: "Discard highlight", role: .cancel, action: onCancel)
                .keyboardShortcut(.escape, modifiers: [])

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(StudyHighlightAccentToken.pickerChoices, id: \.rawValue) { token in
                        accentDot(token)
                    }
                }
            }
            .frame(maxHeight: Metrics.primaryToolbarHeight)

            iconButton(assetName: "Harvous.Check", help: "Save highlight", role: nil, action: {
                guard saveEnabled else { return }
                onSave()
            })
            .disabled(!saveEnabled)
            .opacity(saveEnabled ? 1 : 0.45)
            #if os(macOS)
            .keyboardShortcut(.return, modifiers: [])
            #else
            .keyboardShortcut(.defaultAction)
            #endif
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var optionalNoteRow: some View {
        HStack(alignment: .center, spacing: 10) {
            HarvousFAGlyph(assetName: "Harvous.PenToSquare", edgePt: 15)
                .foregroundStyle(Color.secondary.opacity(0.9))
                .frame(width: Metrics.iconColumn, alignment: .center)

            TextField("Note (optional)…", text: $annotationText)
                .textFieldStyle(.plain)
                .font(HarvousTypography.searchField)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, minHeight: Metrics.rowMinHeight, alignment: .leading)
                .padding(.vertical, 4)
                #if os(iOS)
                    .textInputAutocapitalization(.sentences)
                    .submitLabel(.done)
                #endif
                .onSubmit { onSave() }
        }
        .frame(minHeight: Metrics.rowMinHeight, alignment: .center)
    }

    private var labelRow: some View {
        HStack(alignment: .center, spacing: 10) {
            HarvousFAGlyph(assetName: "Harvous.Heading", edgePt: 15)
                .foregroundStyle(Color.secondary.opacity(0.9))
                .frame(width: Metrics.iconColumn, alignment: .center)

            TextField("Title (optional)…", text: $titleText)
                .textFieldStyle(.plain)
                .font(HarvousTypography.searchField)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, minHeight: Metrics.rowMinHeight, alignment: .leading)
                .padding(.vertical, 4)
                #if os(iOS)
                    .textInputAutocapitalization(.sentences)
                #endif
        }
        .frame(minHeight: Metrics.rowMinHeight, alignment: .center)
    }

    private func accentDot(_ token: StudyHighlightAccentToken) -> some View {
        let picked = selectedAccent == token
        return Button {
            selectedAccent = token
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Color.primary.opacity(picked ? 0.65 : 0.18), lineWidth: picked ? 2 : 1)
                    .frame(width: Metrics.accentOuter, height: Metrics.accentOuter)
                swatch(token)
                    .frame(width: Metrics.accentInner, height: Metrics.accentInner)
                    .clipShape(Circle())
            }
            .frame(minWidth: Metrics.accentOuter, minHeight: Metrics.accentOuter)
        }
        .buttonStyle(.plain)
        #if os(macOS)
        .help(token.label)
        #endif
    }

    @ViewBuilder
    private func swatch(_ token: StudyHighlightAccentToken) -> some View {
        let isDark = colorScheme == .dark
#if os(macOS)
        Color(nsColor: token.resolvedAccentNSColor(kind: .miniNote, isDark: isDark))
#elseif os(iOS)
        Color(uiColor: token.resolvedAccentUIColor(kind: .miniNote, isDark: isDark))
#else
        Color.gray.opacity(0.35)
#endif
    }

    private func iconButton(
        assetName: String,
        help: String,
        role: ButtonRole?,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: 13)
                .frame(width: Metrics.iconColumn, height: Metrics.iconColumn)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.primary.opacity(0.82))
        #if os(macOS)
        .help(help)
        #endif
    }
}
