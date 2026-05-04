import SwiftData
import SwiftUI

/// Notes that link *to* the open note (inbound `linkedNote` markers).
struct RelatedNotesSheet: View {
    let targetNoteId: UUID
    let spaceId: UUID
    var onOpenSourceNote: (UUID) -> Void

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var markers: [StudyThread] = []

    var body: some View {
        NavigationStack {
            Group {
                if markers.isEmpty {
                    ContentUnavailableView {
                        Label("No related notes", systemImage: "link.badge.plus")
                    } description: {
                        Text("Other notes that link here will appear here.")
                            .font(HarvousTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    List {
                        ForEach(markers, id: \.id) { thread in
                            Button {
                                onOpenSourceNote(thread.parentNoteId)
                                dismiss()
                            } label: {
                                relatedRow(thread: thread)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Related notes")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .frame(minWidth: 320, minHeight: 280)
        .onAppear {
            reload()
        }
    }

    @ViewBuilder
    private func relatedRow(thread: StudyThread) -> some View {
        let parent = ThreadStore.fetchNote(id: thread.parentNoteId, modelContext: modelContext)
        let title = {
            let t = (parent?.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? "Untitled note" : t
        }()
        let snippet = snippetText(for: thread)
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(HarvousTypography.body)
                .fontWeight(.semibold)
                .foregroundStyle(.primary)
            if !snippet.isEmpty {
                Text(snippet)
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("\(title). \(snippet)")
    }

    private func snippetText(for thread: StudyThread) -> String {
        let s = thread.sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines)
        if !s.isEmpty { return String(s.prefix(200)) }
        let f = thread.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return f.isEmpty ? "" : String(f.prefix(200))
    }

    private func reload() {
        markers = ThreadStore.incomingLinkedNoteMarkers(
            targetNoteId: targetNoteId,
            spaceId: spaceId,
            modelContext: modelContext
        )
    }
}
