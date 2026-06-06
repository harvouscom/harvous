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
                VStack(alignment: .leading, spacing: 16) {
                    EastonsEntryView(slug: $slug, showHeadword: true, showDisclaimer: true)
                        .padding(.horizontal, 20)
                        .padding(.top, 12)

                    Button(action: onSave) {
                        Label("Save reference", systemImage: "lines.measurement.horizontal")
                            .font(HarvousFonts.font(size: 15, weight: .semibold, design: .default))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 8)
                }
            }
            .navigationTitle(headword)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.large)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
