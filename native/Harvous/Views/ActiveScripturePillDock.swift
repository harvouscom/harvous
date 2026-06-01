import SwiftUI
import SwiftData

// MARK: - Active scripture pill dock (inline expand-on-tap chrome)

/// Inline chrome for a tapped scripture pill. Mirrors `ActiveHighlightDock`'s shape/animation so tapping
/// a pill reveals the passage and per-pill controls in the same visual dock users already learned for
/// highlights — instead of jumping into a sheet.
///
/// Per-pill accent is stored on the owning `Note.scripturePillAccentsJSON` (per reference). The space
/// theme is intentionally *not* used as a fallback here so pills don't auto-tint: a pill with no picked
/// accent renders in `HarvousColors.{ns|ui}ScripturePillNeutralAccent`.
struct ActiveScripturePillDock: View {
    @Environment(\.harvousDockExpandedContentMaxHeight) private var expandedContentMaxHeight
    @Environment(\.harvousStudyDockInCarousel) private var inStudyDockCarousel
    /// Measured natural height of the scripture passage content — drives exact frame so the dock is
    /// content-fit up to the cap while still allowing real scrolling.
    @State private var scriptureScrollContentHeight: CGFloat = 0

    /// The pill's current reference (e.g. "John 3:16" or "John 3:16-18"). Parent owns this so the dock
    /// and the inline pill stay in sync; we edit it via the Book/Chapter/Verse controls below.
    let reference: String
    @Binding var translation: String

    /// Currently-picked accent token (persisted per reference on the Note). `nil` → neutral default.
    @Binding var accent: StudyHighlightAccentToken?

    @Binding var isExpanded: Bool

    /// Apply a new reference (user picked different book/chapter/verse). Parent should rewrite the pill
    /// attachment in place via `EditorProxy.replaceActiveScripturePill` and migrate the accent key.
    var onReferenceChanged: ((String) -> Void)?
    /// Passage highlight save: invoked when the user finishes annotating a fresh selection in the floating popover.
    /// Excerpt is normalized; annotation/title come from the popover; accent is the picker choice.
    var onSavePassageHighlight: ((_ excerpt: String,
                                  _ annotation: String,
                                  _ title: String,
                                  _ accent: StudyHighlightAccentToken) -> StudyThread?)? = nil
    var onOpenPassageHighlight: ((StudyThread) -> Void)? = nil
    /// Repaint trigger after the inline highlight dock's accent swatch persists a new color.
    /// Parent owns the refresh path that re-fetches passage highlights so the underline tint updates.
    var onAccentPersistedForHighlight: (() -> Void)?
    /// Delete an existing passage highlight (called from the inline highlight dock's trash button).
    var onRemovePassageHighlight: ((StudyThread) -> Void)?
    /// Open a standalone passage sheet from the inline highlight dock's "Read passage" action.
    var onReadPassageFromHighlight: ((String, String) -> Void)?
    /// Saved highlights for this reference + translation (library-wide); paints the passage and drives the list below.
    var passageHighlightPaints: [ScripturePassageHighlightPaint] = []
    var scripturePassageHighlights: [StudyThread] = []
    /// Parent note for labeling rows that belong to the open note.
    var parentNoteId: UUID?
    /// Space accent theme — passed through to `ActiveHighlightDock` when an inline highlight is shown.
    var scriptureTheme: HarvousColors.ThemeVariant = .blue
    let onDismiss: () -> Void

    /// When `false`, hide book/chapter/verse pickers — used from the Highlights list standalone dock where there is no note pill to rewrite.
    var allowsStructuralReferenceEdit: Bool = true
    /// When `false`, hide the header accent swatch (no per-note accent map in standalone mode).
    var showsPillAccentControls: Bool = true
    /// One-shot focus: selects this passage underline thread inside the dock when `scripturePassageHighlights` first contains it.
    var initialFocusedPassageHighlightThreadId: UUID?
    /// When `true`, stretch the dock and passage `ScrollView` to use all height offered by the parent (standalone Highlights dock).
    var fillsAvailableHeight: Bool = false
    /// When `false`, omit collapse/expand (chevron + title tap); passage stays expanded — standalone scripture-from-highlight chrome.
    var allowsCollapseExpand: Bool = true
    /// Standalone Highlights dock only: notifies when the tapped passage-underline (`StudyThread`) changes so the list selection can mirror it.
    var onStandaloneFocusedPassageHighlightChanged: ((UUID?) -> Void)? = nil

    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var dockColorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    /// Study (default) vs read-only translation compare — compare never mutates the inline pill.
    @State private var dockMode: ScriptureDockMode = .study
    @State private var compareTranslation: String = ScriptureReference.defaultTranslation

    // MARK: Local picker state (seeded from `reference`; commits immediately when pickers change)

    @State private var bookIndex: Int = 0
    @State private var chapter: Int = 1
    @State private var verseStart: Int = 1
    @State private var verseEnd: Int = 1
    @State private var useVerseRange: Bool = false
    /// Bumped on every external `reference` change so `.onChange(of:)` re-seeds local state (avoids
    /// `.task`/`.onAppear` missing mid-life reference swaps).
    @State private var lastSyncedReference: String = ""
    @State private var passageSelectionNormalized: String = ""
    /// Bounding rect of the current selection in `passageHostSpace` coordinates (set when the user drags
    /// inside the embedded passage text view, cleared on collapse/blur).
    @State private var passageSelectionRect: CGRect?
    /// In-flight highlight draft: set when the user taps the floating menu's highlighter; the popover binds
    /// to its mutable fields. `nil` means the floating menu (not the popover) is on screen.
    @State private var passageHighlightDraft: PassageHighlightDraft?
    /// In-flight speculative AI question generation, started when the user first selects passage text
    /// so the result is ready by the time they save the highlight and the dock opens.
    @State private var speculativeGenTask: Task<Void, Never>? = nil
    @State private var speculativeGenResult: [String]? = nil
    /// Thread tapped by clicking an underlined excerpt. Shows an inline `ActiveHighlightDock`
    /// within the scripture dock so the user can edit / change accent / remove the highlight
    /// without dismissing the scripture dock or jumping to another note.
    @State private var tappedPassageHighlight: StudyThread?
    /// Expand/collapse state for the inline `ActiveHighlightDock`. Default expanded so the user
    /// sees the editable fields immediately when they tap a highlight.
    @State private var tappedPassageHighlightExpanded: Bool = true
    /// Shared morph id between the action bar and popover capsule chrome (matchedGeometryEffect).
    @Namespace private var passageSelectionMorph
    private static let passageSelectionMorphID = "harvous-scripture-dock-selection-capsule"
    /// Frame of the ScripturePassageView in the named `expandedBodySpace` coordinate space.
    /// Used to translate passage-local selection rects into expandedBody-local positions for the overlay.
    @State private var passageFrameInBodySpace: CGRect = .zero
    /// Width of the expandedBody VStack — measured on first layout and on any resize.
    /// Used to clamp the floating action bar / popover so they never clip outside the dock.
    @State private var expandedBodyWidth: CGFloat = 0
    @State private var appliedInitialFocusedPassageHighlightId: UUID?

    private var maxChapter: Int { ScriptureCanon.chapterCount(bookIndex: bookIndex) }
    private var maxVerse: Int { ScriptureCanon.verseCount(bookIndex: bookIndex, chapter: chapter) }

    /// Draft reference built from current picker state.
    private var draftReference: String {
        let end: Int? = useVerseRange && verseEnd != verseStart ? verseEnd : nil
        return ScriptureReferenceParser.format(
            bookIndex: bookIndex,
            chapter: chapter,
            verseStart: verseStart,
            verseEnd: end
        )
    }

    private var draftParsedFields: ParsedScriptureFields {
        let end: Int? = useVerseRange && verseEnd != verseStart ? verseEnd : nil
        return ParsedScriptureFields(
            bookIndex: bookIndex,
            chapter: chapter,
            verseStart: verseStart,
            verseEnd: end
        )
    }

    /// Structural compare so aliases like "Jn 3:16" vs canonical "John 3:16" don't count as a pending edit after seeding.
    private var hasPendingStructuralReferenceEdit: Bool {
        guard let committed = ScriptureReferenceParser.parse(reference) else {
            return draftReference != reference
        }
        return draftParsedFields != committed
    }

    /// SwiftUI tint from the selected accent, or a neutral dock color when none is set.
    private var accentTint: Color {
        let isDark = dockColorScheme == .dark
        #if os(macOS)
        if let accent {
            return Color(nsColor: accent.resolvedAccentNSColor(kind: .scriptureLink, isDark: isDark))
        }
        return Color(nsColor: HarvousColors.nsScripturePillNeutralAccent)
        #elseif os(iOS)
        if let accent {
            return Color(uiColor: accent.resolvedAccentUIColor(kind: .scriptureLink, isDark: isDark))
        }
        return Color(uiColor: HarvousColors.uiScripturePillNeutralAccent)
        #else
        return .gray
        #endif
    }

    /// When collapse is disabled, passage chrome is always shown expanded (standalone host).
    private var passageChromeExpanded: Bool {
        allowsCollapseExpand ? isExpanded : true
    }

    private var compareNoteBlockLabel: String {
        showsPillAccentControls ? "Your note" : "Passage"
    }

    private var useSideBySideCompare: Bool {
        guard expandedBodyWidth > 600 else { return false }
        #if os(macOS)
        return true
        #else
        return horizontalSizeClass == .regular
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            headerRow

            if passageChromeExpanded {
                expandedBody
                    .transition(.opacity)
            }
        }
        .frame(
            maxWidth: inStudyDockCarousel || (fillsAvailableHeight && passageChromeExpanded) ? .infinity : nil,
            maxHeight: fillsAvailableHeight && passageChromeExpanded ? .infinity : nil,
            alignment: .topLeading
        )
        .padding(.horizontal, 12)
        .padding(.top, 10)
        // When the passage is expanded the scroll fills to the dock's bottom edge —
        // no padding below the scroll viewport. Collapsed: restore the usual 10pt gap.
        .padding(.bottom, passageChromeExpanded ? 0 : 10)
        .background(dockChrome)
        // Clip scroll content to the dock's rounded corners so text doesn't overflow visually.
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .studyDockShellBorderOverlay()
        .overlay(alignment: .bottom) {
            if dockMode == .study, let tapped = tappedPassageHighlight {
                ActiveHighlightDock(
                    thread: tapped,
                    isExpanded: $tappedPassageHighlightExpanded,
                    scriptureTheme: scriptureTheme,
                    onDismiss: { tappedPassageHighlight = nil },
                    onAccentPersisted: { onAccentPersistedForHighlight?() },
                    onJumpToLinkedNote: nil,
                    onReadPassage: nil,
                    onRemoveHighlight: {
                        let removed = tapped
                        tappedPassageHighlight = nil
                        onRemovePassageHighlight?(removed)
                    },
                    highlightOrdinal: nil,
                    forceHighlighterIcon: true,
                    hideExcerptDisplay: true
                )
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .move(edge: .bottom)),
                    removal: .identity
                ))
            }
        }
        .animation(.spring(response: 0.28, dampingFraction: 0.84), value: tappedPassageHighlight?.id)
        .shadow(color: .black.opacity(0.10), radius: 12, y: 4)
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        .padding(.horizontal, inStudyDockCarousel ? 0 : 20)
        .padding(.top, inStudyDockCarousel ? 0 : 6)
        .padding(.bottom, inStudyDockCarousel ? 0 : 10)
        .onChange(of: passageChromeExpanded) { _, expanded in
            if !expanded { scriptureScrollContentHeight = 0 }
        }
        .task(id: "\(reference)|\(translation)") {
            await ScripturePassageCache.shared.prefetch(reference: reference, translation: translation)
        }
        .onAppear {
            seedPickerStateFromReference(reference)
            seedCompareTranslationFromNote()
            syncInitialFocusedPassageHighlightIfNeeded(force: false)
        }
        .onChange(of: scripturePassageHighlights.map(\.id)) { _, _ in
            syncInitialFocusedPassageHighlightIfNeeded(force: false)
        }
        .onChange(of: initialFocusedPassageHighlightThreadId) { _, _ in
            appliedInitialFocusedPassageHighlightId = nil
            syncInitialFocusedPassageHighlightIfNeeded(force: false)
        }
        .onChange(of: reference) { _, newValue in
            passageSelectionNormalized = ""
            appliedInitialFocusedPassageHighlightId = nil
            dockMode = .study
            seedCompareTranslationFromNote()
            seedPickerStateFromReference(newValue)
            syncInitialFocusedPassageHighlightIfNeeded(force: false)
        }
        .onChange(of: translation) { _, _ in
            passageSelectionNormalized = ""
            syncInitialFocusedPassageHighlightIfNeeded(force: false)
            if dockMode == .compare {
                seedCompareTranslationFromNote()
            }
        }
        .onChange(of: passageSelectionNormalized) { _, new in
            // Start speculative generation as soon as text is selected so the result is ready
            // when the user finishes filling the annotation popover and taps Save.
            speculativeGenTask?.cancel()
            speculativeGenResult = nil
            let snippet = new.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !snippet.isEmpty else { return }
            let ref = reference
            speculativeGenTask = Task {
                if #available(macOS 26.0, iOS 26.0, *) {
                    do {
                        // Structured child task so cancelling `speculativeGenTask` from `.onDisappear`
                        // propagates into the detached generation — the previous shape spawned a detached
                        // task that outlived its parent and could write to torn-down @State.
                        try Task.checkCancellation()
                        let questions = try await Task.detached(priority: .userInitiated) {
                            try Task.checkCancellation()
                            return try await ScriptureReflectionGenerator.generate(excerpt: snippet, reference: ref)
                        }.value
                        guard !Task.isCancelled else { return }
                        speculativeGenResult = questions
                    } catch {}
                }
            }
        }
        .onDisappear {
            // Cancel any in-flight speculative reflection generation so it doesn't write to @State
            // after the dock dismisses (crash signal on rapid open/close).
            speculativeGenTask?.cancel()
            speculativeGenTask = nil
        }
        .onChange(of: tappedPassageHighlight?.id) { _, newId in
            onStandaloneFocusedPassageHighlightChanged?(newId)
        }
        #if os(iOS)
        .sheet(item: $passageHighlightDraft) { _ in
            iosPassageHighlightAuthoringSheet
        }
        #endif
    }

    private var headerRow: some View {
        // Title is lineLimit(1) so both sides are the same height — .center aligns icon/text with
        // optional accent controls, collapse chevron (when enabled), and close on the right.
        HStack(alignment: .center, spacing: 8) {
            HarvousFAGlyph(assetName: dockMode == .compare ? "Harvous.ArrowsLeftRight" : "Harvous.BookOpen", edgePt: 13)
                .foregroundStyle(.primary)

            HStack(alignment: .center, spacing: 8) {
                Text(reference)
                    .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .layoutPriority(0)
                if dockMode == .study {
                    Text(ScriptureReference.displayTranslationLabel(translation))
                        .font(HarvousFonts.font(size: 10, weight: .semibold, design: .default))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .layoutPriority(1)
                } else {
                    Text("Compare")
                        .font(HarvousFonts.font(size: 10, weight: .semibold, design: .default))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .layoutPriority(0)
            .contentShape(Rectangle())
            .onTapGesture {
                guard allowsCollapseExpand, dockMode == .study else { return }
                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                    isExpanded.toggle()
                }
            }

            HStack(spacing: 2) {
                if dockMode == .study {
                    toolbarButton(
                        assetName: "Harvous.ArrowsLeftRight",
                        help: "Compare translations",
                        prominent: false
                    ) {
                        clearPassageSelectionState()
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                            seedCompareTranslationFromNote()
                            dockMode = .compare
                            if allowsCollapseExpand { isExpanded = true }
                        }
                    }

                    toolbarDivider
                } else {
                    toolbarButton(
                        assetName: "Harvous.BookOpen",
                        help: "Back to study",
                        prominent: true
                    ) {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                            dockMode = .study
                        }
                    }

                    toolbarDivider
                }

                if showsPillAccentControls, dockMode == .study {
                    DockAccentSwatchButton(
                        selection: Binding(
                            get: { accent ?? .neutral },
                            set: { newValue in
                                accent = (newValue == .neutral) ? nil : newValue
                            }
                        ),
                        paletteTokens: StudyHighlightAccentToken.pickerChoicesWithNeutral,
                        entryKind: .scriptureLink
                    )

                    toolbarDivider
                }

                if allowsCollapseExpand, dockMode == .study {
                    toolbarButton(
                        assetName: isExpanded ? "Harvous.ChevronDown" : "Harvous.ChevronUp",
                        help: isExpanded ? "Collapse" : "Expand",
                        prominent: true
                    ) {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                            isExpanded.toggle()
                        }
                    }
                }

                toolbarButton(assetName: "Harvous.Xmark", help: "Dismiss", prominent: true) {
                    onDismiss()
                }
            }
            .fixedSize(horizontal: true, vertical: false)
            .layoutPriority(1)
            .animation(.none, value: isExpanded) // snap toolbar; body below still springs
        }
    }

    /// Matches `ActiveHighlightDock` utility controls (collapse / dismiss); no delete on scripture chrome.
    private func toolbarButton(
        assetName: String,
        help: String,
        prominent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: prominent ? 13 : 12)
                .contentTransition(.identity)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(prominent ? AnyShapeStyle(.primary) : AnyShapeStyle(.secondary))
        #if os(macOS)
        .help(help)
        #endif
    }

    private var toolbarDivider: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.12))
            .frame(width: 0.5, height: 16)
            .padding(.horizontal, 2)
    }

    /// Inner stack inside the passage `ScrollView` — shared by content-fit and full-height layouts.
    private var passageSelectionRectHandler: ((CGRect?) -> Void)? {
        #if os(macOS)
        return { rect in passageSelectionRect = rect }
        #else
        return nil
        #endif
    }

    private var passageHighlightFromEditMenuHandler: ((String) -> Void)? {
        #if os(iOS)
        guard onSavePassageHighlight != nil else { return nil }
        return { excerpt in beginPassageHighlightDraft(excerpt: excerpt) }
        #else
        return nil
        #endif
    }

    private var scripturePassageScrollContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            Spacer(minLength: 0).frame(height: 8).allowsHitTesting(false) // breathing room below reference bar
            ScripturePassageView(
                reference: reference,
                translation: translation,
                showHeader: false,
                useReadingTypography: true,
                // Surface the translation copyright + website link inside the dock body —
                // the only place the user can confirm the source now that the bottom
                // "Save highlight" button is gone.
                showAttribution: true,
                passageHighlightPaints: passageHighlightPaints,
                onPassageSelectionChange: { newValue in
                    passageSelectionNormalized = newValue
                    if newValue.isEmpty {
                        passageSelectionRect = nil
                    }
                },
                onPassageSelectionRectChange: passageSelectionRectHandler,
                onPassageHighlightTap: { paintId in
                    guard let thread = scripturePassageHighlights.first(where: { $0.id == paintId }) else { return }
                    tappedPassageHighlight = thread
                },
                passageHighlightFocusedThreadId: tappedPassageHighlight?.id,
                onPassageHighlightFromEditMenu: passageHighlightFromEditMenuHandler
            )
            .background(GeometryReader { geo in
                // Read the passage view's frame in the named body space so the overlay (placed
                // outside the ScrollView) can translate passage-local selection rects correctly.
                Color.clear.preference(
                    key: PassageFrameInBodyKey.self,
                    value: geo.frame(in: .named("scripture-dock-expanded-body"))
                )
            })
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(.bottom, 10)
        .background(
            GeometryReader { geo in
                Color.clear.preference(key: DockScrollContentHeightKey.self, value: geo.size.height)
            }
        )
    }

    @ViewBuilder
    private var expandedBody: some View {
        if dockMode == .compare {
            compareExpandedBody
        } else if fillsAvailableHeight {
            expandedBodyPassageFillsOfferedHeight
        } else {
            expandedBodyContentFitHeight
        }
    }

    private var compareExpandedBody: some View {
        ScriptureDockCompareSection(
            reference: reference,
            noteTranslation: translation,
            compareTranslation: $compareTranslation,
            noteBlockLabel: compareNoteBlockLabel,
            useSideBySide: useSideBySideCompare,
            fillsAvailableHeight: fillsAvailableHeight
        )
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            Task { @MainActor in expandedBodyWidth = width }
        }
    }

    private var expandedBodyContentFitHeight: some View {
        VStack(alignment: .leading, spacing: 0) {
            if allowsStructuralReferenceEdit {
                referenceEditorRow
            }

            // Measure passage content height so the dock is content-fit up to the cap.
            // fixedSize on a ScrollView disables scrolling (it uses ideal/content height), so we
            // measure the content instead and drive an exact frame(height:).
            // Default to the max-height cap until the first measurement fires (no zero-height flash).
            let computedHeight = HarvousDockExpandedContentLayout.clampedScrollFrameHeight(
                measuredContentHeight: scriptureScrollContentHeight,
                maxHeight: expandedContentMaxHeight
            )
            ScrollView {
                VStack(spacing: 0) {
                    scripturePassageScrollContent

                    Spacer(minLength: 0)
                        .allowsHitTesting(false)
                }
                .frame(maxWidth: .infinity, minHeight: max(computedHeight - 1, 1), alignment: .topLeading)
            }
            .frame(height: computedHeight)
            .animation(nil, value: computedHeight)
            .onPreferenceChange(DockScrollContentHeightKey.self) { h in
                Task { @MainActor in
                    scriptureScrollContentHeight = h
                }
            }

        }
        .coordinateSpace(name: "scripture-dock-expanded-body")
        .onPreferenceChange(PassageFrameInBodyKey.self) { rect in
            Task { @MainActor in
                passageFrameInBodySpace = rect
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            Task { @MainActor in expandedBodyWidth = width }
        }
        #if os(macOS)
        .overlay(alignment: .topLeading) {
            if dockMode == .study {
                passageSelectionOverlay
            }
        }
        .animation(.spring(response: 0.36, dampingFraction: 0.82), value: passageHighlightDraft != nil)
        #endif
    }

    /// Offered mainly from standalone Highlights-column host: passage scroll consumes all vertical space below the header row(s).
    private var expandedBodyPassageFillsOfferedHeight: some View {
        VStack(alignment: .leading, spacing: 0) {
            if allowsStructuralReferenceEdit {
                referenceEditorRow
            }

            GeometryReader { scrollViewport in
                let h = max(scrollViewport.size.height, 120)
                ScrollView {
                    VStack(spacing: 0) {
                        scripturePassageScrollContent

                        Spacer(minLength: 0)
                            .allowsHitTesting(false)
                    }
                    .frame(maxWidth: .infinity, minHeight: max(h - 1, 1), alignment: .topLeading)
                }
                .frame(height: h)
                .animation(nil, value: h)
                .onPreferenceChange(DockScrollContentHeightKey.self) { height in
                    Task { @MainActor in
                        scriptureScrollContentHeight = height
                    }
                }
            }
            .frame(maxHeight: .infinity)

        }
        .frame(maxHeight: .infinity)
        .coordinateSpace(name: "scripture-dock-expanded-body")
        .onPreferenceChange(PassageFrameInBodyKey.self) { rect in
            Task { @MainActor in
                passageFrameInBodySpace = rect
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            Task { @MainActor in expandedBodyWidth = width }
        }
        #if os(macOS)
        .overlay(alignment: .topLeading) {
            if dockMode == .study {
                passageSelectionOverlay
            }
        }
        .animation(.spring(response: 0.36, dampingFraction: 0.82), value: passageHighlightDraft != nil)
        #endif
    }

    /// Floating selection menu (mirrors `SelectionActionBar` over note body text). macOS only — iOS uses
    /// the system text edit menu + `IOSHighlightAuthoringSheet`.
    ///
    /// Lives as an overlay on `expandedBody` (outside the ScrollView) so it is never clipped by the
    /// scroll viewport. Positions are computed in expandedBody-local coordinates:
    /// `passageFrameInBodySpace.origin` + the passage-local selection rect from the text coordinator.
    @ViewBuilder
    private var passageSelectionOverlay: some View {
        #if os(macOS)
        if let selRect = passageSelectionRect, onSavePassageHighlight != nil {
            // Convert passage-local rect → expandedBody-local rect.
            let bodyRect = selRect.offsetBy(
                dx: passageFrameInBodySpace.minX,
                dy: passageFrameInBodySpace.minY
            )
            if let draft = passageHighlightDraft {
                HighlightAnnotationPopover(
                    excerptPreview: draft.excerpt,
                    annotationText: Binding(
                        get: { passageHighlightDraft?.annotation ?? "" },
                        set: { passageHighlightDraft?.annotation = $0 }
                    ),
                    titleText: Binding(
                        get: { passageHighlightDraft?.title ?? "" },
                        set: { passageHighlightDraft?.title = $0 }
                    ),
                    selectedAccent: Binding(
                        get: { passageHighlightDraft?.accent ?? .warmAmber },
                        set: { passageHighlightDraft?.accent = $0 }
                    ),
                    morphNamespace: passageSelectionMorph,
                    morphID: Self.passageSelectionMorphID,
                    onCancel: cancelPassageHighlightDraft,
                    onSave: savePassageHighlightFromDraft
                )
                .offset(passageSelectionPopoverOffset(for: bodyRect))
                .transition(.opacity)
                .zIndex(2)
                .id(draft.excerpt)
            } else if !passageSelectionNormalized.isEmpty {
                SelectionActionBar(
                    morphNamespace: passageSelectionMorph,
                    morphID: Self.passageSelectionMorphID,
                    onHighlight: {
                        beginPassageHighlightDraft(excerpt: passageSelectionNormalized)
                    },
                    onNewStandaloneNote: nil
                )
                .offset(passageSelectionBarOffset(for: bodyRect))
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.9, anchor: .top)),
                    removal: .opacity
                ))
                .zIndex(1)
            }
        }
        #endif
    }

    #if os(iOS)
    @ViewBuilder
    private var iosPassageHighlightAuthoringSheet: some View {
        if passageHighlightDraft != nil {
            IOSHighlightAuthoringSheet(
                excerptPreview: passageHighlightDraft?.excerpt ?? "",
                annotationText: Binding(
                    get: { passageHighlightDraft?.annotation ?? "" },
                    set: { passageHighlightDraft?.annotation = $0 }
                ),
                titleText: Binding(
                    get: { passageHighlightDraft?.title ?? "" },
                    set: { passageHighlightDraft?.title = $0 }
                ),
                selectedAccent: Binding(
                    get: { passageHighlightDraft?.accent ?? .warmAmber },
                    set: { passageHighlightDraft?.accent = $0 }
                ),
                onCancel: cancelPassageHighlightDraft,
                onSave: savePassageHighlightFromDraft
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
    #endif

    private func beginPassageHighlightDraft(excerpt: String) {
        let seedAccent: StudyHighlightAccentToken = (accent != nil && accent != .neutral) ? accent! : .warmAmber
        passageHighlightDraft = PassageHighlightDraft(excerpt: excerpt, accent: seedAccent)
    }

    private func cancelPassageHighlightDraft() {
        passageHighlightDraft = nil
    }

    private func savePassageHighlightFromDraft() {
        guard let snapshot = passageHighlightDraft, !snapshot.excerpt.isEmpty else { return }
        let newThread = onSavePassageHighlight?(snapshot.excerpt, snapshot.annotation, snapshot.title, snapshot.accent)
        // Apply speculative AI questions immediately if generation finished during annotation.
        // Setting aiSuggestedQuestionsGenerated = true before the dock renders prevents
        // the inline ActiveHighlightDock's .task from double-generating.
        if let thread = newThread,
           let generated = speculativeGenResult,
           !thread.aiSuggestedQuestionsGenerated {
            let defaults = StudyPromptSuggester.questions(forScriptureExcerpt: snapshot.excerpt, reference: reference)
            thread.suggestedQuestions = generated + defaults
            thread.aiSuggestedQuestionsGenerated = true
            try? modelContext.saveWithLogging()
        }
        speculativeGenTask = nil
        speculativeGenResult = nil
        passageHighlightDraft = nil
        // Clear selection state so the next drag-select starts fresh — the
        // underlying text view will re-emit `onPassageSelectionChange` for any new selection.
        passageSelectionNormalized = ""
        passageSelectionRect = nil
        // Open the inline dock for the newly created highlight.
        if let thread = newThread {
            tappedPassageHighlightExpanded = true
            tappedPassageHighlight = thread
        }
    }

    /// Center the action bar above the selection rect (in expandedBody coords), with an 8pt gap.
    private func passageSelectionBarOffset(for rect: CGRect) -> CGSize {
        // Single-button bar: 36pt icon + 12pt horizontal padding ≈ 48pt.
        let barWidth: CGFloat = 48
        let barHeight: CGFloat = 36
        let ideal = rect.midX - barWidth / 2
        // Clamp horizontally so the bar never clips outside the dock body.
        let maxX = expandedBodyWidth > 0 ? expandedBodyWidth - barWidth : ideal
        let x = min(max(ideal, 0), maxX)
        let y = max(rect.minY - barHeight - 8, 2)
        return CGSize(width: x, height: y)
    }

    /// Anchor the popover centered on the selection (in expandedBody coords), above it.
    /// Uses the popover's built-in design width (360pt — see `HighlightAnnotationPopover`).
    private func passageSelectionPopoverOffset(for rect: CGRect) -> CGSize {
        let popoverWidth: CGFloat = 360
        let ideal = rect.midX - popoverWidth / 2
        // Clamp horizontally so the popover never clips outside the dock body.
        let maxX = expandedBodyWidth > 0 ? expandedBodyWidth - popoverWidth : ideal
        let x = min(max(ideal, 0), maxX)
        let y = max(rect.minY - 120, 2)
        return CGSize(width: x, height: y)
    }

    /// In-flight passage highlight (annotation popover / iOS sheet binds to its mutable fields).
    fileprivate struct PassageHighlightDraft: Equatable, Identifiable {
        let id = UUID()
        let excerpt: String
        var annotation: String = ""
        var title: String = ""
        var accent: StudyHighlightAccentToken
    }

    /// Compact insets; label matches `NoteConnectionsBar` connect pills (`HarvousTypography.caption`).
    private enum ScriptureDockReferenceBarMetrics {
        static let controlHeight: CGFloat = 30
        static let rowHSpacing: CGFloat = 6
        static let horizontalPadding: CGFloat = 7
        static let verticalPadding: CGFloat = 3
        static let chromeCornerRadius: CGFloat = 10
        /// Align with `Harvous.ArrowRightArrowLeft` / trail glyphs in `NoteConnectionsBar` (~11pt).
        static let rangeGlyphPt: CGFloat = 11
        static let bookMaxWidth: CGFloat = 198
        static let colonFrameWidth: CGFloat = 6
        static let dashFrameWidth: CGFloat = 8
        /// Same as connect placeholder + trail pill labels in the note action bar.
        static let labelFont = HarvousTypography.caption
    }

    /// Translation + Book / Chapter / Verse / range toggle — compact bar (see `ScriptureDockReferenceBarMetrics`).
    private var referenceEditorRow: some View {
        HStack(alignment: .center, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .center, spacing: ScriptureDockReferenceBarMetrics.rowHSpacing) {
                    ScriptureReferenceMenuPill(
                        accessibilityLabel: "Translation",
                        selection: $translation,
                        options: ScriptureReference.availableTranslations.map {
                            (value: $0, label: ScriptureReference.displayTranslationLabel($0))
                        },
                        displayText: { ScriptureReference.displayTranslationLabel($0) }
                    )

                    ScriptureReferenceMenuPill(
                        accessibilityLabel: "Book",
                        selection: $bookIndex,
                        options: Array(ScriptureCanonicalBooks.titles.enumerated()).map {
                            (value: $0.offset, label: $0.element)
                        },
                        displayText: { ScriptureCanonicalBooks.titles[$0] },
                        maxWidth: ScriptureDockReferenceBarMetrics.bookMaxWidth
                    )

                    ScriptureReferenceNumberCluster {
                        ScriptureReferenceMenuPill(
                            accessibilityLabel: "Chapter",
                            selection: $chapter,
                            options: (1...maxChapter).map { (value: $0, label: String($0)) },
                            displayText: { String($0) },
                            inCluster: true,
                            monospaceDigits: true
                        )

                        Text(":")
                            .font(ScriptureDockReferenceBarMetrics.labelFont)
                            .foregroundStyle(.tertiary.opacity(0.85))
                            .frame(width: ScriptureDockReferenceBarMetrics.colonFrameWidth, alignment: .center)

                        ScriptureReferenceMenuPill(
                            accessibilityLabel: "Verse",
                            selection: $verseStart,
                            options: (1...maxVerse).map { (value: $0, label: String($0)) },
                            displayText: { String($0) },
                            inCluster: true,
                            monospaceDigits: true
                        )

                        if useVerseRange {
                            Text("–")
                                .font(ScriptureDockReferenceBarMetrics.labelFont)
                                .foregroundStyle(.tertiary.opacity(0.85))
                                .frame(width: ScriptureDockReferenceBarMetrics.dashFrameWidth, alignment: .center)

                            ScriptureReferenceMenuPill(
                                accessibilityLabel: "End verse",
                                selection: $verseEnd,
                                options: (verseStart...maxVerse).map { (value: $0, label: String($0)) },
                                displayText: { String($0) },
                                inCluster: true,
                                monospaceDigits: true
                            )
                        }
                    }

                    Button {
                        withAnimation(.easeInOut(duration: 0.12)) {
                            useVerseRange.toggle()
                            if !useVerseRange { verseEnd = verseStart }
                            clampVersesToCanon()
                        }
                    } label: {
                        HarvousFAGlyph(
                            assetName: "Harvous.ArrowsLeftRight",
                            edgePt: ScriptureDockReferenceBarMetrics.rangeGlyphPt
                        )
                        .frame(
                            width: ScriptureDockReferenceBarMetrics.controlHeight,
                            height: ScriptureDockReferenceBarMetrics.controlHeight
                        )
                        .contentShape(Circle())
                    }
                    .buttonStyle(ScriptureReferenceRangeToggleStyle(isActive: useVerseRange))
                    .accessibilityLabel(useVerseRange ? "Single verse" : "Verse range")
                    #if os(macOS)
                    .help(useVerseRange ? "Single verse" : "Verse range")
                    #endif
                }
                .padding(.horizontal, ScriptureDockReferenceBarMetrics.horizontalPadding)
                .padding(.vertical, ScriptureDockReferenceBarMetrics.verticalPadding)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .tint(Color.primary)
        .background(
            RoundedRectangle(cornerRadius: ScriptureDockReferenceBarMetrics.chromeCornerRadius, style: .continuous)
                .fill(Color.primary.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: ScriptureDockReferenceBarMetrics.chromeCornerRadius, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
        )
        .onChange(of: bookIndex) { _, _ in
            clampSelectionToCanon()
            commitDraftReferenceIfNeeded()
        }
        .onChange(of: chapter) { _, _ in
            clampVersesToCanon()
            commitDraftReferenceIfNeeded()
        }
        .onChange(of: verseStart) { _, newStart in
            if useVerseRange, verseEnd < newStart { verseEnd = newStart }
            commitDraftReferenceIfNeeded()
        }
        .onChange(of: verseEnd) { _, _ in commitDraftReferenceIfNeeded() }
        .onChange(of: useVerseRange) { _, _ in commitDraftReferenceIfNeeded() }
    }

    private func commitDraftReferenceIfNeeded() {
        guard hasPendingStructuralReferenceEdit else { return }
        let ref = draftReference
        onReferenceChanged?(ref)
    }

    private var dockChrome: some View {
        ZStack {
            let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
            // Stable base so the system material doesn't go dark gray when the window loses focus.
            shape.fill(.background)
            if #available(macOS 26.0, iOS 26.0, *) {
                shape
                    .fill(.clear)
                    .glassEffect(in: shape)
            } else {
                shape.fill(.ultraThinMaterial)
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Picker state helpers

    private func seedPickerStateFromReference(_ newReference: String) {
        guard lastSyncedReference != newReference else { return }
        lastSyncedReference = newReference
        guard let p = ScriptureReferenceParser.parse(newReference) else { return }
        bookIndex = p.bookIndex
        chapter = p.chapter
        verseStart = p.verseStart
        if let end = p.verseEnd, end != p.verseStart {
            useVerseRange = true
            verseEnd = end
        } else {
            useVerseRange = false
            verseEnd = p.verseStart
        }
        clampSelectionToCanon()
    }

    private func clampSelectionToCanon() {
        chapter = ScriptureCanon.clampChapter(chapter, bookIndex: bookIndex)
        clampVersesToCanon()
    }

    private func clampVersesToCanon() {
        let cap = ScriptureCanon.verseCount(bookIndex: bookIndex, chapter: chapter)
        verseStart = ScriptureCanon.clampVerse(verseStart, bookIndex: bookIndex, chapter: chapter)
        verseEnd = ScriptureCanon.clampVerse(verseEnd, bookIndex: bookIndex, chapter: chapter)
        if verseEnd < verseStart { verseEnd = verseStart }
        if verseEnd > cap { verseEnd = cap }
        if verseStart > cap { verseStart = cap }
    }

    private func syncInitialFocusedPassageHighlightIfNeeded(force: Bool) {
        guard let want = initialFocusedPassageHighlightThreadId else { return }
        if appliedInitialFocusedPassageHighlightId == want, !force { return }
        guard let hit = scripturePassageHighlights.first(where: { $0.id == want }) else { return }
        tappedPassageHighlight = hit
        tappedPassageHighlightExpanded = true
        appliedInitialFocusedPassageHighlightId = want
    }

    private func seedCompareTranslationFromNote() {
        compareTranslation = HarvousStudyDefaults.resolvedCompareTranslation(fallback: translation)
    }

    private func clearPassageSelectionState() {
        passageSelectionNormalized = ""
        passageSelectionRect = nil
        passageHighlightDraft = nil
        tappedPassageHighlight = nil
        speculativeGenTask?.cancel()
        speculativeGenTask = nil
        speculativeGenResult = nil
    }
}


