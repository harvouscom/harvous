import SwiftUI
import SwiftData

/// Full-screen note editor — lives in the NavigationSplitView detail column on macOS,
/// and as a pushed NavigationStack screen on iOS.
struct NoteEditorView: View {
    var note: Note?

    @Environment(\.modelContext) private var context
    @State private var editorState = EditorState()
    @State private var title = ""
    @State private var isSaving = false
    @FocusState private var titleFocused: Bool
    @State private var saveDebounce: Date = .distantPast

    // Sync local state from the incoming note
    private func loadNote(_ note: Note) {
        title = note.title
        editorState = EditorState(plainText: note.body, detectedRefs: note.detectedRefs)
    }

    var body: some View {
        Group {
            if let note {
                editorBody(note: note)
            } else {
                welcomeDetail
            }
        }
        .onChange(of: note) { _, newNote in
            if let newNote { loadNote(newNote) }
            else { title = ""; editorState = EditorState() }
        }
        .onAppear {
            if let note { loadNote(note) }
        }
    }

    // MARK: - Welcome / empty detail

    private var welcomeDetail: some View {
        ContentUnavailableView {
            Label("Select a Note", systemImage: "note.text")
        } description: {
            Text("Choose a note from the list, or create a new one.")
        }
    }

    // MARK: - Editor body

    @ViewBuilder
    private func editorBody(note: Note) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Title
                TextField("Title", text: $title, axis: .vertical)
                    .font(.system(size: 28, weight: .bold))
                    .focused($titleFocused)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 24)
                    .padding(.top, 24)
                    .padding(.bottom, 8)
                    .onChange(of: title) { _, _ in scheduleAutosave(note) }

                // Metadata bar
                metadataBar(note: note)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)

                Divider()
                    .padding(.horizontal, 24)

                // Body editor
                HarvousEditor(state: $editorState)
                    .frame(minHeight: 300)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                    .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }

                // Scripture pills (detected refs)
                if !editorState.detectedRefs.isEmpty {
                    refsBar
                        .padding(.horizontal, 24)
                        .padding(.bottom, 8)
                }

                // Tags
                if !note.tags.isEmpty {
                    tagsRow(note: note)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                }
            }
        }
        .navigationTitle(title.isEmpty ? "Note" : title)
        #if os(macOS)
        .navigationSubtitle(note.primaryRef ?? "")
        #endif
        .toolbar { editorToolbar(note: note) }
        .background { autosaveTask(note: note) }
    }

    // MARK: - Metadata bar

    private func metadataBar(note: Note) -> some View {
        HStack(spacing: 12) {
            // Thread color chip
            if let color = note.color {
                HStack(spacing: 5) {
                    Circle().fill(color).frame(width: 8, height: 8)
                    Text(note.threadName ?? "Study")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(.quaternary, in: Capsule())
            }

            // Date
            Text(note.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.subheadline)
                .foregroundStyle(.tertiary)

            Spacer()
        }
    }

    // MARK: - Detected refs bar

    private var refsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(editorState.detectedRefs, id: \.self) { ref in
                    Menu {
                        Section("Translation") {
                            ForEach(ScriptureReference.availableTranslations, id: \.self) { t in
                                Button(t) { /* swap translation — stubbed */ }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "book.closed.fill")
                                .font(.caption2)
                            Text(ref)
                                .font(.subheadline)
                        }
                        .foregroundStyle(.tint)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.tint.opacity(0.08), in: Capsule())
                        .overlay(Capsule().strokeBorder(.tint.opacity(0.2), lineWidth: 0.5))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Tags row

    private func tagsRow(note: Note) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Image(systemName: "tag")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                ForEach(note.tags, id: \.self) { tag in
                    Text(tag)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.quaternary, in: Capsule())
                }
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private func editorToolbar(note: Note) -> some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            if isSaving {
                ProgressView().controlSize(.small)
            }
        }
        #if os(macOS)
        ToolbarItem(placement: .primaryAction) {
            Button {
                // Share sheet — stubbed
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            .help("Share Note")
        }
        #endif
    }

    // MARK: - Autosave

    private func scheduleAutosave(_ note: Note) {
        // Stamp the time; the .task modifier watches this and debounces
        saveDebounce = Date()
        _ = note // capture for the task below
    }

    @ViewBuilder
    private func autosaveTask(note: Note) -> some View {
        Color.clear.task(id: saveDebounce) {
            guard saveDebounce != .distantPast else { return }
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            note.title = title
            note.body = editorState.plainText
            note.detectedRefs = editorState.detectedRefs
            note.updatedAt = Date()
        }
        .frame(width: 0, height: 0)
    }
}

#Preview {
    NoteEditorView()
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(minWidth: 500, minHeight: 500)
}
