import SwiftUI

// MARK: - Reference Suggestion Sheet
//
// Presented when the user taps an inline reference suggestion (dotted underline) in the editor.
// Mirrors the web ReferenceDockWeb "pending" mode: shows the Easton's entry + a prominent
// "Save reference" button, but does NOT persist anything until the user confirms.
//
// Extracted into its own struct so it can own @State (for the see-also slug swap) without
// conflicting with @ViewBuilder in the parent `NoteEditorView`.

struct ReferenceSuggestionSheet: View {
    /// Identifiable wrapper matching `NoteEditorView.PendingReferenceSuggestion`.
    struct Pending {
        let slug: String
    }

    let pending: any Identifiable // PendingReferenceSuggestion from NoteEditorView
    let initialSlug: String
    let onSave: () -> Void
    let onCancel: () -> Void

    @State private var slug: String

    init(pending: some Identifiable, initialSlug: String, onSave: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.pending = pending
        self.initialSlug = initialSlug
        self.onSave = onSave
        self.onCancel = onCancel
        self._slug = State(initialValue: initialSlug)
    }

    private var headword: String {
        EastonsDictionaryService.shared.slugIndex[slug]?.headword
            ?? EastonsDictionaryService.shared.slugIndex[initialSlug]?.headword
            ?? "Dictionary"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                EastonsEntryView(slug: $slug, showHeadword: true, showDisclaimer: true)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            }
            .navigationTitle(headword)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.large)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                // Compact confirmation in the top bar — the sheet equivalent of the web dock's
                // header checkmark orb (rather than a large bottom button).
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: onSave) {
                        Label("Save reference", systemImage: "checkmark")
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
