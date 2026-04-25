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
    @State private var showInspector = false
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
        .background(Color.surfaceElevated)
    }

    // MARK: - Editor canvas

    @ViewBuilder
    private func editorCanvas(note: Note) -> some View {
        VStack(spacing: 0) {
            #if os(macOS)
            editorHeader(note: note)
            Color.separatorWarm.frame(height: 0.5)
            #endif

            // Scrollable content: title + body
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Large warm title
                    TextField("Title", text: $title, axis: .vertical)
                        .font(.system(size: 36, weight: .bold))
                        .foregroundStyle(Color.inkPrimary)
                        .textFieldStyle(.plain)
                        .focused($titleFocused)
                        .padding(.horizontal, 48)
                        .padding(.top, 36)
                        .padding(.bottom, 12)
                        .onChange(of: title) { _, _ in scheduleAutosave(note) }

                    // Scripture refs (live, beneath title)
                    if !editorState.detectedRefs.isEmpty {
                        refsBar
                            .padding(.horizontal, 48)
                            .padding(.bottom, 12)
                    }

                    // Body editor — TextKit 2
                    #if os(macOS)
                    HarvousEditor(
                        state: $editorState,
                        proxy: proxy,
                        placeholder: "Start writing…",
                        font: .systemFont(ofSize: 16, weight: .regular)
                    )
                    .frame(minHeight: 400)
                    .padding(.horizontal, 44)
                    .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                    #else
                    HarvousEditor(
                        state: $editorState,
                        placeholder: "Start writing…"
                    )
                    .frame(minHeight: 400)
                    .padding(.horizontal, 44)
                    .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                    #endif

                    // Tags (read-only, now also visible in inspector)
                    if !note.tags.isEmpty {
                        tagsRow(note.tags)
                            .padding(.horizontal, 48)
                            .padding(.top, 20)
                            .padding(.bottom, 40)
                    } else {
                        Spacer().frame(height: 60)
                    }
                }
            }
            .background(Color.surfaceElevated)

            #if os(macOS)
            // Conditional format toolbar — slides in when text is selected
            if proxy.hasSelection {
                FormatToolbar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            #endif
        }
        .background(Color.surfaceElevated)
        #if os(macOS)
        .animation(HarvousAnimation.spring, value: proxy.hasSelection)
        .inspector(isPresented: $showInspector) {
            NoteInspectorView(note: note)
                .inspectorColumnWidth(min: 240, ideal: 280, max: 320)
        }
        #endif
        .background { autosaveBackground(note: note) }
    }

    // MARK: - Minimal editor header (macOS)

    #if os(macOS)
    private func editorHeader(note: Note) -> some View {
        HStack(spacing: 4) {
            Spacer()

            // Share
            headerButton("square.and.arrow.up", help: "Share") { }

            // Inspector toggle — reveals thread, tags, dates panel
            headerButton(
                showInspector ? "sidebar.right" : "sidebar.right",
                help: showInspector ? "Hide Inspector" : "Show Inspector"
            ) {
                withAnimation(HarvousAnimation.spring) {
                    showInspector.toggle()
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.surfaceElevated)
    }

    private func headerButton(_ symbol: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.inkTertiary)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                        .padding(.vertical, 5)
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
                .foregroundStyle(Color.inkQuaternary)
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .font(.system(size: 12))
                    .foregroundStyle(Color.inkSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.surfaceInset, in: Capsule())
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
