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
        // Auto-focus title when a brand-new empty note is opened (Apple Notes UX)
        .task(id: note?.id) {
            guard let n = note, n.title.isEmpty, n.body.isEmpty else { return }
            try? await Task.sleep(for: .milliseconds(80))
            titleFocused = true
        }
        #if os(macOS)
        .toolbar { editorToolbar }
        #endif
    }

    // MARK: - Empty state

    private var emptyDetail: some View {
        ContentUnavailableView {
            Label("No Note Selected", systemImage: "note.text")
        } description: {
            Text("Select a note from the list, or press ⌘N to compose a new one.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.surfaceElevated)
    }

    // MARK: - Editor canvas

    @ViewBuilder
    private func editorCanvas(note: Note) -> some View {
        VStack(spacing: 0) {
            // Scrollable writing surface
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Title — Apple Notes style: large, bold, full-width
                    TextField("Title", text: $title, axis: .vertical)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color.inkPrimary)
                        .textFieldStyle(.plain)
                        .focused($titleFocused)
                        .padding(.horizontal, 32)
                        .padding(.top, 24)
                        .padding(.bottom, 4)
                        .onChange(of: title) { _, _ in scheduleAutosave(note) }

                    // Date line — Apple Notes-style subtle date below title
                    Text(note.updatedAt.formatted(date: .long, time: .omitted))
                        .font(.system(size: 12))
                        .foregroundStyle(Color.inkTertiary)
                        .padding(.horizontal, 32)
                        .padding(.bottom, 16)

                    // Scripture refs strip (Harvous addition — tasteful)
                    if !editorState.detectedRefs.isEmpty {
                        refsBar
                            .padding(.horizontal, 32)
                            .padding(.bottom, 12)
                    }

                    // Body — TextKit 2
                    #if os(macOS)
                    HarvousEditor(
                        state: $editorState,
                        proxy: proxy,
                        placeholder: "Start writing…",
                        font: .systemFont(ofSize: 15, weight: .regular)
                    )
                    .frame(minHeight: 400)
                    .padding(.horizontal, 28)
                    .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                    #else
                    HarvousEditor(
                        state: $editorState,
                        placeholder: "Start writing…"
                    )
                    .frame(minHeight: 400)
                    .padding(.horizontal, 28)
                    .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                    #endif

                    Spacer().frame(height: 80)
                }
            }
            .background(Color.surfaceElevated)

            #if os(macOS)
            // Conditional format bar — peeks up from the bottom when text is selected
            if proxy.hasSelection {
                FormatToolbar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            #endif
        }
        #if os(macOS)
        .animation(HarvousAnimation.spring, value: proxy.hasSelection)
        .inspector(isPresented: $showInspector) {
            NoteInspectorView(note: note)
                .inspectorColumnWidth(min: 240, ideal: 280, max: 320)
        }
        #endif
        .background { autosaveBackground(note: note) }
    }

    // MARK: - Native toolbar (macOS)
    // Formatting lives in the conditional bottom bar; toolbar carries note-level actions only.

    #if os(macOS)
    @ToolbarContentBuilder
    private var editorToolbar: some ToolbarContent {
        // Share
        ToolbarItem(placement: .primaryAction) {
            Button { } label: {
                Image(systemName: "square.and.arrow.up")
            }
            .help("Share")
            .disabled(note == nil)
        }

        // Inspector toggle — thread, tags, refs, dates
        ToolbarItem(placement: .primaryAction) {
            Button {
                withAnimation(HarvousAnimation.spring) { showInspector.toggle() }
            } label: {
                Image(systemName: showInspector ? "info.circle.fill" : "info.circle")
                    .foregroundStyle(showInspector ? Color.harvousAccent : .primary)
            }
            .help(showInspector ? "Hide Info" : "Show Info")
            .disabled(note == nil)
        }
    }
    #endif

    // MARK: - Refs bar (Harvous scripture strip)

    private var refsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(editorState.detectedRefs, id: \.self) { ref in
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
            }
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .animation(HarvousAnimation.spring, value: editorState.detectedRefs.count)
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
