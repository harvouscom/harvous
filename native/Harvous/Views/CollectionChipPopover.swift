import SwiftData
import SwiftUI

/// Popover content for renaming, locking, and clearing `note.primaryCollection`.
struct CollectionChipPopover: View {
    @Bindable var note: Note

    @Environment(\.modelContext) private var modelContext
    @State private var draftCollection = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            collectionSourceBadge

            collectionEditorRow

            if canUseAutoSuggestion {
                Button {
                    applyAutoSuggestedCollection()
                } label: {
                    Label("Use auto suggestion", systemImage: "arrow.uturn.backward.circle")
                        .font(HarvousTypography.inspectorCompactMedium)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Restore the current auto-suggested collection")
                .accessibilityLabel("Use auto suggested collection")
            }

            Divider()
                .opacity(0.45)

            VStack(alignment: .leading, spacing: 6) {
                Toggle(isOn: Binding(
                    get: { note.isCollectionPinned },
                    set: { newValue in
                        note.isCollectionPinned = newValue
                        persist()
                    }
                )) {
                    Text("Lock this name")
                        .font(HarvousTypography.inspectorCompactMedium)
                }
                .toggleStyle(.switch)
                .controlSize(.regular)

                Text("When on, Harvous won't change this name automatically.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if note.isCollectionUserOverride {
                Text("Manual name is set. Tap “Use auto suggestion” to follow Harvous again.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()
                .opacity(0.45)

            Button(role: .destructive) {
                clearCollection()
            } label: {
                Label("Remove collection", systemImage: "trash")
                    .font(HarvousTypography.inspectorCompactMedium)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(width: 300)
        .onAppear {
            draftCollection = note.primaryCollection ?? ""
        }
        .onChange(of: note.primaryCollection) { _, newValue in
            let normalizedDraft = draftCollection.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedNote = (newValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if normalizedDraft.isEmpty || normalizedDraft == normalizedNote {
                draftCollection = newValue ?? ""
            }
        }
        #if os(iOS)
        .presentationCompactAdaptation(.popover)
        #endif
    }

    // MARK: - Subviews

    private var collectionEditorRow: some View {
        HStack(spacing: 0) {
            TextField("No collection", text: $draftCollection)
                .textFieldStyle(.plain)
                .font(HarvousTypography.body)
                .frame(maxWidth: .infinity, minHeight: 40, maxHeight: 40)
                .padding(.leading, 12)
                .padding(.trailing, 84)
                .onSubmit { applyCollectionDraft() }
        }
        .frame(maxWidth: .infinity, minHeight: 40)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color.secondary.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .overlay(alignment: .trailing) {
            HStack(spacing: 6) {
                Button {
                    applyCollectionDraft()
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.harvousAccent)
                )
                .help("Apply collection")
                .accessibilityLabel("Apply collection")

                Button {
                    clearCollection()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary.opacity(0.85))
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.secondary.opacity(0.16))
                )
                .help("Clear collection")
                .accessibilityLabel("Clear collection")
            }
            .padding(.trailing, 6)
        }
    }

    private var collectionSourceBadge: some View {
        HStack(spacing: 8) {
            Image(systemName: note.isCollectionUserOverride ? "person.crop.circle.badge.checkmark" : "sparkles")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(note.isCollectionUserOverride ? Color.harvousAccent : .secondary)

            Text(note.isCollectionUserOverride ? "Manual" : "Automatic")
                .font(HarvousTypography.inspectorCompactMedium)

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(note.isCollectionUserOverride ? "Collection source: manual" : "Collection source: automatic")
    }

    // MARK: - Computed

    private var normalizedCurrentCollection: String? {
        let trimmed = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private var autoSuggestedCollection: String? {
        let candidate = BibleStudyTagSuggester.result(title: note.title, body: note.body).primaryCollection
        let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private var canUseAutoSuggestion: Bool {
        guard let autoSuggestedCollection else { return false }
        if note.isCollectionUserOverride || note.isCollectionPinned { return true }
        guard let current = normalizedCurrentCollection else { return true }
        return current.caseInsensitiveCompare(autoSuggestedCollection) != .orderedSame
    }

    // MARK: - Mutations

    private func persist() {
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
    }

    private func clearCollection() {
        draftCollection = ""
        note.primaryCollection = nil
        note.isCollectionUserOverride = false
        note.isCollectionPinned = false
        note.collectionAutoConfidence = nil
        note.collectionLastAutoUpdatedAt = nil
        persist()
    }

    private func applyAutoSuggestedCollection() {
        guard let autoSuggestedCollection else { return }
        draftCollection = autoSuggestedCollection
        note.primaryCollection = autoSuggestedCollection
        note.isCollectionUserOverride = false
        note.isCollectionPinned = false
        note.collectionLastAutoUpdatedAt = Date()
        persist()
    }

    private func applyCollectionDraft() {
        let trimmed = draftCollection.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            clearCollection()
            return
        } else {
            note.primaryCollection = trimmed
            note.isCollectionUserOverride = true
            note.isCollectionPinned = true
            note.collectionAutoConfidence = nil
            note.collectionLastAutoUpdatedAt = nil
        }
        persist()
    }
}
