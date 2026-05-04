import SwiftUI

/// Inline pill for annotating a fresh selection highlight.
///
/// Row 1 — compact note capsule: `✕` / TextField / `✓` (Save enabled once trimmed non-empty).
/// Row 2 — accent swatches (matches `StudyDockAccentPickerRow` shape language).
struct HighlightAnnotationPopover: View {
    let excerptPreview: String
    @Binding var annotationText: String
    @Binding var selectedAccent: StudyHighlightAccentToken
    var morphNamespace: Namespace.ID
    var morphID: String
    var onCancel: () -> Void
    var onSave: () -> Void

    @FocusState private var inputFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

    private var trimmedAnnotation: String {
        annotationText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            inlineNoteRow
            accentSwatchRow
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .frame(width: 360, alignment: .leading)
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
        .onAppear { inputFocused = true }
    }

    private var inlineNoteRow: some View {
        HStack(spacing: 6) {
            iconButton(symbol: "xmark", help: "Discard highlight", role: .cancel, action: onCancel)
                .keyboardShortcut(.escape, modifiers: [])

            TextField("Add a note…", text: $annotationText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .frame(maxWidth: .infinity)
                .focused($inputFocused)
                .onSubmit { if !trimmedAnnotation.isEmpty { onSave() } }
                #if os(iOS)
                .textInputAutocapitalization(.sentences)
                .submitLabel(.done)
                #endif

            iconButton(symbol: "checkmark", help: "Save highlight", role: nil, action: {
                guard !trimmedAnnotation.isEmpty else { return }
                onSave()
            })
            .disabled(trimmedAnnotation.isEmpty)
            .opacity(trimmedAnnotation.isEmpty ? 0.45 : 1)
            #if os(macOS)
            .keyboardShortcut(.return, modifiers: [])
            #else
            .keyboardShortcut(.defaultAction)
            #endif
        }
    }

    private var accentSwatchRow: some View {
        HStack(spacing: 6) {
            ForEach(StudyHighlightAccentToken.pickerChoices, id: \.rawValue) { token in
                accentDot(token)
            }
            Spacer(minLength: 0)
        }
        .padding(.leading, 2)
    }

    private func accentDot(_ token: StudyHighlightAccentToken) -> some View {
        let picked = selectedAccent == token
        return Button {
            selectedAccent = token
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Color.primary.opacity(picked ? 0.65 : 0.18), lineWidth: picked ? 2 : 1)
                    .frame(width: 22, height: 22)
                swatch(token)
                    .frame(width: 15, height: 15)
                    .clipShape(Circle())
            }
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
        symbol: String,
        help: String,
        role: ButtonRole?,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 26, height: 26)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.primary.opacity(0.8))
        #if os(macOS)
        .help(help)
        #endif
    }
}
