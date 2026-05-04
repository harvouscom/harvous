import SwiftUI
import SwiftData

/// Quick actions surfaced from selection thread popover.
enum StudyThreadQuickOption: String, CaseIterable, Identifiable {
    case focus
    case question
    case resource

    var id: String { rawValue }

    var title: String {
        switch self {
        case .focus: return "Focus"
        case .question: return "Question"
        case .resource: return "Resource"
        }
    }

    var detail: String {
        switch self {
        case .focus: return "Set the focus line for linked notes"
        case .question: return "Add a guiding question"
        case .resource: return "Attach a URL or citation"
        }
    }

    var symbolName: String {
        switch self {
        case .focus: return "scope"
        case .question: return "questionmark.bubble"
        case .resource: return "link"
        }
    }
}

/// Lightweight inline continuation after picking a thread option (not full workspace).
struct ThreadQuickOptionsPanel: View {
    @Environment(\.modelContext) private var modelContext

    @Bindable var thread: StudyThread
    let option: StudyThreadQuickOption
    var onDismiss: () -> Void
    /// Optional push to full linked-notes surface while keeping pills as alternate entry too.
    var onOpenWorkspace: ((UUID) -> Void)?

    @State private var questionDraft = ""
    @State private var resourceDraft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: option.symbolName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(option.title)
                        .font(HarvousTypography.noteCardTitle)
                    Text(option.detail)
                        .font(HarvousTypography.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)

                if let onOpenWorkspace {
                    Button("Open linked notes…") {
                        onOpenWorkspace(thread.id)
                        onDismiss()
                    }
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
                    .buttonStyle(.plain)
                }

                Button("Done") {
                    persistThreadFields()
                    onDismiss()
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }

            Text(thread.sourceExcerptForList)
                .font(HarvousTypography.caption)
                .foregroundStyle(.tertiary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(3)

            switch option {
            case .focus:
                TextField("Focus title…", text: $thread.focusTitle, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(HarvousTypography.body)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
                    .onChange(of: thread.focusTitle) { _, _ in persistThreadFields() }

            case .question:
                TextField("Write a guiding question…", text: $questionDraft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(HarvousTypography.body)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
                    .submitLabel(.done)
                    .onSubmit { appendQuestionFromDraft() }

                Button("Add question") {
                    appendQuestionFromDraft()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(questionDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if !thread.suggestedQuestions.isEmpty {
                    questionListEditor
                }

            case .resource:
                TextField("Paste URL or resource note…", text: $resourceDraft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(HarvousTypography.body)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight, style: .continuous))
                    .submitLabel(.done)
                    .onSubmit { appendResourceFromDraft() }

                Button("Add resource") {
                    appendResourceFromDraft()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(resourceDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if !thread.resourceLines.isEmpty {
                    resourceListEditor
                }
            }
        }
        .padding(14)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight + 4, style: .continuous))
        .accessibilityLabel("Linked notes, \(option.title)")
        .accessibilityHint("Edit linked note details")
    }

    @ViewBuilder
    private var questionListEditor: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(thread.suggestedQuestions, id: \.self) { question in
                HStack(spacing: 8) {
                    Text(question)
                        .font(HarvousTypography.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Button(role: .destructive) {
                        guard let idx = thread.suggestedQuestions.firstIndex(of: question) else { return }
                        thread.suggestedQuestions.remove(at: idx)
                        persistThreadFields()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private var resourceListEditor: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(thread.resourceLines, id: \.self) { line in
                HStack(spacing: 8) {
                    Text(line)
                        .font(HarvousTypography.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    Button(role: .destructive) {
                        guard let idx = thread.resourceLines.firstIndex(of: line) else { return }
                        thread.resourceLines.remove(at: idx)
                        persistThreadFields()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func appendQuestionFromDraft() {
        let q = questionDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        thread.suggestedQuestions.append(q)
        questionDraft = ""
        persistThreadFields()
    }

    private func appendResourceFromDraft() {
        let r = resourceDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !r.isEmpty else { return }
        thread.resourceLines.append(r)
        resourceDraft = ""
        persistThreadFields()
    }

    private func persistThreadFields() {
        thread.updatedAt = Date()
        ThreadStore.touchParentNoteIfNeeded(thread, modelContext: modelContext)
        try? modelContext.save()
    }
}
