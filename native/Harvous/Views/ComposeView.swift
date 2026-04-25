import SwiftUI
import SwiftData

struct ComposeView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var existingNotes: [Note]

    @State private var title = ""
    @State private var editorState = EditorState()
    @State private var isSaving = false

    // Stubbed tags — will be generated from content in the real build
    private var suggestedTags: [String] {
        var tags: [String] = []
        if editorState.plainText.lowercased().contains("faith") { tags.append("faith") }
        if editorState.plainText.lowercased().contains("grace") { tags.append("grace") }
        if editorState.plainText.lowercased().contains("love")  { tags.append("love") }
        if !editorState.detectedRefs.isEmpty                    { tags.append("scripture") }
        return tags
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                // Title field
                TextField("Title (optional)", text: $title)
                    .font(HarvousTypography.title)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 8)

                Divider().padding(.horizontal, 20)

                // Editor — the core surface
                HarvousEditor(state: $editorState)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                // Detected scripture refs (live)
                if !editorState.detectedRefs.isEmpty {
                    detectedRefsBar
                }

                Divider()

                // Tag chips + thread suggestion
                footerBar
            }
            .navigationTitle("New Note")
            #if os(macOS)
            .navigationSubtitle(editorState.detectedRefs.isEmpty ? "" : editorState.detectedRefs.joined(separator: " · "))
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(editorState.plainText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .bold()
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 560, minHeight: 420)
        #endif
    }

    // MARK: - Subviews

    private var detectedRefsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Image(systemName: "book.closed")
                    .font(.caption)
                    .foregroundStyle(Color.harvousAccent)
                ForEach(editorState.detectedRefs, id: \.self) { ref in
                    Text(ref)
                        .font(HarvousTypography.caption)
                        .foregroundStyle(Color.harvousAccent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.harvousAccent.opacity(0.08), in: Capsule())
                        .overlay(Capsule().strokeBorder(Color.harvousAccent.opacity(0.2), lineWidth: 0.5))
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
        }
    }

    private var footerBar: some View {
        HStack(spacing: 8) {
            if !suggestedTags.isEmpty {
                ForEach(suggestedTags, id: \.self) { tag in
                    Text("#\(tag)")
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.quaternary, in: Capsule())
                }
            } else {
                Text("Tags will appear as you write…")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
            // Thread suggestion — auto-assigned on save
            HStack(spacing: 4) {
                Circle()
                    .fill(Color.threadBlue)
                    .frame(width: 8, height: 8)
                Text("Auto-organized")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Actions

    private func save() {
        let bodyText = editorState.plainText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !bodyText.isEmpty else { return }

        let note = Note(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            body: bodyText,
            detectedRefs: editorState.detectedRefs,
            threadColor: Note.nextColor(existing: existingNotes),
            tags: suggestedTags
        )

        withAnimation(HarvousAnimation.spring) {
            context.insert(note)
        }
        dismiss()
    }
}

#Preview {
    ComposeView()
        .modelContainer(for: [Note.self], inMemory: true)
}
