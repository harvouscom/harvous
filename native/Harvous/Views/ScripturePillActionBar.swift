import SwiftUI

/// Bottom chrome for the focused scripture pill: toolbar (pickers, Apply, Done) and an always-visible passage preview row (iOS + macOS).
struct ScripturePillActionBar: View {
    /// Matches `NoteToolbar` typography (`HarvousTypography.actionBar*` at 15pt).
    private static let toolbarControlHeight: CGFloat = 36
    /// Caps chapter / verse menu pickers so the row stays compact (still fits three-digit values e.g. Ps 150).
    private static let scriptureNumberPickerMaxWidth: CGFloat = 58

    @Environment(\.harvousScriptureTheme) private var scriptureTheme
    @ObservedObject var proxy: EditorProxy

    @State private var bookIndex: Int = 0
    @State private var chapter: Int = 1
    @State private var verseStart: Int = 1
    @State private var verseEnd: Int = 1
    @State private var useVerseRange: Bool = false
    @State private var translation: String = ScriptureReference.defaultTranslation

    private var passagePrefetchToken: String {
        "\(formattedReference())|\(translation)"
    }

    private var maxChapter: Int { ScriptureCanon.chapterCount(bookIndex: bookIndex) }
    private var maxVerse: Int { ScriptureCanon.verseCount(bookIndex: bookIndex, chapter: chapter) }

    var body: some View {
        VStack(spacing: 0) {
            // No spacing between scroll and Apply: horizontal clip runs flush to the button edge (avoids a dead band when content is clipped).
            HStack(alignment: .center, spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .center, spacing: 8) {
                        Group {
                            Picker("Translation", selection: $translation) {
                                ForEach(ScriptureReference.availableTranslations, id: \.self) { t in
                                    Text(ScriptureReference.displayTranslationLabel(t)).tag(t)
                                }
                            }
                            .pickerStyle(.menu)
                            .controlSize(.regular)
                            .labelsHidden()
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(height: Self.toolbarControlHeight)
                            .accessibilityLabel("Translation")

                            Picker("Book", selection: $bookIndex) {
                                ForEach(Array(ScriptureCanonicalBooks.titles.enumerated()), id: \.offset) { pair in
                                    Text(pair.element).tag(pair.offset)
                                }
                            }
                            .pickerStyle(.menu)
                            .controlSize(.regular)
                            .labelsHidden()
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(maxWidth: 220, alignment: .leading)
                            .frame(height: Self.toolbarControlHeight)
                            .accessibilityLabel("Book")

                            HStack(alignment: .center, spacing: 4) {
                                Picker("Chapter", selection: $chapter) {
                                    ForEach(1...maxChapter, id: \.self) { c in
                                        Text(String(c)).tag(c)
                                    }
                                }
                                .pickerStyle(.menu)
                                .controlSize(.regular)
                                .labelsHidden()
                                .frame(maxWidth: Self.scriptureNumberPickerMaxWidth)
                                .frame(height: Self.toolbarControlHeight)
                                .accessibilityLabel("Chapter")

                                Text(":")
                                    .font(HarvousTypography.actionBarMeta)
                                    .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme).opacity(0.45))
                                    .frame(width: 8, alignment: .center)

                                Picker("Verse", selection: $verseStart) {
                                    ForEach(1...maxVerse, id: \.self) { v in
                                        Text(String(v)).tag(v)
                                    }
                                }
                                .pickerStyle(.menu)
                                .controlSize(.regular)
                                .labelsHidden()
                                .frame(maxWidth: Self.scriptureNumberPickerMaxWidth)
                                .frame(height: Self.toolbarControlHeight)
                                .accessibilityLabel("Verse")

                                if useVerseRange {
                                    Text("–")
                                        .font(HarvousTypography.actionBarMeta)
                                        .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme).opacity(0.45))
                                        .frame(width: 10, alignment: .center)

                                    Picker("End verse", selection: $verseEnd) {
                                        ForEach(verseStart...maxVerse, id: \.self) { v in
                                            Text(String(v)).tag(v)
                                        }
                                    }
                                    .pickerStyle(.menu)
                                    .controlSize(.regular)
                                    .labelsHidden()
                                    .frame(maxWidth: Self.scriptureNumberPickerMaxWidth)
                                    .frame(height: Self.toolbarControlHeight)
                                    .accessibilityLabel("End verse")
                                }
                            }
                        }
                        .environment(\.font, HarvousTypography.actionBarMeta)

                        Button {
                            withAnimation(.easeInOut(duration: 0.12)) {
                                useVerseRange.toggle()
                                if !useVerseRange {
                                    verseEnd = verseStart
                                }
                                clampVersesToCanon()
                            }
                        } label: {
                            Image(systemName: useVerseRange ? "arrow.left.and.right.circle.fill" : "arrow.left.and.right.circle")
                                .font(.system(size: 15, weight: .medium))
                                .frame(width: Self.toolbarControlHeight, height: Self.toolbarControlHeight)
                        }
                        .buttonStyle(NoteToolbarButtonStyle(isActive: useVerseRange))
                        .accessibilityLabel(useVerseRange ? "Single verse" : "Verse range")
#if os(macOS)
                        .help(useVerseRange ? "Single verse" : "Verse range")
#endif

                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(alignment: .center, spacing: 0) {
                    Button("Apply") {
                        applyReference()
                    }
#if os(macOS)
                    .keyboardShortcut(.return, modifiers: [.command])
#endif
                    .buttonStyle(.borderedProminent)
                    .controlSize(.regular)
                    .font(HarvousTypography.actionBarChip)
                    .frame(minWidth: 72)
                    .accessibilityHint(String(localized: "Updates the scripture pill in your note", comment: "VoiceOver hint for Apply"))

                    Button("Done") {
                        proxy.clearActiveScripturePill()
                    }
                    .buttonStyle(.borderless)
                    .controlSize(.regular)
                    .font(HarvousTypography.actionBarMeta)
                    .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme).opacity(0.65))
                }
            }
            .frame(height: 44)
            .padding(.horizontal, 20)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(formattedReference())
                            .font(HarvousTypography.actionBarChip)
                            .foregroundStyle(HarvousColors.scripturePillForeground)
                        Text(ScriptureReference.displayTranslationLabel(translation))
                            .font(HarvousTypography.actionBarMeta)
                            .foregroundStyle(HarvousColors.scripturePillForeground.opacity(0.55))
                    }
                    ScripturePassageView(
                        reference: formattedReference(),
                        translation: translation,
                        showHeader: false,
                        useReadingTypography: true
                    )
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            #if os(iOS)
            .frame(maxHeight: 280)
            #else
            .frame(maxHeight: 400)
            #endif
        }
        .background(.bar)
        .overlay {
            HarvousColors.scriptureChipBackground(scriptureTheme).opacity(0.30)
                .allowsHitTesting(false)
        }
        .clipShape(
            UnevenRoundedRectangle(
                cornerRadii: .init(
                    topLeading: HarvousRadius.sidebarGlassLeading,
                    bottomLeading: 0,
                    bottomTrailing: 0,
                    topTrailing: HarvousRadius.sidebarGlassLeading
                ),
                style: .continuous
            )
        )
        .onAppear { syncFromProxy() }
        .onChange(of: proxy.activeScripturePill) { _, _ in syncFromProxy() }
        .onChange(of: bookIndex) { _, _ in clampSelectionToCanon() }
        .onChange(of: chapter) { _, _ in clampVersesToCanon() }
        .onChange(of: verseStart) { _, _ in
            if useVerseRange, verseEnd < verseStart { verseEnd = verseStart }
        }
        .task(id: passagePrefetchToken) {
            await ScripturePassageCache.shared.prefetch(reference: formattedReference(), translation: translation)
        }
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

    private func formattedReference() -> String {
        let end: Int? = useVerseRange && verseEnd != verseStart ? verseEnd : nil
        return ScriptureReferenceParser.format(
            bookIndex: bookIndex,
            chapter: chapter,
            verseStart: verseStart,
            verseEnd: end
        )
    }

    private func applyReference() {
        let ref = formattedReference()
        proxy.replaceActiveScripturePill(reference: ref, translation: translation, theme: scriptureTheme)
        ScriptureApplyFeedback.notifyScripturePillApplied()
    }

    private func syncFromProxy() {
        guard let pill = proxy.activeScripturePill else { return }
        translation = pill.translation
        if let p = ScriptureReferenceParser.parse(pill.reference) {
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
    }
}
