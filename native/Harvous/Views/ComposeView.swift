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

    // Derived tag suggestions from content keywords
    private var suggestedTags: [String] {
        let text = editorState.plainText.lowercased()
        var tags: [String] = []
        if text.contains("faith")   { tags.append("faith") }
        if text.contains("grace")   { tags.append("grace") }
        if text.contains("love")    { tags.append("love") }
        if text.contains("hope")    { tags.append("hope") }
        if text.contains("prayer")  { tags.append("prayer") }
        if text.contains("worship") { tags.append("worship") }
        if !editorState.detectedRefs.isEmpty { tags.append("scripture") }
        return Array(tags.prefix(4))
    }

    private var canSave: Bool {
        !editorState.plainText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Title
                TextField("Title", text: $title)
                    .font(.system(size: 22, weight: .bold))
                    .textFieldStyle(.plain)
                    .focused($titleFocused)
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 4)
                    #if os(iOS)
                    .submitLabel(.next)
                    .onSubmit { editorFocused = true }
                    #endif

                Divider().padding(.horizontal, 20)

                // Editor — the primary surface
                HarvousEditor(state: $editorState)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                // Live scripture detection feedback
                if !editorState.detectedRefs.isEmpty {
                    refsStrip
                }

                // Footer: tags + thread indicator
                composeFooter
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
                // Focus title on open
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    titleFocused = true
                }
            }
        }
    }

    // MARK: - Detected refs strip

    private var refsStrip: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Image(systemName: "book.closed.fill")
                        .font(.caption)
                        .foregroundStyle(.tint)

                    ForEach(editorState.detectedRefs, id: \.self) { ref in
                        Text(ref)
                            .font(.subheadline)
                            .foregroundStyle(.tint)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(.tint.opacity(0.08), in: Capsule())
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
            }
        }
        .background(.bar)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(HarvousAnimation.spring, value: editorState.detectedRefs.count)
    }

    // MARK: - Compose footer

    private var composeFooter: some View {
        HStack(spacing: 8) {
            // Tag chips
            if suggestedTags.isEmpty {
                Label("Tags appear as you write", systemImage: "tag")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(suggestedTags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(.quaternary, in: Capsule())
                        }
                    }
                }
            }

            Spacer()

            // Auto-thread indicator
            HStack(spacing: 4) {
                Image(systemName: "sparkles")
                    .font(.caption)
                    .foregroundStyle(.tint)
                Text("Auto-organized")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.bar)
    }

    // MARK: - Save

    private func save() {
        let body = editorState.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }

        let note = Note(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            body: body,
            detectedRefs: editorState.detectedRefs,
            threadColor: Note.nextColor(existing: existingNotes),
            tags: suggestedTags
        )
        context.insert(note)
        dismiss()
    }
}

#Preview {
    ComposeView()
        .modelContainer(for: [Note.self], inMemory: true)
}
