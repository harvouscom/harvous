import SwiftUI
import SwiftData

struct NoteEditorView: View {
    @Binding var note: Note?

    @Environment(\.modelContext) private var context
    @State private var editorState = EditorState()
    @State private var title = ""
    @State private var saveDebounce: Date = .distantPast
    @FocusState private var titleFocused: Bool

    #if os(macOS)
    @State private var proxy = EditorProxy()
    #endif

    // MARK: - Body

    var body: some View {
        Group {
            if let note {
                editorCanvas(note: note)
            } else {
                emptyDetail
            }
        }
        .onChange(of: note?.id) { _, _ in syncFromNote() }
        .onAppear { syncFromNote() }
    }

    // MARK: - Empty state

    private var emptyDetail: some View {
        ContentUnavailableView {
            Label("No Note Selected", systemImage: "note.text")
        } description: {
            Text("Select a note from the list or create a new one.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }

    // MARK: - Editor canvas

    @ViewBuilder
    private func editorCanvas(note: Note) -> some View {
        VStack(spacing: 0) {
            #if os(macOS)
            // Top info bar
            infoBar(note: note)
            Divider()
            // Formatting toolbar
            FormatToolbar(proxy: proxy)
            Divider()
            #endif

            // Scrollable content: title + body
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Large title
                    TextField("Title", text: $title, axis: .vertical)
                        .font(.system(size: 32, weight: .bold))
                        .textFieldStyle(.plain)
                        .focused($titleFocused)
                        .padding(.horizontal, 36)
                        .padding(.top, 28)
                        .padding(.bottom, 12)
                        .onChange(of: title) { _, _ in scheduleAutosave(note) }

                    // Scripture refs (live, beneath title)
                    if !editorState.detectedRefs.isEmpty {
                        refsBar
                            .padding(.horizontal, 36)
                            .padding(.bottom, 10)
                    }

                    // Body editor — TextKit 2
                    HarvousEditor(
                        state: $editorState,
                        proxy: proxy,
                        placeholder: "Start writing…",
                        font: .systemFont(ofSize: 15, weight: .regular)
                    )
                    .frame(minHeight: 400)
                    .padding(.horizontal, 32)
                    .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }

                    // Tags
                    if !note.tags.isEmpty {
                        tagsRow(note.tags)
                            .padding(.horizontal, 36)
                            .padding(.top, 16)
                            .padding(.bottom, 32)
                    }
                }
            }
            .background(.background)
        }
        .background(.background)
        .background { autosaveBackground(note: note) }
    }

    // MARK: - Info bar (macOS top strip)

    #if os(macOS)
    private func infoBar(note: Note) -> some View {
        HStack(spacing: 12) {
            // Date & time
            Image(systemName: "calendar")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
            Text(note.updatedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .monospacedDigit()

            Spacer()

            // Thread chip
            if let color = note.color {
                HStack(spacing: 4) {
                    Circle().fill(color).frame(width: 7, height: 7)
                    Text(note.threadName ?? "Study")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(.quaternary, in: Capsule())
            }

            // Action buttons
            HStack(spacing: 2) {
                toolbarIconButton("pin", help: "Pin") { }
                toolbarIconButton("magnifyingglass", help: "Find") { }
                toolbarIconButton("square.and.arrow.up", help: "Share") { }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 7)
        .background(.bar)
    }

    private func toolbarIconButton(_ symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13))
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
        .help(help)
    }
    #endif

    // MARK: - Refs bar

    private var refsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(editorState.detectedRefs, id: \.self) { ref in
                    Menu {
                        Section("Translation") {
                            ForEach(ScriptureReference.availableTranslations, id: \.self) { t in
                                Button(t) { }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "book.closed.fill")
                                .font(.system(size: 9))
                            Text(ref)
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundStyle(.tint)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(.tint.opacity(0.08), in: Capsule())
                        .overlay(Capsule().strokeBorder(.tint.opacity(0.2), lineWidth: 0.5))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .animation(HarvousAnimation.spring, value: editorState.detectedRefs.count)
    }

    // MARK: - Tags

    private func tagsRow(_ tags: [String]) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "tag")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.quaternary, in: Capsule())
            }
        }
    }

    // MARK: - Autosave

    private func scheduleAutosave(_ note: Note) {
        saveDebounce = Date()
        _ = note
    }

    @ViewBuilder
    private func autosaveBackground(note: Note) -> some View {
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

    // MARK: - Sync

    private func syncFromNote() {
        if let note {
            title = note.title
            editorState = EditorState(plainText: note.body, detectedRefs: note.detectedRefs)
        } else {
            title = ""
            editorState = EditorState()
        }
    }
}

#Preview {
    NoteEditorView(note: .constant(nil))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(minWidth: 600, minHeight: 500)
}
