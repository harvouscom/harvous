import SwiftData
import SwiftUI

/// Full surface for editing a linked-notes entry anchored to prose (stored as `StudyThread`).
struct LinkedNotesView: View {
    let linkedNoteMarkerId: UUID

    @Environment(\.modelContext) private var modelContext
    @State private var entry: StudyThread?

    var body: some View {
        Group {
            if let entry {
                LinkedNotesLoadedView(entry: entry)
            } else {
                ContentUnavailableView {
                    Label("Linked notes not found", systemImage: "link")
                } description: {
                    Text("They may have been removed from this note.")
                }
            }
        }
        .navigationTitle("Linked notes")
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
            .task(id: linkedNoteMarkerId) {
                entry = ThreadStore.fetch(id: linkedNoteMarkerId, modelContext: modelContext)
            }
    }
}

private struct LinkedNotesLoadedView: View {
    @Bindable var entry: StudyThread
    @Environment(\.modelContext) private var modelContext

    @State private var saveTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                sectionHeader("Source")
                Text(entry.sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines))
                    .font(HarvousTypography.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                sectionHeader("Focus")
                TextField("Title or framing question", text: $entry.focusTitle)
                    .font(HarvousTypography.noteCardTitle)
                    .textFieldStyle(.plain)
                    .padding(14)
                    .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: HarvousRadius.input, style: .continuous))
                    .onChange(of: entry.focusTitle) { _, _ in scheduleSave() }

                sectionHeader("Notes")
                TextEditor(text: $entry.notesBody)
                    .font(HarvousTypography.body)
                    #if os(iOS)
                    .frame(minHeight: 180)
                    #else
                    .frame(minHeight: 220)
                    #endif
                    .scrollContentBackground(.hidden)
                    .padding(12)
                    .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: HarvousRadius.input, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: HarvousRadius.input, style: .continuous)
                            .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                    )
                    .onChange(of: entry.notesBody) { _, _ in scheduleSave() }

                Color.clear.frame(height: 28)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(HarvousFonts.font(size: 11, weight: .semibold, design: .default))
            .foregroundStyle(.tertiary)
            .tracking(0.4)
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            ThreadStore.save(entry, modelContext: modelContext)
            ThreadStore.touchParentNoteIfNeeded(entry, modelContext: modelContext)
        }
    }
}
