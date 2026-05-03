import SwiftData
import SwiftUI

// MARK: - Active highlight capsule (bottom morph surface)

/// Bottom capsule that mirrors `StudySelectionFloatingMenu` chrome — shows exactly one anchored highlight when hovered or pinned.
struct ActiveHighlightDock: View {
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

    @Environment(\.modelContext) private var modelContext

    @Namespace private var morph

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            headerRow

            if isExpanded {
                expandedBody
                    .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .topLeading)))
                actionRowIfNeeded
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: isExpanded)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(dockChrome)
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Color.white.opacity(0.28), lineWidth: 0.65)
                .allowsHitTesting(false)
        )
        .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
        .padding(.horizontal, 32)
        .padding(.top, 6)
        .task(id: thread.id) {
            guard thread.entryKind == .scriptureLink else { return }
            let ref = thread.scriptureReference ?? thread.miniNoteBody
            let trimmed = ref.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            await ScripturePassageCache.shared.prefetch(reference: trimmed, translation: ScriptureReference.defaultTranslation)
        }
    }

    private var headerRow: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: headerGlyph)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.secondary)

            Text(collapsedPreviewLine)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(isExpanded ? 4 : 1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                        isExpanded.toggle()
                    }
                }

            Spacer(minLength: 0)

            Button {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                    isExpanded.toggle()
                }
            } label: {
                Image(systemName: isExpanded ? "chevron.down.circle.fill" : "chevron.up.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            #if os(macOS)
            .help(isExpanded ? "Show less" : "Show more")
            #endif

            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            #if os(macOS)
            .help("Dismiss highlight")
            #endif
        }
    }

    private var collapsedPreviewLine: String {
        let primary = DockHighlightCopy.primaryLine(thread)
        guard !primary.isEmpty else { return "Highlight" }
        return primary
    }

    @ViewBuilder
    private var expandedBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(DockHighlightCopy.detail(thread, modelContext: modelContext))
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

            StudyDockAccentPickerRow(selection: Binding(
                get: { StudyHighlightAccentToken.decoding(thread.highlightAccentRaw) },
                set: { newValue in
                    thread.highlightAccentRaw = newValue.rawValue
                    thread.updatedAt = Date()
                    try? modelContext.save()
                    onAccentPersisted()
                }
            ))
            .matchedGeometryEffect(id: "dock-accent", in: morph)
        }
    }

    @ViewBuilder
    private var actionRowIfNeeded: some View {
        switch thread.entryKind {
        case .linkedNote:
            if let nid = thread.linkedNoteId {
                Button {
                    onJumpToLinkedNote?(nid)
                } label: {
                    Label("View connected note", systemImage: "arrow.triangle.branch")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(HarvousColors.themeAccent(scriptureTheme))
            }
        case .scriptureLink:
            let trimmed = (thread.scriptureReference ?? thread.miniNoteBody).trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                Button {
                    onReadPassage?(trimmed, ScriptureReference.defaultTranslation)
                } label: {
                    Label("Read passage", systemImage: "book")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(HarvousColors.themeAccent(scriptureTheme))
            }
        default:
            EmptyView()
        }
    }

    private var headerGlyph: String {
        switch thread.entryKind {
        case .miniNote: return "bubble.left.and.bubble.right.fill"
        case .linkedNote: return "arrow.triangle.branch"
        case .scriptureLink: return "book.fill"
        case .workspace: return "sparkles"
        }
    }

    private var dockChrome: some View {
        ZStack {
            let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
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

// MARK: - Accent picker (also used from floating compose menu shape-language)

/// Horizontal accent preset row (+ default) for anchored highlights.
struct StudyDockAccentPickerRow: View {
    @Binding var selection: StudyHighlightAccentToken

    var body: some View {
        HStack(spacing: 10) {
            Text("Accent")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.tertiary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    accentDot(.auto, label: "Auto")
                    ForEach(StudyHighlightAccentToken.pickerChoices, id: \.rawValue) { token in
                        accentDot(token, label: token.label)
                    }
                }
                .padding(.vertical, 2)
            }
        }
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
                swatch(token)
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

    @ViewBuilder
    private func swatch(_ token: StudyHighlightAccentToken) -> some View {
        switch token {
        case .auto:
            AngularGradient(colors: [.orange, .cyan, .purple, .mint], center: .center)
        default:
#if os(macOS)
            Color(nsColor: token.resolvedNSColor(kind: .miniNote, isDark: false))
#elseif os(iOS)
            Color(uiColor: token.resolvedUIColor(kind: .miniNote, isDark: false))
#else
            Color.gray.opacity(0.35)
#endif
        }
    }
}

// MARK: - Copy helpers (shared wording with inspector list rows)

private enum DockHighlightCopy {
    static func primaryLine(_ thread: StudyThread) -> String {
        switch thread.entryKind {
        case .miniNote:
            let body = thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
            if body.isEmpty { return thread.sourceExcerptForList }
            return body.count <= 120 ? body : String(body.prefix(117)) + "…"

        case .linkedNote:
            let t = thread.linkedNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? thread.sourceExcerptForList : t

        case .scriptureLink:
            return (thread.scriptureReference ?? thread.miniNoteBody).trimmingCharacters(in: .whitespacesAndNewlines)

        default:
            return thread.sourceExcerptForList
        }
    }

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
            let ref = (thread.scriptureReference ?? thread.miniNoteBody).trimmingCharacters(in: .whitespacesAndNewlines)
            if let attributed = ScripturePassageCache.shared.value(reference: ref, translation: ScriptureReference.defaultTranslation) {
                return attributed.string.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return ref

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
