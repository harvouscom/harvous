import SwiftUI

/// Payload after the user confirms capture from the highlight floating menu.
struct StudySelectionInput: Equatable {
    var body: String
    var accent: StudyHighlightAccentToken
}

/// Floating capsule anchored to prose: mini-note capture + accent picker.
/// `Connect note` lives at note level (`NoteConnectionsBar`); this surface stays highlight-specific.
///
/// Future: add a chevron or "more" control that calls `onSeeMore` to present a bottom sheet
/// (same pattern as `ScripturePillEditorSheet` / `scripturePassageSheet` in `NoteEditorView`).
struct StudySelectionFloatingMenu: View {
    /// Bump when selection changes so the capsule resets without re-mounting views.
    var selectionGeneration: UInt64

    let onConfirm: (StudySelectionInput) -> Void
    /// User dismissed (X) without confirming — parent should clear editor selection.
    var onDismiss: () -> Void = {}
    /// Reserved for a future bottom sheet with more highlight actions (no UI wired yet).
    var onSeeMore: (() -> Void)? = nil

    /// When inline layout is tall (always for this menu); kept for overlay positioning upstream.
    var onMeasuresTallChange: ((Bool) -> Void)? = nil

    @State private var miniDraft = ""
    @State private var selectedHighlightAccent: StudyHighlightAccentToken = .auto

    @FocusState private var miniFieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "note.text.badge.plus")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.primary.opacity(0.85))
                    .frame(width: 24, alignment: .center)
                    .accessibilityHidden(true)

                TextField("Capture a thought…", text: $miniDraft)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14, weight: .regular))
                    .frame(minWidth: 180, idealWidth: 220, maxWidth: 280)
                    #if os(iOS)
                    .textInputAutocapitalization(.sentences)
                    #endif
                    .focused($miniFieldFocused)
                    .onSubmit {
                        confirmMiniDraftIfPossible()
                    }

                miniConfirmControl

                dismissControl
            }

            StudyDockAccentPickerRow(selection: $selectedHighlightAccent)
                .padding(.leading, -2)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(menuChrome)
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Color.white.opacity(0.3), lineWidth: 0.6)
                .allowsHitTesting(false)
        )
        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .fixedSize(horizontal: false, vertical: true)
        .onAppear {
            onMeasuresTallChange?(true)
            miniFieldFocused = true
            _ = onSeeMore
        }
        .onChange(of: selectionGeneration) { _, _ in
            miniDraft = ""
            selectedHighlightAccent = .auto
            miniFieldFocused = true
            onMeasuresTallChange?(true)
        }
    }

    private var menuChrome: some View {
        Group {
            if #available(macOS 26.0, iOS 26.0, *) {
                let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
                shape
                    .fill(.clear)
                    .glassEffect(in: shape)
            } else {
                RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.ultraThinMaterial)
            }
        }
        .allowsHitTesting(false)
    }

    private var miniConfirmControl: some View {
        confirmationIconButton(enabled: miniDraftTrimmedNonEmpty) {
            confirmMiniDraftIfPossible()
        }
    }

    private var miniDraftTrimmedNonEmpty: Bool {
        !miniDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func confirmMiniDraftIfPossible() {
        let body = miniDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        onConfirm(StudySelectionInput(body: body, accent: selectedHighlightAccent))
    }

    private var dismissControl: some View {
        Button {
            miniDraft = ""
            selectedHighlightAccent = .auto
            miniFieldFocused = false
            onDismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.secondary)
                .frame(width: 24, height: 24)
                .background(Circle().fill(Color.primary.opacity(0.06)))
        }
        .buttonStyle(.plain)
        .help("Dismiss")
        .accessibilityLabel("Close study menu")
    }

    @ViewBuilder
    private func confirmationIconButton(enabled: Bool, handler: @escaping () -> Void) -> some View {
        Button(action: handler) {
            Image(systemName: "checkmark")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(enabled ? Color.white.opacity(0.95) : Color.primary.opacity(0.35))
                .frame(width: 26, height: 26)
                .background(
                    Capsule(style: .continuous)
                        .fill(enabled ? Color.harvousAccent : Color.primary.opacity(0.06))
                )
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel("Confirm highlight")
    }
}
