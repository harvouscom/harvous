import SwiftUI
import SwiftData

/// Debounces SwiftData writes without touching `@State`, so typing does not rebuild `HarvousEditor` every keystroke.
@MainActor
private final class EditorAutosaveDebouncer {
    private var task: Task<Void, Never>?
    private(set) var latestTitle: String = ""
    private(set) var latestBody: String = ""
    private(set) var latestRefs: [String] = []

    func cancel() {
        task?.cancel()
        task = nil
    }

    func updateSnapshot(title: String, body: String, refs: [String]) {
        latestTitle = title
        latestBody = body
        latestRefs = refs
    }

    func schedule(after delay: TimeInterval = 1, note: Note, context: ModelContext) {
        task?.cancel()
        task = Task { @MainActor in
            let nanos = UInt64((delay * 1_000_000_000).rounded())
            try? await Task.sleep(nanoseconds: nanos)
            guard !Task.isCancelled else { return }
            let unchanged =
                note.title == self.latestTitle && note.body == self.latestBody && note.detectedRefs == self.latestRefs
            guard !unchanged else { return }
            note.title = self.latestTitle
            note.body = self.latestBody
            note.detectedRefs = self.latestRefs
            note.updatedAt = Date()
            BibleStudyTagSuggester.applyToNote(note)
            try? context.save()
            HarvousRecallOSIntegration.afterNotePersisted(note: note, modelContext: context)
        }
    }
}

struct NoteEditorView: View {
    @Binding var note: Note?

    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @State private var editorState = EditorState()
    @State private var title = ""
    /// Reference-type debounce — must not use `@State` timestamps keyed to each keypress (that remounts the editor).
    @State private var autosave = EditorAutosaveDebouncer()
    @FocusState private var titleFocused: Bool

    #if os(macOS)
    @StateObject private var proxy = EditorProxy()
    var showInspector: Binding<Bool> = .constant(false)
    #else
    @State private var showInspectorIOS = false
    @StateObject private var iosBodyProxy = IOSNoteBodyProxy()
    @State private var showScriptureEditorSheet = false
    @State private var scripturePassageSheet: ScripturePassageSheetItem?
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
        .onChange(of: note?.id) { oldId, _ in
            #if os(iOS)
            showScriptureEditorSheet = false
            DispatchQueue.main.async {
                iosBodyProxy.resetForNewNote()
            }
            #endif
            autosave.cancel()
            // Capture UI before any child representable runs; avoids persisting wrong note after a switch.
            let snapshotTitle = title
            let snapshotBody = editorState.plainText
            let snapshotRefs = editorState.detectedRefs
            if let oldId {
                flushPendingEdits(forNoteId: oldId, title: snapshotTitle, body: snapshotBody, refs: snapshotRefs)
            }
            syncFromNote()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .inactive || phase == .background else { return }
            guard let n = note else { return }
            autosave.cancel()
            persistEditorIntoNote(n)
        }
        .onAppear { syncFromNote() }
        // Auto-focus title when a brand-new empty note is opened (Apple Notes UX)
        .task(id: note?.id) {
            guard let n = note, n.title.isEmpty, n.body.isEmpty else { return }
            try? await Task.sleep(for: .milliseconds(80))
            titleFocused = true
        }
    }

    // MARK: - Empty state

    private var emptyDetail: some View {
        ContentUnavailableView {
            Label("No Note Selected", systemImage: "note.text")
        } description: {
            Text("Select a note from the list, or press ⌘N to compose a new one.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Editor canvas

    @ViewBuilder
    private func editorCanvas(note: Note) -> some View {
        VStack(spacing: 0) {
            // Scrollable writing surface — `minHeight` matches viewport so paper runs flush to the footer (no dead band).
            GeometryReader { geo in
                let viewportH = max(geo.size.height, 1)
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // Title — Apple Notes style: large, bold, full-width
                        TextField("Title", text: $title, axis: .vertical)
                            .font(HarvousTypography.composeTitleField)
                            .foregroundStyle(.primary)
                            .textFieldStyle(.plain)
                            #if os(iOS)
                            .autocorrectionDisabled(false)
                            .textInputAutocapitalization(.sentences)
#endif
                            .focused($titleFocused)
                            .onChange(of: titleFocused) { _, focused in
                                if focused {
                                    #if os(macOS)
                                    DispatchQueue.main.async {
                                        proxy.clearActiveScripturePill()
                                    }
                                    #endif
                                }
                            }
                            .padding(.horizontal, 32)
                            .padding(.top, 24)
                            .padding(.bottom, 12)
                            .onChange(of: title) { _, _ in scheduleAutosave(note) }

                        // Body — same horizontal inset as title (TextKit defaults add extra leading; zeroed in HarvousEditor)
                        #if os(macOS)
                        HarvousEditor(
                            state: $editorState,
                            proxy: proxy,
                            noteID: note.id,
                            documentBody: note.body,
                            placeholder: "Start writing…",
                            font: HarvousFonts.system(size: 16, weight: 400, design: .default),
                            onScripturePillTap: { scripturePillTapped(reference: $0, translation: $1, range: $2) }
                        )
                        .frame(minHeight: 400)
                        .padding(.horizontal, 32)
                        .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                        #else
                        HarvousEditor(
                            state: $editorState,
                            noteID: note.id,
                            documentBody: note.body,
                            placeholder: "Start writing…",
                            scriptureProxy: iosBodyProxy,
                            onScripturePillTap: { scripturePillTapped(reference: $0, translation: $1, range: $2) }
                        )
                        .frame(minHeight: 400)
                        .padding(.horizontal, 32)
                        .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                        #endif

                        #if os(iOS)
                        Spacer().frame(height: 80)
                        #else
                        Spacer(minLength: 0)
                        #endif
                    }
                    .frame(maxWidth: .infinity, minHeight: viewportH, alignment: .top)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            #if os(macOS)
            // Bottom bar: format toolbar when selected, while typing, or when pointer is on the bar
            if proxy.shouldShowNoteToolbar {
                NoteToolbar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if proxy.activeScripturePill != nil {
                ScripturePillActionBar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                NoteActionBar(note: note)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            #endif
        }
        #if os(macOS)
        .sheet(isPresented: $proxy.showAddLinkSheet) {
            AddLinkSheetView(proxy: proxy)
        }
        .onChange(of: proxy.showAddLinkSheet) { _, open in
            if !open, proxy.hasActiveAddLinkSession {
                DispatchQueue.main.async {
                    proxy.cancelAddLinkSheet()
                }
            }
        }
        .animation(HarvousAnimation.spring, value: proxy.shouldShowNoteToolbar)
        .animation(HarvousAnimation.spring, value: proxy.activeScripturePill != nil)
        .inspector(isPresented: showInspector) {
            inspectorContent(note: note)
        }
        #else
        .inspector(isPresented: $showInspectorIOS) {
            inspectorContent(note: note)
        }
        .sheet(isPresented: $showScriptureEditorSheet) {
            ScripturePillEditorSheet(proxy: iosBodyProxy) { ref, trans in
                scripturePassageSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
            }
        }
        .onChange(of: showScriptureEditorSheet) { _, open in
            if !open {
                DispatchQueue.main.async {
                    iosBodyProxy.clearActiveScripturePill()
                }
            }
        }
        .sheet(item: $scripturePassageSheet) { item in
            NavigationStack {
                ScrollView {
                    ScripturePassageView(reference: item.reference, translation: item.translation, showHeader: true)
                        .padding(20)
                }
                .navigationTitle("Passage")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { scripturePassageSheet = nil }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    withAnimation(HarvousAnimation.spring) { showInspectorIOS.toggle() }
                } label: {
                    Label("Note details", systemImage: "sidebar.right")
                }
            }
        }
        #endif
    }

    @ViewBuilder
    private func inspectorContent(note: Note) -> some View {
        NoteInspectorView(note: note)
        #if os(macOS)
        .inspectorColumnWidth(min: 240, ideal: 280, max: 320)
        #endif
    }

    private func scripturePillTapped(reference: String, translation: String, range: NSRange) {
        Task { @MainActor in
            let pill = ActiveScripturePill(attachmentRange: range, reference: reference, translation: translation)
            #if os(macOS)
            proxy.activeScripturePill = pill
            #else
            iosBodyProxy.activeScripturePill = pill
            showScriptureEditorSheet = true
            #endif
        }
    }

    // MARK: - Autosave

    private func scheduleAutosave(_ note: Note) {
        autosave.updateSnapshot(title: title, body: editorState.plainText, refs: editorState.detectedRefs)
        autosave.schedule(note: note, context: context)
    }

    /// Writes the in-memory title/editor fields into a note row and commits the store.
    private func persistEditorIntoNote(_ n: Note) {
        let body = editorState.plainText
        let refs = editorState.detectedRefs
        guard n.title != title || n.body != body || n.detectedRefs != refs else {
            autosave.updateSnapshot(title: title, body: body, refs: refs)
            return
        }
        n.title = title
        n.body = body
        n.detectedRefs = refs
        n.updatedAt = Date()
        BibleStudyTagSuggester.applyToNote(n)
        try? context.save()
        HarvousRecallOSIntegration.afterNotePersisted(note: n, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
    }

    /// When the selected note changes (or clears), persist UI state to the *previous* note so
    /// a pending debounced save is not lost when work is cancelled.
    private func flushPendingEdits(forNoteId id: UUID, title: String, body: String, refs: [String]) {
        let targetId = id
        let descriptor = FetchDescriptor<Note>(predicate: #Predicate { $0.id == targetId })
        guard let previous = try? context.fetch(descriptor).first else { return }
        guard previous.title != title || previous.body != body || previous.detectedRefs != refs else {
            autosave.updateSnapshot(title: title, body: body, refs: refs)
            return
        }
        previous.title = title
        previous.body = body
        previous.detectedRefs = refs
        previous.updatedAt = Date()
        BibleStudyTagSuggester.applyToNote(previous)
        try? context.save()
        HarvousRecallOSIntegration.afterNotePersisted(note: previous, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
    }

    // MARK: - Sync

    private func syncFromNote() {
        if let note {
            title = note.title
            editorState = EditorState(plainText: note.body, detectedRefs: note.detectedRefs)
            BibleStudyTagSuggester.applyToNote(note)
            autosave.updateSnapshot(title: title, body: editorState.plainText, refs: editorState.detectedRefs)
        } else {
            title = ""
            editorState = EditorState()
            autosave.updateSnapshot(title: "", body: "", refs: [])
        }
    }
}

#Preview {
    NoteEditorView(note: .constant(nil))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(minWidth: 600, minHeight: 500)
}
