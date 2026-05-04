import SwiftUI

// MARK: - Active scripture pill dock (inline expand-on-tap chrome)

/// Inline chrome for a tapped scripture pill. Mirrors `ActiveHighlightDock`'s shape/animation so tapping
/// a pill reveals the passage and per-pill controls in the same visual dock users already learned for
/// highlights — instead of jumping into a sheet.
///
/// Per-pill accent is stored on the owning `Note.scripturePillAccentsJSON` (per reference). The space
/// theme is intentionally *not* used as a fallback here so pills don't auto-tint: a pill with no picked
/// accent renders in `HarvousColors.{ns|ui}ScripturePillNeutralAccent`.
struct ActiveScripturePillDock: View {
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
    let onDismiss: () -> Void

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
                    .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .topLeading)))
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: isExpanded)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(dockChrome)
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(accentTint.opacity(0.55), lineWidth: 1.1)
                .allowsHitTesting(false)
        )
        .shadow(color: .black.opacity(0.10), radius: 12, y: 4)
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .task(id: "\(reference)|\(translation)") {
            await ScripturePassageCache.shared.prefetch(reference: reference, translation: translation)
        }
        .onAppear { seedPickerStateFromReference(reference) }
        .onChange(of: reference) { _, newValue in seedPickerStateFromReference(newValue) }
    }

    private var headerRow: some View {
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

            // Inline passage text — follows committed `reference`/`translation` (updates when pickers commit).
            ScripturePassageView(
                reference: reference,
                translation: translation,
                showHeader: false,
                useReadingTypography: true
            )
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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
}
