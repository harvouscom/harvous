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
                                  _ accent: StudyHighlightAccentToken) -> StudyThread?)?
    var onOpenPassageHighlight: ((StudyThread) -> Void)?
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

    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var dockColorScheme

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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            headerRow

            if isExpanded {
                expandedBody
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: isExpanded)
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, isExpanded ? 0 : 10)
        .background(dockChrome)
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(accentTint.opacity(0.55), lineWidth: 1.1)
                .allowsHitTesting(false)
        )
        .overlay(alignment: .bottom) {
            if let tapped = tappedPassageHighlight {
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
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .task(id: "\(reference)|\(translation)") {
            await ScripturePassageCache.shared.prefetch(reference: reference, translation: translation)
        }
        .onAppear { seedPickerStateFromReference(reference) }
        .onChange(of: reference) { _, newValue in
            passageSelectionNormalized = ""
            seedPickerStateFromReference(newValue)
        }
        .onChange(of: translation) { _, _ in passageSelectionNormalized = "" }
    }

    private var headerRow: some View {
        // Title is lineLimit(1) so both sides are the same height — .center aligns icon/text with
        // the color swatch, chevron, and close controls on the right.
        HStack(alignment: .center, spacing: 8) {
            Image(systemName: "book.fill")
                .symbolRenderingMode(.monochrome)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.primary)

            HStack(alignment: .center, spacing: 8) {
                Text(reference)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(ScriptureReference.displayTranslationLabel(translation))
                    .font(.system(size: 10, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                    isExpanded.toggle()
                }
            }

            HStack(spacing: 2) {
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

                toolbarButton(
                    symbol: isExpanded ? "chevron.up" : "chevron.down",
                    help: isExpanded ? "Collapse" : "Expand",
                    prominent: true
                ) {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                        isExpanded.toggle()
                    }
                }

                toolbarButton(symbol: "xmark", help: "Dismiss", prominent: true) {
                    onDismiss()
                }
            }
            .animation(.none, value: isExpanded) // snap toolbar; body below still springs
        }
    }

    /// Matches `ActiveHighlightDock` utility controls (collapse / dismiss); no delete on scripture chrome.
    private func toolbarButton(
        symbol: String,
        help: String,
        prominent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: prominent ? 13 : 12, weight: prominent ? .medium : .regular))
                .contentTransition(.identity) // no symbol morph animation
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

    @ViewBuilder
    private var expandedBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            referenceEditorRow

            // Measure passage content height so the dock is content-fit up to the cap.
            // fixedSize on a ScrollView disables scrolling (it uses ideal/content height), so we
            // measure the content instead and drive an exact frame(height:).
            // Default to the max-height cap until the first measurement fires (no zero-height flash).
            let computedHeight = scriptureScrollContentHeight > 0
                ? min(scriptureScrollContentHeight, expandedContentMaxHeight)
                : expandedContentMaxHeight
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
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
                        onPassageSelectionRectChange: { rect in
                            passageSelectionRect = rect
                        },
                        onPassageHighlightTap: { paintId in
                            guard let thread = scripturePassageHighlights.first(where: { $0.id == paintId }) else { return }
                            tappedPassageHighlight = thread
                        }
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
            .frame(height: computedHeight)
            .onPreferenceChange(DockScrollContentHeightKey.self) { h in
                // Snap height after layout — animating here animates the ScrollView viewport and
                // causes NSScrollView scrollbar flicker when content fits (no scrolling needed).
                scriptureScrollContentHeight = h
            }

        }
        // Named space anchors passage frame reads inside the ScrollView to this VStack's local coords.
        .coordinateSpace(name: "scripture-dock-expanded-body")
        .onPreferenceChange(PassageFrameInBodyKey.self) { passageFrameInBodySpace = $0 }
        // Track body width so the floating overlay can clamp to dock edges.
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { expandedBodyWidth = $0 }
        // Overlays live OUTSIDE the ScrollView so they are never clipped by its bounds.
        .overlay(alignment: .topLeading) { passageSelectionOverlay }
        .animation(.spring(response: 0.36, dampingFraction: 0.82), value: passageHighlightDraft != nil)
    }

    /// Floating selection menu (mirrors `SelectionActionBar` over note body text).
    ///
    /// Lives as an overlay on `expandedBody` (outside the ScrollView) so it is never clipped by the
    /// scroll viewport. Positions are computed in expandedBody-local coordinates:
    /// `passageFrameInBodySpace.origin` + the passage-local selection rect from the text coordinator.
    @ViewBuilder
    private var passageSelectionOverlay: some View {
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
                    onCancel: {
                        passageHighlightDraft = nil
                    },
                    onSave: {
                        guard let snapshot = passageHighlightDraft, !snapshot.excerpt.isEmpty else { return }
                        let newThread = onSavePassageHighlight?(snapshot.excerpt, snapshot.annotation, snapshot.title, snapshot.accent)
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
                        let seedAccent: StudyHighlightAccentToken = (accent != nil && accent != .neutral) ? accent! : .warmAmber
                        passageHighlightDraft = PassageHighlightDraft(
                            excerpt: passageSelectionNormalized,
                            accent: seedAccent
                        )
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

    /// In-flight passage highlight (annotation popover binds to its mutable fields).
    fileprivate struct PassageHighlightDraft: Equatable {
        let excerpt: String
        var annotation: String = ""
        var title: String = ""
        var accent: StudyHighlightAccentToken
    }

    /// Translation + Book / Chapter / Verse / range toggle. Single scrollable row; reference changes apply as pickers change.
    private var referenceEditorRow: some View {
        HStack(alignment: .center, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .center, spacing: 8) {
                    Picker("Translation", selection: $translation) {
                        ForEach(ScriptureReference.availableTranslations, id: \.self) { t in
                            Text(ScriptureReference.displayTranslationLabel(t)).tag(t)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .fixedSize(horizontal: true, vertical: false)
                    .accessibilityLabel("Translation")

                    Picker("Book", selection: $bookIndex) {
                        ForEach(Array(ScriptureCanonicalBooks.titles.enumerated()), id: \.offset) { pair in
                            Text(pair.element).tag(pair.offset)
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .fixedSize(horizontal: true, vertical: false)
                    .frame(maxWidth: 180, alignment: .leading)
                    .accessibilityLabel("Book")

                    HStack(alignment: .center, spacing: 3) {
                        Picker("Chapter", selection: $chapter) {
                            ForEach(1...maxChapter, id: \.self) { c in
                                Text(String(c)).tag(c)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        .frame(minWidth: 52, maxWidth: 64)
                        .accessibilityLabel("Chapter")

                        Text(":")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.tertiary)

                        Picker("Verse", selection: $verseStart) {
                            ForEach(1...maxVerse, id: \.self) { v in
                                Text(String(v)).tag(v)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        .frame(minWidth: 52, maxWidth: 64)
                        .accessibilityLabel("Verse")

                        if useVerseRange {
                            Text("–")
                                .font(.system(size: 13, weight: .regular))
                                .foregroundStyle(.tertiary)

                            Picker("End verse", selection: $verseEnd) {
                                ForEach(verseStart...maxVerse, id: \.self) { v in
                                    Text(String(v)).tag(v)
                                }
                            }
                            .pickerStyle(.menu)
                            .labelsHidden()
                            .frame(minWidth: 52, maxWidth: 64)
                            .accessibilityLabel("End verse")
                        }
                    }

                    Button {
                        withAnimation(.easeInOut(duration: 0.12)) {
                            useVerseRange.toggle()
                            if !useVerseRange { verseEnd = verseStart }
                            clampVersesToCanon()
                        }
                    } label: {
                        Image(systemName: useVerseRange ? "arrow.left.and.right.circle.fill" : "arrow.left.and.right.circle")
                            .font(.system(size: 15, weight: .medium))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(useVerseRange ? "Single verse" : "Verse range")
                    #if os(macOS)
                    .help(useVerseRange ? "Single verse" : "Verse range")
                    #endif
                }
            }
        }
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
            shape.fill(.regularMaterial)
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
}


