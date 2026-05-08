import Combine
import SwiftUI

/// Shared `@Published` bible-picker state so iOS split chrome (toolbar row + passage) can animate inside one shell.
@MainActor
final class ScripturePillActionBarCoordinator: ObservableObject {
    weak var proxy: EditorProxy?

    @Published fileprivate(set) var bookIndex: Int = 0
    @Published private(set) var chapter: Int = 1
    @Published private(set) var verseStart: Int = 1
    @Published private(set) var verseEnd: Int = 1
    @Published private(set) var useVerseRange: Bool = false
    @Published private(set) var translation: String = ScriptureReference.defaultTranslation

    private var storedScriptureTheme: HarvousColors.ThemeVariant = .blue

    func bind(proxy: EditorProxy) {
        self.proxy = proxy
        syncFromProxy()
    }

    func updateTheme(_ theme: HarvousColors.ThemeVariant) {
        storedScriptureTheme = theme
    }

    func syncFromProxy() {
        guard let pill = proxy?.activeScripturePill else { return }
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

    var passagePrefetchToken: String {
        "\(formattedReference())|\(translation)"
    }

    var maxChapter: Int { ScriptureCanon.chapterCount(bookIndex: bookIndex) }
    var maxVerse: Int { ScriptureCanon.verseCount(bookIndex: bookIndex, chapter: chapter) }

    func setTranslation(_ code: String) {
        translation = code
        applyReference()
    }

    func setBookIndex(_ i: Int) {
        bookIndex = i
        clampSelectionToCanon()
        applyReference()
    }

    func setChapter(_ c: Int) {
        chapter = c
        clampVersesToCanon()
        applyReference()
    }

    func setVerseStart(_ v: Int) {
        verseStart = v
        if useVerseRange, verseEnd < verseStart { verseEnd = verseStart }
        applyReference()
    }

    func setVerseEnd(_ v: Int) {
        verseEnd = v
        applyReference()
    }

    func setUseVerseRange(_ ranged: Bool) {
        useVerseRange = ranged
        if !useVerseRange {
            verseEnd = verseStart
        }
        clampVersesToCanon()
        applyReference()
    }

    func toggleVerseRange() {
        setUseVerseRange(!useVerseRange)
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

    func formattedReference() -> String {
        let end: Int? = useVerseRange && verseEnd != verseStart ? verseEnd : nil
        return ScriptureReferenceParser.format(
            bookIndex: bookIndex,
            chapter: chapter,
            verseStart: verseStart,
            verseEnd: end
        )
    }

    func applyReference() {
        let ref = formattedReference()
        guard let proxy else { return }
        proxy.replaceActiveScripturePill(reference: ref, translation: translation, theme: storedScriptureTheme)
        ScriptureApplyFeedback.notifyScripturePillApplied()
    }

    func done() {
        proxy?.clearActiveScripturePill()
    }
}

// MARK: - Bottom chrome for the focused scripture pill

/// Bottom chrome for the focused scripture pill: toolbar (pickers, Done) and an always-visible passage preview row (iOS + macOS). Changes auto-apply immediately.
struct ScripturePillActionBar: View {
    /// Matches `NoteToolbar` typography (`HarvousTypography.actionBar*` at 15pt).
    fileprivate static let toolbarControlHeight: CGFloat = 36
    /// Caps chapter / verse menu pickers so the row stays compact (still fits three-digit values e.g. Ps 150).
    fileprivate static let scriptureNumberPickerMaxWidth: CGFloat = 58

    @Environment(\.harvousScriptureTheme) private var scriptureTheme
    @ObservedObject var proxy: EditorProxy
    @StateObject private var coordinator = ScripturePillActionBarCoordinator()

    var body: some View {
        VStack(spacing: 0) {
            ScripturePillToolbarLane(
                coordinator: coordinator,
                proxy: proxy,
                horizontalPadding: 20
            )
            ScripturePillPassagePanel(coordinator: coordinator)
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
        .onAppear {
            coordinator.bind(proxy: proxy)
        }
        .onChange(of: proxy.activeScripturePill) { _, _ in
            coordinator.bind(proxy: proxy)
        }
    }
}

/// Picker toolbar row (`ScrollView` + Done) — reused by `ScripturePillActionBar` and iOS inset unified chrome.
struct ScripturePillToolbarLane: View {
    @ObservedObject var coordinator: ScripturePillActionBarCoordinator
    var proxy: EditorProxy
    /// Match `NoteToolbar`'s inset when paired in the inset unified shell (`14`).
    var horizontalPadding: CGFloat = 20

    @Environment(\.harvousScriptureTheme) private var scriptureTheme

    private var maxChapter: Int { coordinator.maxChapter }
    private var maxVerse: Int { coordinator.maxVerse }

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .center, spacing: 8) {
                    Group {
                        Picker("Translation", selection: translationBinding) {
                            ForEach(ScriptureReference.availableTranslations, id: \.self) { t in
                                Text(ScriptureReference.displayTranslationLabel(t)).tag(t)
                            }
                        }
                        .pickerStyle(.menu)
                        .controlSize(.regular)
                        .labelsHidden()
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(height: ScripturePillActionBar.toolbarControlHeight)
                        .accessibilityLabel("Translation")

                        Picker("Book", selection: bookIndexBinding) {
                            ForEach(Array(ScriptureCanonicalBooks.titles.enumerated()), id: \.offset) { pair in
                                Text(pair.element).tag(pair.offset)
                            }
                        }
                        .pickerStyle(.menu)
                        .controlSize(.regular)
                        .labelsHidden()
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(maxWidth: 220, alignment: .leading)
                        .frame(height: ScripturePillActionBar.toolbarControlHeight)
                        .accessibilityLabel("Book")

                        HStack(alignment: .center, spacing: 4) {
                            Picker("Chapter", selection: chapterBinding) {
                                ForEach(1...maxChapter, id: \.self) { c in
                                    Text(String(c)).tag(c)
                                }
                            }
                            .pickerStyle(.menu)
                            .controlSize(.regular)
                            .labelsHidden()
                            .frame(maxWidth: ScripturePillActionBar.scriptureNumberPickerMaxWidth)
                            .frame(height: ScripturePillActionBar.toolbarControlHeight)
                            .accessibilityLabel("Chapter")

                            Text(":")
                                .font(HarvousTypography.actionBarMeta)
                                .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme).opacity(0.45))
                                .frame(width: 8, alignment: .center)

                            Picker("Verse", selection: verseStartBinding) {
                                ForEach(1...maxVerse, id: \.self) { v in
                                    Text(String(v)).tag(v)
                                }
                            }
                            .pickerStyle(.menu)
                            .controlSize(.regular)
                            .labelsHidden()
                            .frame(maxWidth: ScripturePillActionBar.scriptureNumberPickerMaxWidth)
                            .frame(height: ScripturePillActionBar.toolbarControlHeight)
                            .accessibilityLabel("Verse")

                            if coordinator.useVerseRange {
                                Text("–")
                                    .font(HarvousTypography.actionBarMeta)
                                    .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme).opacity(0.45))
                                    .frame(width: 10, alignment: .center)

                                Picker("End verse", selection: verseEndBinding) {
                                    ForEach(coordinator.verseStart...maxVerse, id: \.self) { v in
                                        Text(String(v)).tag(v)
                                    }
                                }
                                .pickerStyle(.menu)
                                .controlSize(.regular)
                                .labelsHidden()
                                .frame(maxWidth: ScripturePillActionBar.scriptureNumberPickerMaxWidth)
                                .frame(height: ScripturePillActionBar.toolbarControlHeight)
                                .accessibilityLabel("End verse")
                            }
                        }
                    }
                    .environment(\.font, HarvousTypography.actionBarMeta)

                    Button {
                        withAnimation(.easeInOut(duration: 0.12)) {
                            coordinator.toggleVerseRange()
                        }
                    } label: {
                        Image(systemName: coordinator.useVerseRange ? "arrow.left.and.right.circle.fill" : "arrow.left.and.right.circle")
                            .font(.system(size: 15, weight: .medium))
                            .frame(width: ScripturePillActionBar.toolbarControlHeight, height: ScripturePillActionBar.toolbarControlHeight)
                    }
                    .buttonStyle(NoteToolbarButtonStyle(isActive: coordinator.useVerseRange))
                    .accessibilityLabel(coordinator.useVerseRange ? "Single verse" : "Verse range")
#if os(macOS)
                    .help(coordinator.useVerseRange ? "Single verse" : "Verse range")
#endif
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button("Done") {
                coordinator.done()
            }
            .buttonStyle(.borderless)
            .controlSize(.regular)
            .font(HarvousTypography.actionBarMeta)
            .foregroundStyle(HarvousColors.scriptureChipForeground(scriptureTheme).opacity(0.65))
        }
        .frame(height: 44)
        .padding(.horizontal, horizontalPadding)
        .onAppear { coordinator.updateTheme(scriptureTheme) }
        .onChange(of: scriptureTheme) { _, new in coordinator.updateTheme(new) }
    }

    private var translationBinding: Binding<String> {
        Binding(
            get: { coordinator.translation },
            set: { coordinator.setTranslation($0) }
        )
    }

    private var bookIndexBinding: Binding<Int> {
        Binding(
            get: { coordinator.bookIndex },
            set: { coordinator.setBookIndex($0) }
        )
    }

    private var chapterBinding: Binding<Int> {
        Binding(
            get: { coordinator.chapter },
            set: { coordinator.setChapter($0) }
        )
    }

    private var verseStartBinding: Binding<Int> {
        Binding(
            get: { coordinator.verseStart },
            set: { coordinator.setVerseStart($0) }
        )
    }

    private var verseEndBinding: Binding<Int> {
        Binding(
            get: { coordinator.verseEnd },
            set: { coordinator.setVerseEnd($0) }
        )
    }
}

/// Passage preview under the scripture toolbar lane.
struct ScripturePillPassagePanel: View {
    @ObservedObject var coordinator: ScripturePillActionBarCoordinator

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(coordinator.formattedReference())
                        .font(HarvousTypography.actionBarChip)
                        .foregroundStyle(HarvousColors.scripturePillForeground)
                    Text(ScriptureReference.displayTranslationLabel(coordinator.translation))
                        .font(HarvousTypography.actionBarMeta)
                        .foregroundStyle(HarvousColors.scripturePillForeground.opacity(0.55))
                }
                ScripturePassageView(
                    reference: coordinator.formattedReference(),
                    translation: coordinator.translation,
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
        .task(id: coordinator.passagePrefetchToken) {
            await ScripturePassageCache.shared.prefetch(reference: coordinator.formattedReference(), translation: coordinator.translation)
        }
    }
}
