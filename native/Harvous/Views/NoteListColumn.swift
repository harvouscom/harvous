import SwiftUI
import SwiftData

/// The note list column — Apple Notes-style rows.
struct NoteListColumn: View {
    var filter: NoteFilter = .all
    @Binding var selectedNote: Note?
    /// Called when the user taps the compose button.
    /// On macOS: immediately creates a note in-place (Apple Notes style).
    /// On iOS: typically triggers a sheet.
    var onNewNote: () -> Void = {}

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var context
    @Environment(\.colorScheme) private var colorScheme

    @State private var searchText = ""

    // MARK: - Filtered notes

    private var baseNotes: [Note] {
        switch filter {
        case .all:
            return notes
        }
    }

    private var filtered: [Note] {
        guard !searchText.isEmpty else { return baseNotes }
        let q = searchText.lowercased()
        return baseNotes.filter {
            $0.title.lowercased().contains(q) ||
            $0.body.lowercased().contains(q) ||
            $0.detectedRefs.contains(where: { $0.lowercased().contains(q) }) ||
            $0.tags.contains(where: { $0.lowercased().contains(q) }) ||
            ($0.primaryCollection?.lowercased().contains(q) ?? false)
        }
    }

    private enum Metrics {
        /// Insets the selection pill from the sidebar edges (glass column).
        static let selectionHPadding: CGFloat = 8
        static let selectionVPadding: CGFloat = 2
        /// Inset from window **leading** only so the darker vertical bezel shows; **top is 0** so glass runs flush under the unified title bar / traffic lights.
        static let sidebarWindowBezelInsetLeading: CGFloat = 1
        static let sidebarWindowBezelInsetTop: CGFloat = 0
    }

    // MARK: - Body

    var body: some View {
        Group {
            #if os(macOS)
            mainContent
                .background {
                    GeometryReader { proxy in
                        let lead = Metrics.sidebarWindowBezelInsetLeading
                        let top = Metrics.sidebarWindowBezelInsetTop
                        let w = proxy.size.width
                        let h = proxy.size.height
                        macOSSidebarChromeBackground()
                            .frame(width: max(0, w - lead), height: max(0, h - top))
                            .padding(.top, top)
                            .padding(.leading, lead)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            .clipShape(macOSSidebarChromeShape())
                    }
                    .ignoresSafeArea()
                }
            #else
            Group { mainContent }
                .background(Color(.systemGroupedBackground))
            #endif
        }
        #if os(macOS)
        .toolbarBackground(.clear, for: .automatic)
        .modifier(HarvousSidebarTransparentWindowToolbar())
        .navigationTitle("")
        #else
        .navigationTitle(filter.displayName)
        #endif
        #if os(iOS)
        .searchable(text: $searchText, prompt: "Search")
        .autocorrectionDisabled(true)
        .textInputAutocapitalization(.never)
        #endif
        #if os(macOS)
        .searchable(text: $searchText, placement: .sidebar, prompt: "Search")
        #endif
        #if os(iOS)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: onNewNote) {
                    Image(systemName: "square.and.pencil")
                }
                .help("New Note")
            }
        }
        #endif
    }

    private var mainContent: some View {
        Group {
            if filtered.isEmpty && baseNotes.isEmpty {
                emptyState
            } else if filtered.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                noteList
            }
        }
    }

    // MARK: - macOS sidebar chrome

    #if os(macOS)
    /// Leading bottom corner matches the window; **top leading stays square** so clipping doesn’t eat glass under the unified title bar / traffic lights.
    private func macOSSidebarChromeShape() -> UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 0,
            bottomLeadingRadius: HarvousRadius.sidebarGlassLeading,
            bottomTrailingRadius: 0,
            topTrailingRadius: 0,
            style: .continuous
        )
    }

    /// Liquid Glass on Tahoe (macOS 26+); earlier releases use `Material` so the column still blurs wallpaper.
    @ViewBuilder
    private func macOSSidebarChromeBackground() -> some View {
        let shape = macOSSidebarChromeShape()
        if #available(macOS 26.0, *) {
            shape
                .fill(Color.clear)
                .glassEffect(in: shape)
        } else {
            shape
                .fill(.ultraThinMaterial)
        }
    }
    #endif

    // MARK: - Note list

    @ViewBuilder
    private func noteSelectionBackground(isSelected: Bool) -> some View {
        if isSelected {
            selectionHighlightPill
                .padding(.horizontal, Metrics.selectionHPadding)
                .padding(.vertical, Metrics.selectionVPadding)
        } else {
            Color.clear
        }
    }

    @ViewBuilder
    private var selectionHighlightPill: some View {
        #if os(macOS)
        if #available(macOS 26.0, *) {
            RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                .fill(Color.clear)
                .glassEffect(in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
                .overlay {
                    if colorScheme == .dark {
                        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                            .fill(Color.white.opacity(0.07))
                    }
                }
        } else {
            RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                .fill(.thinMaterial)
                .overlay {
                    if colorScheme == .dark {
                        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                            .fill(Color.white.opacity(0.06))
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                        .strokeBorder(Color.primary.opacity(colorScheme == .dark ? 0.06 : 0.08), lineWidth: 0.5)
                }
        }
        #else
        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay {
                RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 0.5)
            }
        #endif
    }

    private var noteList: some View {
        List {
            ForEach(filtered) { note in
                let isSelected = selectedNote?.id == note.id
                NoteRow(note: note)
                    .listRowInsets(EdgeInsets(top: 5, leading: 10, bottom: 5, trailing: 10))
                    .listRowBackground(noteSelectionBackground(isSelected: isSelected))
                    .listRowSeparator(.hidden)
                    .onTapGesture { selectedNote = note }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            withAnimation {
                                if selectedNote?.id == note.id { selectedNote = nil }
                                let nid = note.id
                                context.delete(note)
                                try? context.save()
                                HarvousRecallOSIntegration.afterNoteDeleted(id: nid, modelContext: context)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Notes", systemImage: "note.text")
        } description: {
            Text("Tap the compose button to write your first note.")
        }
    }
}

#if os(macOS)
/// Hides the default window toolbar backdrop so sidebar glass reads continuously under the traffic lights (macOS 15+).
struct HarvousSidebarTransparentWindowToolbar: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) {
            content.toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
        } else {
            content
        }
    }
}
#endif

// MARK: - Note row (Apple Notes style)

struct NoteRow: View {
    let note: Note

    /// Refresh periodically so “just now” / “N minutes ago” stays accurate without polling timers elsewhere.
    private static let timelineInterval: TimeInterval = 30

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            // Title
            Text(note.title.isEmpty ? "New Note" : note.title)
                .font(HarvousTypography.noteListTitle)
                .lineLimit(1)
                .foregroundStyle(.primary)

            // Relative time + excerpt
            TimelineView(.periodic(from: .now, by: Self.timelineInterval)) { context in
                HStack(spacing: 0) {
                    Text(NoteRelativeTime.formatted(note.updatedAt, relativeTo: context.date))
                        .font(HarvousTypography.noteListPreview)
                        .foregroundStyle(.secondary)

                    if !note.excerpt.isEmpty {
                        Text("  ")
                        Text(note.excerpt)
                            .font(HarvousTypography.noteListPreview)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }

        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

#Preview {
    NoteListColumn(selectedNote: .constant(nil))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(width: 300, height: 600)
}
