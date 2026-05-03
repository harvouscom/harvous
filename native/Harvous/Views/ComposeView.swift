import SwiftUI
import SwiftData

struct ComposeView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(\.harvousScriptureTheme) private var scriptureTheme
    @EnvironmentObject private var spaceStore: SpaceStore
    @Query private var existingNotes: [Note]

    @State private var title = ""
    @State private var editorState = EditorState()
    @FocusState private var titleFocused: Bool
    @FocusState private var editorFocused: Bool
    @State private var scriptureSheet: ScripturePassageSheetItem?

#if os(iOS)
    @StateObject private var composeBodyProxy = EditorProxy()
#endif

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

                composeEditor

                composeBottomBar
            }
#if os(iOS)
            .animation(HarvousAnimation.spring, value: composeBodyProxy.shouldShowNoteToolbar)
#endif
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
#if os(iOS)
            .sheet(isPresented: $composeBodyProxy.showIOSInlineImageImporter) {
                IOSInlineImagePickSheet(isPresented: $composeBodyProxy.showIOSInlineImageImporter) {
                    composeBodyProxy.insertPhotoLibraryImage($0)
                }
            }
            .sheet(isPresented: $composeBodyProxy.showAddLinkSheet) {
                AddLinkSheetView(proxy: composeBodyProxy)
            }
            .onChange(of: composeBodyProxy.showAddLinkSheet) { _, open in
                if !open, composeBodyProxy.hasActiveAddLinkSession {
                    DispatchQueue.main.async {
                        composeBodyProxy.cancelAddLinkSheet()
                    }
                }
            }
#endif
        }
    }

    // MARK: - Editor shell

    private var composeEditor: some View {
        Group {
#if os(iOS)
            HarvousEditor(
                state: $editorState,
                scriptureTheme: scriptureTheme,
                proxy: composeBodyProxy,
                onScripturePillTap: { ref, trans, _ in
                    scriptureSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
                }
            )
#else
            HarvousEditor(
                state: $editorState,
                scriptureTheme: scriptureTheme,
                onScripturePillTap: { ref, trans, _ in
                    scriptureSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
                }
            )
#endif
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

#if os(iOS)
    @ViewBuilder
    private var composeBottomBar: some View {
        if composeBodyProxy.shouldShowNoteToolbar {
            NoteToolbar(proxy: composeBodyProxy)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        } else {
            composeMetadataBar
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
#else
    private var composeBottomBar: some View {
        composeMetadataBar
    }
#endif

    // MARK: - Bottom bar: suggested primary collection only (no chips)

    /// Trimmed suggestion from tagger (used for persistence on save via `applyToNote`); bar shows folder + label.
    private var composeSuggestedPrimaryCollectionTrimmed: String {
        tagResult.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private var composeHasSuggestedPrimaryCollection: Bool {
        !composeSuggestedPrimaryCollectionTrimmed.isEmpty
    }

    private var composeMetadataBar: some View {
        HStack(spacing: 6) {
            CollectionSymbol(isContextUpdating: false, font: .system(size: 13))
            if composeHasSuggestedPrimaryCollection {
                Text(composeSuggestedPrimaryCollectionTrimmed)
                    .font(HarvousTypography.actionBarChip)
                    .lineLimit(1)
                    .truncationMode(.tail)
            } else {
                Text("No collection")
                    .font(HarvousTypography.actionBarChip)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.bar)
        .foregroundStyle(
            composeHasSuggestedPrimaryCollection
                ? AnyShapeStyle(HarvousColors.themeAccent(scriptureTheme))
                : AnyShapeStyle(.secondary)
        )
#if os(iOS)
        .animation(HarvousAnimation.spring, value: composeBodyProxy.isBodyFirstResponder)
#endif
    }

    // MARK: - Save

    private func save() {
        let body = editorState.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }

        let note = Note(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            body: body,
            detectedRefs: editorState.detectedRefs,
            spaceId: spaceStore.activeSpaceUUID()
        )
        BibleStudyTagSuggester.applyToNote(note)
        context.insert(note)
        try? context.save()
        HarvousRecallOSIntegration.afterNotePersisted(note: note, modelContext: context)
        dismiss()
    }
}

#Preview {
    ComposeView()
        .environmentObject(SpaceStore())
        .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
}
