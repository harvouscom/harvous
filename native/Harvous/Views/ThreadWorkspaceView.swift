import SwiftData
import SwiftUI

/// Full deep-study surface for one thread (sections can grow Recall / Review / enrichment later).
struct ThreadWorkspaceView: View {
    let threadID: UUID

    @Environment(\.modelContext) private var modelContext
    @State private var thread: StudyThread?

    var body: some View {
        Group {
            if let thread {
                ThreadWorkspaceLoadedView(thread: thread)
            } else {
                ContentUnavailableView {
                    Label("Thread not found", systemImage: "bubble.left.and.bubble.right")
                } description: {
                    Text("It may have been removed or archived.")
                }
            }
        }
        .navigationTitle("Thread")
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
            .task(id: threadID) {
                thread = ThreadStore.fetch(id: threadID, modelContext: modelContext)
            }
    }
}

private struct ThreadWorkspaceLoadedView: View {
    @Bindable var thread: StudyThread
    @Environment(\.modelContext) private var modelContext

    @State private var saveTask: Task<Void, Never>?

    private var questionsPlaceholder: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Suggested questions live here.")
                .font(HarvousTypography.caption)
                .foregroundStyle(.secondary)
            Text("Coming soon.")
                .font(HarvousTypography.body)
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
    }

    private var resourcesPlaceholder: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Link passages and study resources here.")
                .font(HarvousTypography.caption)
                .foregroundStyle(.secondary)
            Text("Coming soon.")
                .font(HarvousTypography.body)
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
    }

    private var recallReviewPlaceholder: some View {
        HStack(spacing: 14) {
            Label("Recall", systemImage: "clock.arrow.circlepath")
                .font(HarvousTypography.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
            Label("Review", systemImage: "checkmark.circle")
                .font(HarvousTypography.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
        }
        .padding(12)
        .background(Color.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                sectionHeader("Source")
                Text(thread.sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines))
                    .font(HarvousTypography.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                sectionHeader("Focus")
                TextField("Title or framing question", text: $thread.focusTitle)
                    .font(HarvousTypography.noteCardTitle)
                    .textFieldStyle(.plain)
                    .padding(14)
                    .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: HarvousRadius.input, style: .continuous))
                    .onChange(of: thread.focusTitle) { _, _ in scheduleSave() }

                sectionHeader("Notes")
                TextEditor(text: $thread.notesBody)
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
                    .onChange(of: thread.notesBody) { _, _ in scheduleSave() }

                sectionHeader("Questions")
                questionsPlaceholder

                sectionHeader("Resources")
                resourcesPlaceholder

                sectionHeader("Recall and review")
                recallReviewPlaceholder

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
            ThreadStore.save(thread, modelContext: modelContext)
            ThreadStore.touchParentNoteIfNeeded(thread, modelContext: modelContext)
        }
    }
}
