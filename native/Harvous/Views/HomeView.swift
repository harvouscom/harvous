import SwiftUI
import SwiftData

struct HomeView: View {
    @Binding var showCompose: Bool
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationStack {
            Group {
                if notes.isEmpty {
                    emptyState
                } else {
                    notesList
                }
            }
            .navigationTitle("Harvous")
            #if os(macOS)
            .navigationSubtitle("\(notes.count) note\(notes.count == 1 ? "" : "s")")
            #endif
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCompose = true
                    } label: {
                        Label("New Note", systemImage: "square.and.pencil")
                    }
                }
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "book.and.wrench")
                .font(.system(size: 48))
                .foregroundStyle(.quaternary)
            Text("Start with what you're reading.")
                .font(HarvousTypography.largeTitle)
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary)
            Text("Type a note and watch scripture references become interactive pills.")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            Button("Write your first note") { showCompose = true }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }

    // MARK: - Notes list

    private var notesList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(notes) { note in
                    NavigationLink {
                        NoteDetailView(note: note)
                    } label: {
                        NoteCardView(note: note)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) {
                            context.delete(note)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .opacity
                    ))
                }
            }
            .padding(16)
            .animation(HarvousAnimation.spring, value: notes.count)
        }
    }
}

#Preview {
    HomeView(showCompose: .constant(false))
        .modelContainer(for: [Note.self], inMemory: true)
}
