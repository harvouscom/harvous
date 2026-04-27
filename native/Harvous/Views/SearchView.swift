import SwiftUI
import SwiftData

struct SearchView: View {
    @Query private var notes: [Note]
    @State private var query = ""

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
        NavigationStack {
            Group {
                if query.isEmpty {
                    emptyPrompt
                } else if results.isEmpty {
                    noResults
                } else {
                    resultsList
                }
            }
            .navigationTitle("Search")
            .searchable(text: $query, prompt: "Notes, verses, tags…")
            #if os(iOS)
            .autocorrectionDisabled(true)
            .textInputAutocapitalization(.never)
#endif
        }
    }

    private var emptyPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("Search your notes and scripture")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noResults: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.questionmark")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("No notes for \"\(query)\"")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var resultsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(results) { note in
                    NavigationLink { StatefulNoteEditorView(note: note) } label: { NoteCardView(note: note) }
                        .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
    }
}

#Preview {
    SearchView()
        .modelContainer(for: [Note.self], inMemory: true)
}
