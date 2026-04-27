import SwiftUI
import SwiftData

struct ComposeView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var existingNotes: [Note]

    @State private var title = ""
    @State private var editorState = EditorState()
    @FocusState private var titleFocused: Bool
    @FocusState private var editorFocused: Bool
    @State private var scriptureSheet: ScripturePassageSheetItem?

    private var tagResult: (primaryCollection: String?, tags: [String]) {
        let body = editorState.plainText
        return BibleStudyTagSuggester.result(title: title, body: body)
    }

    private var canSave: Bool {
        !editorState.plainText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TextField("Title", text: $title)
                    .font(HarvousTypography.composeTitleField)
                    .textFieldStyle(.plain)
                    #if os(iOS)
                    .autocorrectionDisabled(false)
                    .textInputAutocapitalization(.sentences)
#endif
                    .focused($titleFocused)
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 4)
                    #if os(iOS)
                    .submitLabel(.next)
                    .onSubmit { editorFocused = true }
                    #endif

                Divider().padding(.horizontal, 20)

                HarvousEditor(
                    state: $editorState,
                    onScripturePillTap: { ref, trans, _ in
                        scriptureSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
                    }
                )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                composeMetadataBar
            }
            .navigationTitle("New Note")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(!canSave)
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    titleFocused = true
                }
            }
            .sheet(item: $scriptureSheet) { item in
                NavigationStack {
                    ScrollView {
                        ScripturePassageView(reference: item.reference, translation: item.translation, showHeader: true)
                            .padding(20)
                    }
                    .navigationTitle("Passage")
                    #if os(iOS)
                    .navigationBarTitleDisplayMode(.inline)
                    #endif
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { scriptureSheet = nil }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Theme tags + scripture chips (unified)

    private var composeMetadataBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            let hasTheme = !tagResult.tags.isEmpty
            let hasRefs = !editorState.detectedRefs.isEmpty

            if hasTheme || hasRefs {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(tagResult.tags, id: \.self) { tag in
                            ThemeTagChip(text: tag)
                        }
                        ForEach(editorState.detectedRefs, id: \.self) { ref in
                            ScriptureRefChip(reference: ref) {
                                scriptureSheet = ScripturePassageSheetItem(
                                    reference: ref,
                                    translation: ScriptureReference.defaultTranslation
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }
            } else {
                Label("Tags and references appear as you write", systemImage: "tag")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 20)
            }
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.bar)
    }

    // MARK: - Save

    private func save() {
        let body = editorState.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }

        let note = Note(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            body: body,
            detectedRefs: editorState.detectedRefs
        )
        BibleStudyTagSuggester.applyToNote(note)
        context.insert(note)
        try? context.save()
        dismiss()
    }
}

#Preview {
    ComposeView()
        .modelContainer(for: [Note.self], inMemory: true)
}
