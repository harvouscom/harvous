import SwiftUI
import SwiftData

#if os(macOS)

/// ⌘K spotlight-style search overlay.
/// Presented over the full window. Dismiss with Escape or click outside.
struct SpotlightSearchView: View {
    @Binding var isPresented: Bool
    @Binding var selectedNote: Note?

    @Query private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var query = ""
    @State private var highlightedIndex = 0
    @FocusState private var fieldFocused: Bool

    private var notesInActiveSpace: [Note] {
        HarvousNoteListVisibility.notesInActiveSpace(
            from: notes,
            spaceId: spaceStore.activeSpaceUUID()
        )
    }

    private var results: [Note] {
        let parsed = Self.parseSpotlightQuery(query)
        if !parsed.hasAnyFilter && parsed.freeText.isEmpty { return [] }
        let q = parsed.freeText.lowercased()
        let needFree = !q.isEmpty
        return notesInActiveSpace.filter { note in
            if let t = parsed.tagFilter {
                if !note.tags.contains(where: { $0.lowercased().contains(t.lowercased()) }) { return false }
            }
            if let c = parsed.folderFilter {
                let pc = note.primaryFolder?.lowercased() ?? ""
                if !pc.contains(c.lowercased()) { return false }
            }
            if let r = parsed.refFilter {
                if !note.detectedRefs.contains(where: { $0.lowercased().contains(r.lowercased()) }) { return false }
            }
            if let fd = parsed.fromDateFilter {
                if note.createdAt < fd { return false }
            }
            if !needFree { return true }
            return note.title.lowercased().contains(q) ||
                note.body.lowercased().contains(q) ||
                note.detectedRefs.contains(where: { $0.lowercased().contains(q) }) ||
                note.tags.contains(where: { $0.lowercased().contains(q) })
        }
    }

    /// Parses `tag:x folder:y` (alias `collection:y`) `ref:Romans 8 from:2024-01-01` plus free-text tokens.
    private struct ParsedSpotlightQuery {
        var freeText: String
        var tagFilter: String?
        var folderFilter: String?
        var refFilter: String?
        var fromDateFilter: Date?

        var hasAnyFilter: Bool {
            tagFilter != nil || folderFilter != nil || refFilter != nil || fromDateFilter != nil
        }
    }

    private static func spotlightFilterPrefixBreaksRefContinuation(_ lowercasedToken: String) -> Bool {
        lowercasedToken.hasPrefix("tag:")
            || lowercasedToken.hasPrefix("collection:")
            || lowercasedToken.hasPrefix("folder:")
            || lowercasedToken.hasPrefix("from:")
            || lowercasedToken.hasPrefix("ref:")
    }

    private static func parseSpotlightQuery(_ raw: String) -> ParsedSpotlightQuery {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ParsedSpotlightQuery(freeText: "", tagFilter: nil, folderFilter: nil, refFilter: nil, fromDateFilter: nil)
        }
        let parts = trimmed.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
        var tag: String?
        var folder: String?
        var ref: String?
        var from: Date?
        var free: [String] = []
        var i = 0
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone.current
        df.dateFormat = "yyyy-MM-dd"
        while i < parts.count {
            let p = parts[i]
            let lower = p.lowercased()
            if lower.hasPrefix("tag:") {
                let v = String(p.dropFirst(4)).trimmingCharacters(in: .whitespacesAndNewlines)
                if !v.isEmpty { tag = v }
                i += 1
                continue
            }
            if lower.hasPrefix("collection:") || lower.hasPrefix("folder:") {
                let dropCount = lower.hasPrefix("folder:") ? 7 : 11
                let v = String(p.dropFirst(dropCount)).trimmingCharacters(in: .whitespacesAndNewlines)
                if !v.isEmpty { folder = v }
                i += 1
                continue
            }
            if lower.hasPrefix("from:") {
                let v = String(p.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines)
                from = df.date(from: v)
                i += 1
                continue
            }
            if lower.hasPrefix("ref:") {
                var r = String(p.dropFirst(4)).trimmingCharacters(in: .whitespacesAndNewlines)
                i += 1
                while i < parts.count {
                    let n = parts[i]
                    let nl = n.lowercased()
                    if Self.spotlightFilterPrefixBreaksRefContinuation(nl) {
                        break
                    }
                    r += (r.isEmpty ? "" : " ") + n
                    i += 1
                }
                if !r.isEmpty { ref = r }
                continue
            }
            free.append(p)
            i += 1
        }
        let freeText = free.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return ParsedSpotlightQuery(freeText: freeText, tagFilter: tag, folderFilter: folder, refFilter: ref, fromDateFilter: from)
    }

    var body: some View {
        ZStack {
            // Dimmed backdrop — tap to dismiss
            Color.black.opacity(0.25)
                .ignoresSafeArea()
                .onTapGesture { dismiss() }

            VStack {
                Spacer().frame(height: 100)

                searchCard
                    .frame(width: 560)

                Spacer()
            }
        }
        .onAppear { fieldFocused = true }
        .onKeyPress(.escape) { dismiss(); return .handled }
        .onKeyPress(.return) { openHighlighted(); return .handled }
        .onKeyPress(.downArrow) {
            highlightedIndex = min(highlightedIndex + 1, results.count - 1)
            return .handled
        }
        .onKeyPress(.upArrow) {
            highlightedIndex = max(highlightedIndex - 1, 0)
            return .handled
        }
    }

    // MARK: - Search card

    private var searchCard: some View {
        VStack(spacing: 0) {
            // Search field
            HStack(spacing: 10) {
                HarvousFAGlyph(assetName: "Harvous.MagnifyingGlass", edgePt: 15)
                    .foregroundStyle(.secondary)

                TextField("Search notes, verses, tags… Use tag:, folder:, ref:, from:YYYY-MM-DD", text: $query)
                    .textFieldStyle(.plain)
                    .font(HarvousTypography.searchField)
                    .focused($fieldFocused)
                    .onChange(of: query) { _, _ in highlightedIndex = 0 }

                if !query.isEmpty {
                    Button { query = "" } label: {
                        HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 16)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)

            // Results
            if !results.isEmpty {
                Divider()
                resultsList
            } else if !query.isEmpty {
                Divider()
                emptyResults
            }
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.18), radius: 24, y: 8)
        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
    }

    // MARK: - Results

    private var resultsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(results.prefix(8).enumerated()), id: \.element.id) { idx, note in
                    resultRow(note: note, highlighted: idx == highlightedIndex)
                        .onTapGesture { open(note) }
                }
            }
            .padding(.vertical, 6)
        }
        .frame(maxHeight: 340)
    }

    private func resultRow(note: Note, highlighted: Bool) -> some View {
        HStack(spacing: 12) {
            if let folderChip = note.folderChipPrimaryLabelText(), !folderChip.isEmpty {
                HarvousFAGlyph(assetName: "Harvous.Folder", edgePt: 9)
                    .foregroundStyle(.secondary)
            } else {
                Circle().fill(Color.secondary.opacity(0.3)).frame(width: 7, height: 7)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(note.title.isEmpty ? "Untitled" : note.title)
                    .font(HarvousTypography.searchSpotlightTitle)
                    .lineLimit(1)

                if let ref = note.primaryRef {
                    Text(ref)
                        .font(HarvousTypography.searchSpotlightMeta)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            TimelineView(.periodic(from: .now, by: 30)) { context in
                Text(NoteRelativeTime.formatted(note.updatedAt, relativeTo: context.date, abbreviated: true))
                    .font(HarvousTypography.searchSpotlightMeta)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(highlighted ? Color.accentColor.opacity(0.10) : Color.clear)
    }

    private var emptyResults: some View {
        Text("No results for \"\(query)\"")
            .font(HarvousTypography.searchEmptyState)
            .foregroundStyle(.secondary)
            .padding(20)
    }

    // MARK: - Actions

    private func open(_ note: Note) {
        selectedNote = note
        dismiss()
    }

    private func openHighlighted() {
        guard !results.isEmpty else { return }
        open(results[min(highlightedIndex, results.count - 1)])
    }

    private func dismiss() {
        isPresented = false
        query = ""
    }
}

#Preview {
    SpotlightSearchView(isPresented: .constant(true), selectedNote: .constant(nil))
        .environmentObject(SpaceStore())
        .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
        .frame(width: 800, height: 600)
}

#endif
