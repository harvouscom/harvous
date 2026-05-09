import SwiftData
import SwiftUI

/// Full-detail scripture passage dock from the Highlights list (no owning note pill).
struct StandaloneScripturePassageDockHost: View {
    let presentation: StandaloneScripturePassageDockPresentation
    var scriptureTheme: HarvousColors.ThemeVariant
    var onDismiss: () -> Void

    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @State private var scripturePassageHighlights: [StudyThread] = []
    @State private var translationPicker: String = ""
    @State private var ephemeralAccent: StudyHighlightAccentToken? = nil
    @State private var dockExpanded: Bool = true
    @State private var scripturePassageSheet: ScripturePassageSheetItem?

    private func reloadHighlights() {
        let trans = translationPicker.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trans.isEmpty else {
            scripturePassageHighlights = []
            return
        }
        scripturePassageHighlights = ThreadStore.fetchScripturePassageHighlights(
            canonicalReference: presentation.canonicalReference,
            translation: trans,
            modelContext: modelContext
        )
    }

    private func removePassageHighlight(_ removed: StudyThread) {
        ThreadStore.touchParentNoteIfNeeded(removed, modelContext: modelContext)
        modelContext.delete(removed)
        try? modelContext.saveWithLogging()
        reloadHighlights()
        if scripturePassageHighlights.isEmpty {
            onDismiss()
        }
    }

    var body: some View {
        GeometryReader { geo in
            let viewportH = max(geo.size.height, 1)

            ZStack {
                Group {
                    #if os(macOS)
                    Color(nsColor: .windowBackgroundColor)
                    #else
                    Color(uiColor: .secondarySystemGroupedBackground)
                    #endif
                }
                .ignoresSafeArea()

                ActiveScripturePillDock(
                    reference: presentation.canonicalReference,
                    translation: Binding(
                        get: { translationPicker },
                        set: { newValue in
                            guard translationPicker != newValue else { return }
                            translationPicker = newValue
                            reloadHighlights()
                        }
                    ),
                    accent: Binding(
                        get: { ephemeralAccent },
                        set: { ephemeralAccent = $0 }
                    ),
                    isExpanded: $dockExpanded,
                    onReferenceChanged: nil,
                    onAccentPersistedForHighlight: {
                        reloadHighlights()
                    },
                    onRemovePassageHighlight: { removePassageHighlight($0) },
                    onReadPassageFromHighlight: { ref, trans in
                        scripturePassageSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
                    },
                    passageHighlightPaints: scripturePassageHighlights.map {
                        ScripturePassageHighlightPaint(
                            id: $0.id,
                            excerpt: $0.scripturePassageExcerpt ?? "",
                            accentRaw: $0.highlightAccentRaw
                        )
                    },
                    scripturePassageHighlights: scripturePassageHighlights,
                    scriptureTheme: scriptureTheme,
                    onDismiss: onDismiss,
                    allowsStructuralReferenceEdit: false,
                    showsPillAccentControls: false,
                    initialFocusedPassageHighlightThreadId: presentation.focusedHighlightThreadId,
                    fillsAvailableHeight: true,
                    allowsCollapseExpand: false,
                    onStandaloneFocusedPassageHighlightChanged: { threadId in
                        appRouter.setStandaloneScriptureFocusedPassageHighlight(threadId: threadId)
                    }
                )
                .environment(\.harvousDockExpandedContentMaxHeight, viewportH)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .id(presentation.id)
        .task(id: presentation.id) {
            translationPicker = presentation.translationCode
            dockExpanded = true
            reloadHighlights()
        }
        .sheet(item: $scripturePassageSheet) { item in
            NavigationStack {
                ScrollView {
                    ScripturePassageView(
                        reference: item.reference,
                        translation: item.translation,
                        showHeader: true
                    )
                    .padding(20)
                }
                .navigationTitle("Passage")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { scripturePassageSheet = nil }
                    }
                }
            }
            #if os(macOS)
            .frame(minWidth: 420, minHeight: 460)
            #endif
        }
    }
}
