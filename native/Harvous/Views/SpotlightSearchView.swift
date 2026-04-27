import SwiftUI
import SwiftData

#if os(macOS)

/// ⌘K spotlight-style search overlay.
/// Presented over the full window. Dismiss with Escape or click outside.
struct SpotlightSearchView: View {
    @Binding var isPresented: Bool
    @Binding var selectedNote: Note?

    @Query private var notes: [Note]
    @State private var query = ""
    @State private var highlightedIndex = 0
    @FocusState private var fieldFocused: Bool

    private var results: [Note] {
        guard !query.isEmpty else { return [] }
        let q = query.lowercased()
        return notes.filter {
            $0.title.lowercased().contains(q) ||
            $0.body.lowercased().contains(q) ||
            $0.detectedRefs.contains(where: { $0.lowercased().contains(q) }) ||
            $0.tags.contains(where: { $0.lowercased().contains(q) })
        }
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
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 15))

                TextField("Search notes, verses, tags…", text: $query)
                    .textFieldStyle(.plain)
                    .font(HarvousTypography.searchField)
                    .focused($fieldFocused)
                    .onChange(of: query) { _, _ in highlightedIndex = 0 }

                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
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
            if let collection = note.primaryCollection, !collection.isEmpty {
                Image(systemName: "folder.fill")
                    .font(.system(size: 9))
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
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(width: 800, height: 600)
}

#endif
