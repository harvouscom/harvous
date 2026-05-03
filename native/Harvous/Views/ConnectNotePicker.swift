import SwiftData
import SwiftUI

/// Search and pick a note to connect from the current note (note-level link, not highlight-anchored).
struct ConnectNotePicker: View {
    let spaceId: UUID
    let parentNoteId: UUID
    let onPick: (Note) -> Void
    let onCancel: () -> Void

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var query = ""
    @State private var matches: [Note] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Search notes…", text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 15, weight: .regular))
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.06)))
                .onChange(of: query) { _, _ in
                    reloadMatches()
                }
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                #endif

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(matches.prefix(6).enumerated()), id: \.element.id) { _, match in
                        Button {
                            onPick(match)
                            dismiss()
                        } label: {
                            Text(match.title.isEmpty ? "Untitled note" : match.title)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 10)
                                .padding(.horizontal, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .opacity(matches.isEmpty && !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
            }
            .overlay(alignment: .top) {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 1, matches.isEmpty {
                    Text("No notes match")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
            }

            #if os(macOS)
            HStack {
                Spacer()
                Button("Cancel") {
                    onCancel()
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
            }
            #endif
        }
        .padding(16)
        .frame(minWidth: 280, minHeight: 200)
        .onAppear {
            reloadMatches()
        }
    }

    private func reloadMatches() {
        let qRaw = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !qRaw.isEmpty else {
            matches = []
            return
        }
        guard let fetched = try? modelContext.fetch(FetchDescriptor<Note>()) else {
            matches = []
            return
        }
        matches =
            fetched
                .filter { $0.resolvedSpaceId() == spaceId && $0.id != parentNoteId && $0.title.localizedStandardContains(qRaw) }
                .sorted { $0.updatedAt > $1.updatedAt }
                .prefix(6)
                .map { $0 }
    }
}
