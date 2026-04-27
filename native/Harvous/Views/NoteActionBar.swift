import SwiftUI

#if os(macOS)

/// Always-visible bottom bar — note-level context and actions.
struct NoteActionBar: View {
    let note: Note

    var body: some View {
        VStack(spacing: 0) {
            Color(nsColor: .separatorColor).frame(height: 0.5)

            HStack(spacing: 16) {
                collectionChip
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .frame(height: 44)
        }
        .background(.regularMaterial)
    }

    // MARK: - Collection chip (theme / subject only)

    @ViewBuilder
    private var collectionChip: some View {
        if let collection = note.primaryCollection, !collection.isEmpty {
            HStack(spacing: 7) {
                Image(systemName: "folder.fill")
                    .font(.system(size: 14))
                Text(collection)
                    .font(HarvousTypography.actionBarChip)
            }
            .foregroundStyle(.secondary)
        } else {
            Text("No collection")
                .font(HarvousTypography.actionBarMeta)
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    let note = Note(title: "Test", body: "Faith and grace in Paul’s letters.")
    note.primaryCollection = "Faith"
    return NoteActionBar(note: note)
        .frame(width: 600)
        .modelContainer(for: [Note.self], inMemory: true)
}

#endif
