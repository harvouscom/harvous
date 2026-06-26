import SwiftData
import SwiftUI

/// Temporary — set `true` when Respond prompt chips are ready to ship.
private enum HighlightDockRespondFeature {
    static let isEnabled = false
}

// MARK: - Active highlight capsule (bottom morph surface)

/// Bottom capsule — shows exactly one anchored highlight when pinned or explicitly activated (e.g. keyboard).
struct ActiveHighlightDock: View {
    @Environment(\.harvousDockExpandedContentMaxHeight) private var expandedContentMaxHeight

    /// Measured natural height of the expanded scroll content — drives exact frame sizing so the dock
    /// is content-fit (not always the full max-height cap) while still allowing real scrolling.
    @State private var expandedScrollContentHeight: CGFloat = 0
    @State private var responsePromptsCollapsed: Bool = false

    /// User-driven override slug for reference-kind threads. `nil` means "fall back to the slug
    /// derived from `thread.sourceSnippet`" — see `effectiveReferenceSlug`. Set when the user taps a
    /// see-also chip. Reset when `thread.id` changes so reopening the dock starts from the snippet.
    @State private var referenceSlugOverride: String? = nil

    @Bindable var thread: StudyThread
    @Binding var isExpanded: Bool

    /// Space accent theme (used sparingly on primary actions).
    var scriptureTheme: HarvousColors.ThemeVariant

    let onDismiss: () -> Void
    let onAccentPersisted: () -> Void

    /// Open linked-note target (editor stays coherent with parent note).
    var onJumpToLinkedNote: ((UUID) -> Void)?
    /// Show passage sheet (`reference`, `translation` code).
    var onReadPassage: ((String, String) -> Void)?
    /// Remove the underlying `StudyThread` so the painted highlight (and its miniNote / connection) is gone.
    /// When nil, the remove button is hidden — used in surfaces where removal belongs to a different UI.
    var onRemoveHighlight: (() -> Void)?

    /// 1-based index among this note’s anchored highlights in document order (top to bottom).
    /// When nil, the collapsed header reads “Highlight” only.
    var highlightOrdinal: Int? = nil

    /// Override the header glyph to `”highlighter”` regardless of `entryKind`.
    /// Used when the dock is embedded inside the scripture dock, where the passage context
    /// is already visible and the book icon would be confusing.
    var forceHighlighterIcon: Bool = false

    /// When `true`, suppress the excerpt text block in the expanded body for `.scriptureLink` threads.
    /// Use when the passage is already visible above (e.g. inside `ActiveScripturePillDock`).
    var hideExcerptDisplay: Bool = false

    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var dockColorScheme
    @Environment(\.harvousStudyDockInCarousel) private var inStudyDockCarousel

#if os(iOS)
    /// Avoid auto-moving keyboard focus into the mini-note editors while UITextView is still key during dock reveal.
    @FocusState private var dockMiniNoteFieldFocused: Bool
#endif

    /// SwiftUI tint derived from the thread's persisted accent. Matches the underline paint exactly —
    /// `.auto` uses the per-kind default (same as `EditorStudyHighlight.applyHighlights`), named accents
    /// use their picked hue. We intentionally *don't* fall back to the space theme here so the dock
    /// mirrors the color the user set when creating the highlight.
    private var accentTint: Color {
        let token = StudyHighlightAccentToken.decoding(thread.highlightAccentRaw)
        let isDark = dockColorScheme == .dark
        #if os(macOS)
        return Color(nsColor: token.resolvedAccentNSColor(kind: thread.entryKind, isDark: isDark))
        #elseif os(iOS)
        return Color(uiColor: token.resolvedAccentUIColor(kind: thread.entryKind, isDark: isDark))
        #else
        return HarvousColors.themeAccent(scriptureTheme)
        #endif
    }

    var body: some View {
        applyCollapsedExpandTap { dockCardChrome }
        // When the dock swaps to another `StudyThread` in-place, `.onChange(of: thread.focusTitle)`
        // (and mini-note) would otherwise see previous-thread vs next-thread as one edit and bump
        // `highlightListEditedAt`. New identity per thread prevents that phantom “change”.
        .id(thread.id)
        .shadow(color: .black.opacity(0.10), radius: 12, y: 4)
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        .padding(.horizontal, inStudyDockCarousel ? 0 : 20)
        .padding(.top, inStudyDockCarousel ? 0 : 6)
        .padding(.bottom, inStudyDockCarousel ? 0 : 10)
#if os(iOS)
        .onChange(of: isExpanded) { _, expanded in
            guard expanded else {
                expandedScrollContentHeight = 0
                return
            }
            Task { @MainActor in dockMiniNoteFieldFocused = false }
        }
#else
        .onChange(of: isExpanded) { _, expanded in
            if !expanded { expandedScrollContentHeight = 0 }
        }
#endif
        .task(id: thread.id) {
            // Drop any prior see-also override when the dock swaps to a different reference highlight.
            // The badge + body for the new thread is derived synchronously from `thread.sourceSnippet`
            // via `effectiveReferenceSlug`, so no need to set state up-front.
            if thread.entryKind == .reference {
                referenceSlugOverride = nil
            }

            // Yield so SwiftUI can commit study-dock chrome before `seed`/fire-and-forget work competes with layout.
            await Task.yield()
            StudyPromptSuggester.seedScriptureRespondQuestionsIfNeeded(thread: thread, modelContext: modelContext)

            guard thread.entryKind == .scriptureLink else { return }
            let ref = thread.scriptureReference ?? thread.miniNoteBody
            let trimmed = ref.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            let transRaw = thread.scripturePassageTranslation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let trans = transRaw.isEmpty ? ScriptureReference.defaultTranslation : transRaw

            Task(priority: .utility) {
                await ScripturePassageCache.shared.prefetch(reference: trimmed, translation: trans)
            }

            if #available(macOS 26.0, iOS 26.0, *) {
                guard !thread.aiSuggestedQuestionsGenerated else { return }
                let threadId = thread.id
                Task { @MainActor in
                    await ThreadStore.warmScriptureReflectionQuestions(threadId: threadId, modelContext: modelContext)
                }
            }
        }
    }

    private var showsPrimaryDockAction: Bool {
        switch thread.entryKind {
        case .linkedNote:
            return thread.linkedNoteId != nil && onJumpToLinkedNote != nil
        case .scriptureLink:
            let trimmed = (thread.scriptureReference ?? thread.miniNoteBody)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return !trimmed.isEmpty && onReadPassage != nil
        default:
            return false
        }
    }

    private var dockCardChrome: some View {
        VStack(alignment: .leading, spacing: 10) {
            headerRow

            if isExpanded {
                expandedBody
                    .transition(.opacity)
                primaryActionIfNeeded
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: inStudyDockCarousel ? .infinity : nil, alignment: .topLeading)
        .padding(.horizontal, 12)
        .padding(.top, 10)
        // Expanded scroll runs to the card bottom unless a primary action sits below it.
        .padding(.bottom, isExpanded ? (showsPrimaryDockAction ? 10 : 0) : 10)
        .background(dockChrome)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .studyDockShellBorderOverlay()
        // Carousel spring animates slot width; snap vertical chrome so expand/collapse cannot overshoot negative height.
        .animation(.none, value: isExpanded)
    }

    /// Effective slug for reference rendering — uses the user's see-also override if set, otherwise
    /// derives synchronously from `thread.sourceSnippet`. Computing this on first render (instead of
    /// waiting for `.task` to set @State) keeps the category badge in the same animation frame as the
    /// rest of the dock chrome — no second-frame snap-in.
    private var effectiveReferenceSlug: String {
        if let override = referenceSlugOverride { return override }
        guard thread.entryKind == .reference else { return "" }
        let word = thread.sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines)
        return EastonsDictionaryService.shared.matchedSlug(forWord: word) ?? word.lowercased()
    }

    /// Binding handed to `EastonsEntryView` — reads the effective slug, writes through the override
    /// state so see-also taps swap the entry in-place without disturbing the badge's first-frame anchor.
    private var referenceSlugBinding: Binding<String> {
        Binding(
            get: { effectiveReferenceSlug },
            set: { newValue in referenceSlugOverride = newValue }
        )
    }

    /// Category icon + label for the active reference slug — resolved synchronously from the loaded index.
    private var referenceCategoryMeta: (iconAsset: String, label: String)? {
        let slug = effectiveReferenceSlug
        guard thread.entryKind == .reference, !slug.isEmpty else { return nil }
        guard let entry = EastonsDictionaryService.shared.slugIndex[slug],
              let icon = entry.categoryIconAsset,
              let cat = entry.category else { return nil }
        return (icon, cat.capitalized)
    }

    @ViewBuilder
    private func referenceCategoryBadge(iconAsset: String, label: String) -> some View {
        StudyDockHeaderChipView(chip: .referenceCategory(iconAsset: iconAsset, label: label))
    }

    @ViewBuilder
    private var referenceHeaderTitleGroup: some View {
        if thread.entryKind == .reference, let meta = referenceCategoryMeta {
            HStack(spacing: 8) {
                referenceHeaderTitleContent
                    .layoutPriority(0)
                    .frame(minWidth: 0)
                referenceCategoryBadge(iconAsset: meta.iconAsset, label: meta.label)
                    .layoutPriority(1)
            }
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        } else {
            highlightTitleField
                .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var referenceHeaderTitleContent: some View {
        // Static label like scripture dock — macOS TextField expands horizontally and pushes the chip right.
        Text(referenceDisplayTitle)
            .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
            .foregroundStyle(.primary)
            .lineLimit(1)
            .truncationMode(.tail)
    }

    private var referenceDisplayTitle: String {
        let custom = thread.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !custom.isEmpty { return custom }
        if let entry = EastonsDictionaryService.shared.slugIndex[effectiveReferenceSlug] {
            return entry.headword
        }
        let word = thread.sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines)
        if !word.isEmpty { return word.capitalized }
        return defaultHighlightTitle
    }

    private var highlightTitleField: some View {
        TextField("", text: $thread.focusTitle, prompt: Text(defaultHighlightTitle).foregroundStyle(.secondary))
            .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
            .foregroundStyle(.primary)
            .textFieldStyle(.plain)
            .lineLimit(1)
            .truncationMode(.tail)
            .allowsHitTesting(isExpanded)
            .onChange(of: thread.focusTitle) { old, new in
                guard old != new else { return }
                let now = Date()
                thread.updatedAt = now
                thread.highlightListEditedAt = now
                try? modelContext.saveWithLogging()
            }
            #if os(iOS)
            .submitLabel(.done)
            #endif
            .accessibilityLabel("Highlight title")
    }

    private var headerRow: some View {
        // Title is always lineLimit(1) so left and right sides are the same height — .center keeps
        // the icon/text row visually aligned with the color swatch, chevron, and close controls.
        HStack(alignment: .center, spacing: 8) {
            // Glyph (tap to expand/collapse)
            headerGlyphImage

            referenceHeaderTitleGroup

            // Utility toolbar — `.animation(.none)` prevents the spring on `isExpanded` from
            // sliding the chevron symbol or the whole toolbar during expand/collapse.
            HStack(spacing: 2) {
                if isExpanded {
                    // Secondary controls: color swatch + trash
                    DockAccentSwatchButton(
                        selection: Binding(
                            get: {
                                StudyHighlightAccentToken
                                    .decoding(thread.highlightAccentRaw)
                                    .resolvedFromAuto(forKind: thread.entryKind)
                            },
                            set: { newValue in
                                thread.highlightAccentRaw = newValue.rawValue
                                thread.highlightListEditedAt = Date()
                                thread.markDirty()
                                try? modelContext.saveWithLogging()
                                onAccentPersisted()
                            }
                        ),
                        paletteTokens: thread.entryKind == .scriptureLink
                            ? StudyHighlightAccentToken.pickerChoicesWithNeutral
                            : StudyHighlightAccentToken.pickerChoices,
                        entryKind: thread.entryKind
                    )

                    if onRemoveHighlight != nil {
                        toolbarButton(assetName: "Harvous.Trash", help: "Remove highlight") {
                            onRemoveHighlight?()
                        }
                    }

                    toolbarDivider

                    toolbarButton(
                        assetName: "Harvous.ChevronDown",
                        help: "Collapse",
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

    /// Lightweight icon button used in the utility toolbar.
    /// `prominent: true` for navigation controls (collapse/close); false for utility (trash).
    private func toolbarButton(
        assetName: String,
        help: String,
        prominent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: prominent ? 13 : 12)
                .contentTransition(.identity) // avoid symbol morph flicker between assets
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

    /// Shown as the TextField prompt when `focusTitle` is empty — stable numbering from document order.
    private var defaultHighlightTitle: String {
        if let n = highlightOrdinal, n >= 1 {
            return "Highlight \(n)"
        }
        return "Highlight"
    }

    @ViewBuilder
    private var expandedBody: some View {
        // Measure natural content height so the dock is content-fit up to the cap.
        // - fixedSize on a ScrollView disables scrolling (it uses ideal/content height and believes
        //   it already fits everything), so we measure instead and drive an exact frame(height:).
        // - Until the first measurement fires, start at the max-height cap so there's no zero-height flash.
        let computedHeight = HarvousDockExpandedContentLayout.clampedScrollFrameHeight(
            measuredContentHeight: expandedScrollContentHeight,
            maxHeight: expandedContentMaxHeight
        )

        // Note text — scrollable; `Spacer` + `minHeight` pin content to top when prose is shorter than the viewport cap.
        ScrollView {
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 10) {
                    if thread.entryKind == .miniNote {
                        TextField("Note (optional)…", text: $thread.miniNoteBody, axis: .vertical)
                            .font(HarvousFonts.font(size: 14, weight: .regular, design: .default))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textFieldStyle(.plain)
                            .fixedSize(horizontal: false, vertical: true)
#if os(iOS)
                            .focused($dockMiniNoteFieldFocused)
#endif
                            .onChange(of: thread.miniNoteBody) { old, new in
                                guard old != new else { return }
                                thread.highlightListEditedAt = Date()
                                thread.markDirty()
                                try? modelContext.saveWithLogging()
                            }
                    } else if thread.entryKind == .scriptureLink,
                              let ex = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines),
                              !ex.isEmpty {
                        if !hideExcerptDisplay {
                            Text(ex)
                                .font(HarvousFonts.font(size: 14, weight: .regular, design: .default))
                                .foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        TextField("Note (optional)…", text: $thread.miniNoteBody, axis: .vertical)
                            .font(HarvousFonts.font(size: 14, weight: .regular, design: .default))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textFieldStyle(.plain)
                            .fixedSize(horizontal: false, vertical: true)
#if os(iOS)
                            .focused($dockMiniNoteFieldFocused)
#endif
                            .onChange(of: thread.miniNoteBody) { old, new in
                                guard old != new else { return }
                                thread.highlightListEditedAt = Date()
                                thread.markDirty()
                                try? modelContext.saveWithLogging()
                            }
                    } else if thread.entryKind == .reference {
                        EastonsEntryView(slug: referenceSlugBinding, showHeadword: false, showDisclaimer: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text(DockHighlightCopy.detail(thread, modelContext: modelContext))
                            .font(HarvousFonts.font(size: 14, weight: .regular, design: .default))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(key: DockScrollContentHeightKey.self, value: geo.size.height)
                    }
                )

                Spacer(minLength: 0)
                    .allowsHitTesting(false)
            }
            .frame(
                maxWidth: .infinity,
                minHeight: HarvousDockExpandedContentLayout.nonNegativeFrameHeight(computedHeight - 1),
                alignment: .topLeading
            )
        }
        .frame(height: HarvousDockExpandedContentLayout.nonNegativeFrameHeight(computedHeight))
        .animation(nil, value: computedHeight)
        .onPreferenceChange(DockScrollContentHeightKey.self) { h in
            // Prefer async so height updates aren't written during SwiftUI layout (runtime purple warnings).
            Task { @MainActor in
                expandedScrollContentHeight = h
            }
        }

        // Respond chips — outside the vertical ScrollView so the horizontal scroll row can bleed
        // past the dock's .padding(.horizontal, 12) via the negative offset below.
        if HighlightDockRespondFeature.isEnabled, !thread.suggestedQuestions.isEmpty {
            responsePromptsRow
                .padding(.horizontal, -12)
        }
    }

    /// Soft response prompts seeded at creation — tapping one appends the question to the note body.
    private var responsePromptsRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                    responsePromptsCollapsed.toggle()
                }
            } label: {
                HStack(spacing: 4) {
                    HarvousFAGlyph(assetName: "Harvous.Reply", edgePt: 10)
                        .foregroundStyle(.tertiary)
                    Text("Respond")
                        .font(HarvousFonts.font(size: 11, weight: .medium, design: .default))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    HarvousFAGlyph(assetName: "Harvous.ChevronDown", edgePt: 9)
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(responsePromptsCollapsed ? -90 : 0))
                }
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            .padding(.horizontal, 12)

            if !responsePromptsCollapsed {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(thread.suggestedQuestions, id: \.self) { prompt in
                            Button {
                                let prefix = thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : "\n\n"
                                thread.miniNoteBody += "\(prefix)\(prompt)\n"
                                let now = Date()
                                thread.updatedAt = now
                                thread.highlightListEditedAt = now
                                try? modelContext.saveWithLogging()
                            } label: {
                                Text(prompt)
                                    .font(HarvousFonts.font(size: 12, weight: .regular, design: .default))
                                    .foregroundStyle(.secondary)
                                    .fixedSize()
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(
                                        Capsule(style: .continuous)
                                            .fill(Color.primary.opacity(0.06))
                                    )
                                    .overlay(
                                        Capsule(style: .continuous)
                                            .strokeBorder(Color.primary.opacity(0.10), lineWidth: 0.5)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                    .padding(.horizontal, 12)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Primary action for linked-note / scripture entries — shown below the body when expanded.
    @ViewBuilder
    private var primaryActionIfNeeded: some View {
        switch thread.entryKind {
        case .linkedNote:
            if let nid = thread.linkedNoteId {
                Button {
                    onJumpToLinkedNote?(nid)
                } label: {
                    HStack(spacing: 5) {
                        HarvousFAGlyph(assetName: "Harvous.ArrowRightArrowLeft", edgePt: 12)
                        Text("View connected note")
                            .font(HarvousFonts.font(size: 13, weight: .medium, design: .default))
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(accentTint)
                #if os(macOS)
                .help("Open the linked note")
                #endif
            }
        case .scriptureLink:
            let trimmed = (thread.scriptureReference ?? thread.miniNoteBody).trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, onReadPassage != nil {
                let transRaw = thread.scripturePassageTranslation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let trans = transRaw.isEmpty ? ScriptureReference.defaultTranslation : transRaw
                Button {
                    onReadPassage?(trimmed, trans)
                } label: {
                    Label("Read passage", image: "Harvous.BookOpen")
                        .font(HarvousFonts.font(size: 13, weight: .medium, design: .default))
                }
                .buttonStyle(.plain)
                .foregroundStyle(accentTint)
                #if os(macOS)
                .help("Read scripture passage")
                #endif
            }
        default:
            EmptyView()
        }
    }

    private var headerGlyphAssetName: String {
        if forceHighlighterIcon { return "Harvous.Highlight" }
        switch thread.entryKind {
        case .miniNote: return "Harvous.Highlight"
        case .linkedNote: return "Harvous.ArrowRightArrowLeft"
        case .scriptureLink: return "Harvous.BookOpen"
        case .reference: return "Harvous.LinesLeaning"
        case .workspace: return "Harvous.WandMagicSparkles"
        }
    }

    @ViewBuilder
    private var headerGlyphImage: some View {
        HarvousFAGlyph(assetName: headerGlyphAssetName, edgePt: 13)
            .foregroundStyle(.primary)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                    isExpanded.toggle()
                }
            }
    }

    @ViewBuilder
    private func applyCollapsedExpandTap<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if isExpanded {
            content()
        } else {
            content()
                .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .onTapGesture {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                        isExpanded = true
                    }
                }
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Expand study dock")
        }
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
}

// MARK: - Dock accent swatch button (compact, popover-based)

/// Compact circular swatch that lives in the dock header. Shows the active accent; tapping it opens
/// a floating popover with the other choices so color picking stays part of the dock chrome instead
/// of pushing content around inline.
struct DockAccentSwatchButton: View {
    @Binding var selection: StudyHighlightAccentToken
    /// Tokens shown in the popover (highlights omit neutral; scripture chrome may include it).
    var paletteTokens: [StudyHighlightAccentToken]
    /// Used to resolve legacy `.auto` storage into a solid preview that matches inline paint.
    var entryKind: StudyThread.EntryKind

    @Environment(\.colorScheme) private var colorScheme

    @State private var showPicker: Bool = false

    private var isDark: Bool { colorScheme == .dark }

    init(
        selection: Binding<StudyHighlightAccentToken>,
        paletteTokens: [StudyHighlightAccentToken] = StudyHighlightAccentToken.pickerChoices,
        entryKind: StudyThread.EntryKind = .miniNote
    ) {
        _selection = selection
        self.paletteTokens = paletteTokens
        self.entryKind = entryKind
    }

    var body: some View {
        Button {
            showPicker.toggle()
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Color.primary.opacity(0.28), lineWidth: 1)
                    .frame(width: 22, height: 22)
                activeSwatchFill
                    .frame(width: 14, height: 14)
                    .clipShape(Circle())
            }
            .accessibilityLabel("Accent color: \(selection.label)")
            .accessibilityAddTraits(.isButton)
        }
        .buttonStyle(.plain)
        #if os(macOS)
        .help("Change color")
        #endif
        .popover(isPresented: $showPicker, arrowEdge: .top) {
            popoverContent
            #if os(iOS)
                .presentationCompactAdaptation(.popover)
            #endif
        }
    }

    @ViewBuilder
    private var activeSwatchFill: some View {
        tokenSwatchFill(selection)
    }

    @ViewBuilder
    private func tokenSwatchFill(_ token: StudyHighlightAccentToken) -> some View {
#if os(macOS)
        Color(nsColor: token.resolvedAccentNSColor(kind: entryKind, isDark: isDark))
#elseif os(iOS)
        Color(uiColor: token.resolvedAccentUIColor(kind: entryKind, isDark: isDark))
#else
        Color.gray.opacity(0.35)
#endif
    }

    private var popoverContent: some View {
        HStack(spacing: 10) {
            ForEach(paletteTokens, id: \.rawValue) { token in
                swatchChoice(token, label: token.label)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func swatchChoice(_ token: StudyHighlightAccentToken, label: String) -> some View {
        let picked = selection == token
        return Button {
            selection = token
            showPicker = false
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Color.primary.opacity(picked ? 0.65 : 0.18), lineWidth: picked ? 2 : 1)
                    .frame(width: 28, height: 28)
                tokenSwatchFill(token)
                    .frame(width: 20, height: 20)
                    .clipShape(Circle())
            }
            .accessibilityLabel(label)
            .accessibilityAddTraits(picked ? .isSelected : [])
        }
        .buttonStyle(.plain)
        #if os(macOS)
        .help(label)
        #endif
    }
}

// MARK: - Accent picker (also used from floating compose menu shape-language)

/// Horizontal accent preset row (+ default) for anchored highlights.
struct StudyDockAccentPickerRow: View {
    @Binding var selection: StudyHighlightAccentToken

    /// Defaults to highlight palette (amber + hues, no neutral).
    var paletteTokens: [StudyHighlightAccentToken] = StudyHighlightAccentToken.pickerChoices
    var entryKind: StudyThread.EntryKind = .miniNote

    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(spacing: 0) {
            Divider()
                .opacity(0.22)
                .padding(.bottom, 8)

            HStack(spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(paletteTokens, id: \.rawValue) { token in
                            accentDot(token, label: token.label)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color.primary.opacity(0.035))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.6)
        )
    }

    @ViewBuilder
    private func swatchDotFill(_ token: StudyHighlightAccentToken) -> some View {
#if os(macOS)
        Color(nsColor: token.resolvedAccentNSColor(kind: entryKind, isDark: isDark))
#elseif os(iOS)
        Color(uiColor: token.resolvedAccentUIColor(kind: entryKind, isDark: isDark))
#else
        Color.gray.opacity(0.35)
#endif
    }

    private func accentDot(_ token: StudyHighlightAccentToken, label: String) -> some View {
        let picked = selection == token
        return Button {
            selection = token
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Color.primary.opacity(picked ? 0.65 : 0.18), lineWidth: picked ? 2 : 1)
                    .frame(width: 26, height: 26)
                swatchDotFill(token)
                    .frame(width: 18, height: 18)
                    .clipShape(Circle())
            }
            .accessibilityLabel(label)
            .accessibilityAddTraits(picked ? .isSelected : [])
        }
        .buttonStyle(.plain)
#if os(macOS)
        .help(label)
#endif
    }
}

// MARK: - Copy helpers (shared wording with inspector list rows)

private enum DockHighlightCopy {
    @MainActor
    static func detail(_ thread: StudyThread, modelContext: ModelContext) -> String {
        switch thread.entryKind {
        case .miniNote:
            let body = thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
            if body.isEmpty { return thread.sourceExcerptForList }
            return body

        case .linkedNote:
            guard let nid = thread.linkedNoteId,
                  let linked = ThreadStore.fetchNote(id: nid, modelContext: modelContext)
            else { return thread.sourceExcerptForList }
            let title = linked.title.trimmingCharacters(in: .whitespacesAndNewlines)
            let line = DockHighlightUtilities.firstNoteLine(linked.body)
            if title.isEmpty { return line }
            return "\(title)\n\(line)"

        case .scriptureLink:
            let ex = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !ex.isEmpty { return ex }
            let ref = (thread.scriptureReference ?? thread.miniNoteBody).trimmingCharacters(in: .whitespacesAndNewlines)
            let transRaw = thread.scripturePassageTranslation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let trans = transRaw.isEmpty ? ScriptureReference.defaultTranslation : transRaw
            if let attributed = ScripturePassageCache.shared.value(reference: ref, translation: trans) {
                return attributed.string.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return ref.isEmpty ? thread.sourceExcerptForList : ref

        default:
            return thread.sourceExcerptForList
        }
    }
}

private enum DockHighlightUtilities {
    static func firstNoteLine(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.split(separator: "\n", omittingEmptySubsequences: true).first else {
            return trimmed
        }
        let line = String(first)
        if line.count <= 220 { return line }
        return String(line.prefix(217)) + "…"
    }
}

// MARK: - Future recall / review suggestions (dock extension seam; not rendered yet)

/// Placeholder type so recall/review can hook the same collapsed/expanded capsule later without inventing persistence now.
protocol StudyHighlightDockSuggestionServing: Sendable {
    func upcomingDockSuggestions(noteId _: UUID, spaceId _: UUID) async -> [StudyHighlightDockSuggestionPlaceholder]
}

struct StudyHighlightDockSuggestionPlaceholder: Identifiable, Sendable {
    let id: UUID
    let title: String
    let subtitle: String?

    nonisolated init(id: UUID = UUID(), title: String, subtitle: String? = nil) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
    }
}
