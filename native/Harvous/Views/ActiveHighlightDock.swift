import SwiftData
import SwiftUI

// MARK: - Active highlight capsule (bottom morph surface)

/// Bottom capsule — shows exactly one anchored highlight when hovered or pinned.
struct ActiveHighlightDock: View {
    @Environment(\.harvousDockExpandedContentMaxHeight) private var expandedContentMaxHeight

    /// Measured natural height of the expanded scroll content — drives exact frame sizing so the dock
    /// is content-fit (not always the full max-height cap) while still allowing real scrolling.
    @State private var expandedScrollContentHeight: CGFloat = 0
    @State private var responsePromptsCollapsed: Bool = false

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
        VStack(alignment: .leading, spacing: 10) {
            headerRow

            if isExpanded {
                expandedBody
                    .transition(.opacity)
                primaryActionIfNeeded
                    .transition(.opacity)
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
        .task(id: thread.id) {
            guard thread.entryKind == .scriptureLink else { return }
            let ref = thread.scriptureReference ?? thread.miniNoteBody
            let trimmed = ref.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            let transRaw = thread.scripturePassageTranslation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let trans = transRaw.isEmpty ? ScriptureReference.defaultTranslation : transRaw
            await ScripturePassageCache.shared.prefetch(reference: trimmed, translation: trans)

            // Already upgraded by Apple Intelligence — nothing to do.
            guard !thread.aiSuggestedQuestionsGenerated else { return }

            let excerpt = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let snippet = excerpt.isEmpty ? trimmed : excerpt

            if #available(macOS 26.0, iOS 26.0, *) {
                do {
                    let generated = try await ScriptureReflectionGenerator.generate(
                        excerpt: snippet, reference: trimmed
                    )
                    // Append heuristic defaults as a catch-all tail so they're always present.
                    // Heuristics are already shown while AI generates; this grows the list rather than replacing it.
                    let defaults = StudyPromptSuggester.questions(forScriptureExcerpt: snippet, reference: trimmed)
                    thread.suggestedQuestions = generated + defaults
                    thread.aiSuggestedQuestionsGenerated = true
                    try? modelContext.saveWithLogging()
                    return
                } catch {
                    // Model unavailable or generation failed — fall through to heuristic.
                }
            }

            // Heuristic fallback: older OS, Apple Intelligence off, or generation error.
            // aiSuggestedQuestionsGenerated stays false so the next open can upgrade when AI becomes available.
            if thread.suggestedQuestions.isEmpty {
                thread.suggestedQuestions = StudyPromptSuggester.questions(
                    forScriptureExcerpt: snippet, reference: trimmed
                )
                try? modelContext.saveWithLogging()
            }
        }
    }

    private var headerRow: some View {
        // Title is always lineLimit(1) so left and right sides are the same height — .center keeps
        // the icon/text row visually aligned with the color swatch, chevron, and close controls.
        HStack(alignment: .center, spacing: 8) {
            // Glyph (tap to expand/collapse) + editable title with default “Highlight #” placeholder.
            Image(systemName: headerGlyph)
                .symbolRenderingMode(.monochrome)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.primary)
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                        isExpanded.toggle()
                    }
                }

            // Custom title when set; otherwise placeholder-style “Highlight #” (or “Highlight” before an ordinal exists).
            TextField("", text: $thread.focusTitle, prompt: Text(defaultHighlightTitle).foregroundStyle(.secondary))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.primary)
                .textFieldStyle(.plain)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onChange(of: thread.focusTitle) { _, _ in
                    thread.updatedAt = Date()
                    try? modelContext.saveWithLogging()
                }
                #if os(iOS)
                .submitLabel(.done)
                #endif
                .accessibilityLabel("Highlight title")

            // Utility toolbar — `.animation(.none)` prevents the spring on `isExpanded` from
            // sliding the chevron symbol or the whole toolbar during expand/collapse.
            HStack(spacing: 2) {
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
                            thread.updatedAt = Date()
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
                    toolbarButton(symbol: "trash", help: "Remove highlight") {
                        onRemoveHighlight?()
                    }
                }

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

    /// Lightweight icon button used in the utility toolbar.
    /// `prominent: true` for navigation controls (collapse/close); false for utility (trash).
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
        let computedHeight = expandedScrollContentHeight > 0
            ? min(expandedScrollContentHeight, expandedContentMaxHeight)
            : expandedContentMaxHeight
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if thread.entryKind == .miniNote {
                    TextField("Add a note…", text: $thread.miniNoteBody, axis: .vertical)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textFieldStyle(.plain)
                        .fixedSize(horizontal: false, vertical: true)
                        .onChange(of: thread.miniNoteBody) { _, _ in
                            thread.updatedAt = Date()
                            try? modelContext.saveWithLogging()
                        }

                    if !thread.suggestedQuestions.isEmpty {
                        responsePromptsRow
                    }
                } else if thread.entryKind == .scriptureLink,
                          let ex = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines),
                          !ex.isEmpty {
                    if !hideExcerptDisplay {
                        Text(ex)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    TextField("Add a note…", text: $thread.miniNoteBody, axis: .vertical)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textFieldStyle(.plain)
                        .fixedSize(horizontal: false, vertical: true)
                        .onChange(of: thread.miniNoteBody) { _, _ in
                            thread.updatedAt = Date()
                            try? modelContext.saveWithLogging()
                        }

                    if !thread.suggestedQuestions.isEmpty {
                        responsePromptsRow
                    }
                } else {
                    Text(DockHighlightCopy.detail(thread, modelContext: modelContext))
                        .font(.system(size: 14, weight: .regular))
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
        }
        .frame(height: computedHeight)
        .onPreferenceChange(DockScrollContentHeightKey.self) { h in
            // Snap height after layout — animating here resizes the ScrollView viewport and can
            // flicker scroll indicators when content fits without scrolling.
            expandedScrollContentHeight = h
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
                    Image(systemName: "arrow.turn.down.right")
                        .font(.system(size: 10, weight: .regular))
                        .foregroundStyle(.tertiary)
                    Text("Respond")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(responsePromptsCollapsed ? -90 : 0))
                }
            }
            .buttonStyle(.plain)
            .padding(.top, 4)

            if !responsePromptsCollapsed {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(thread.suggestedQuestions, id: \.self) { prompt in
                            Button {
                                let prefix = thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : "\n\n"
                                thread.miniNoteBody += "\(prefix)\(prompt)\n"
                                thread.updatedAt = Date()
                                try? modelContext.saveWithLogging()
                            } label: {
                                Text(prompt)
                                    .font(.system(size: 12))
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
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
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
                    Label("View connected note", systemImage: "arrow.triangle.branch")
                        .font(.system(size: 13, weight: .medium))
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
                    Label("Read passage", systemImage: "book")
                        .font(.system(size: 13, weight: .medium))
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

    private var headerGlyph: String {
        if forceHighlighterIcon { return "highlighter" }
        switch thread.entryKind {
        case .miniNote: return "highlighter"
        case .linkedNote: return "arrow.triangle.branch"
        case .scriptureLink: return "book.fill"
        case .workspace: return "sparkles"
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
