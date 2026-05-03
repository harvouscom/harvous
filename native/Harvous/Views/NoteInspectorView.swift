import SwiftUI
import SwiftData

/// Right-side inspector panel — shown via `.inspector(isPresented:)`.
/// Displays tags and note metadata. Passage text is edited via the note action bar.
struct NoteInspectorView: View {
    let note: Note
    var onJumpToAnchoredHighlight: ((StudyThread.EntryKind) -> Void)? = nil
    @Environment(\.modelContext) private var modelContext
    @State private var draftCollection = ""
    @State private var draftTag = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader("Collection")
                collectionSection

                Divider().padding(.vertical, 12)

                sectionHeader("Tags")
                tagsSection

                Divider().padding(.vertical, 12)

                sectionHeader("Anchored Highlights")
                highlightsSection

                Divider().padding(.vertical, 12)

                sectionHeader("Info")
                infoSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
        .onAppear {
            draftCollection = note.primaryCollection ?? ""
        }
        .onChange(of: note.primaryCollection) { _, newValue in
            let normalizedDraft = draftCollection.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedNote = (newValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            // Keep the field aligned with live auto-generated collection updates unless
            // the user is actively editing a different in-flight value.
            if normalizedDraft.isEmpty || normalizedDraft == normalizedNote {
                draftCollection = newValue ?? ""
            }
        }
    }

    private var collectionSection: some View {
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
                        try? modelContext.save()
                    }
                )) {
                    Text("Keep this collection")
                        .font(HarvousTypography.inspectorCompactMedium)
                }
                .toggleStyle(.switch)
                .controlSize(.regular)

                Text("When on, auto-collection won't update this note.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if note.isCollectionUserOverride {
                Text("Manual name is set. Auto-collection won't replace it until you clear.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 14)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.secondary.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
        )
        .padding(.top, 2)
    }

    private var collectionEditorRow: some View {
        HStack(spacing: 0) {
            TextField("No collection", text: $draftCollection)
                .textFieldStyle(.plain)
                .font(HarvousTypography.body)
                .padding(.leading, 12)
                .padding(.trailing, 84)
                .frame(height: 40)
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

    /// Manual vs auto source for the collection field (does not duplicate the pinned toggle).
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

    // MARK: - Anchored Highlights

    @ViewBuilder
    private var highlightsSection: some View {
        let counts = highlightCounts()
        if counts.miniCount == 0, counts.linkedCount == 0, counts.scriptCount == 0 {
            Text("No highlights anchored in this prose yet.")
                .font(HarvousTypography.inspectorBody)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            VStack(spacing: 8) {
                highlightRow(kind: .miniNote, icon: "note.text.badge.plus", count: counts.miniCount)
                highlightRow(kind: .linkedNote, icon: "arrow.triangle.branch", count: counts.linkedCount)
                highlightRow(kind: .scriptureLink, icon: "book.closed", count: counts.scriptCount)
            }
            .padding(.top, 4)
        }
    }

    private func highlightRow(kind: StudyThread.EntryKind, icon: String, count: Int) -> some View {
        Button {
            onJumpToAnchoredHighlight?(kind)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 18, alignment: .center)

                Text(highlightPluralLabel(kind, count))
                    .font(HarvousTypography.inspectorCompact)
                    .multilineTextAlignment(.leading)

                Spacer(minLength: 0)

                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .rotationEffect(.degrees(-90))
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .foregroundStyle(Color.primary.opacity(count == 0 ? 0.45 : 0.95))
        }
        .buttonStyle(.plain)
        .disabled(count == 0)
        .accessibilityHint("Opens the editor at the highlight")
    }

    private func highlightPluralLabel(_ kind: StudyThread.EntryKind, _ count: Int) -> String {
        switch kind {
        case .miniNote:
            return count == 1 ? "1 mini note" : "\(count) mini notes"
        case .linkedNote:
            return count == 1 ? "1 connected note" : "\(count) connected notes"
        case .scriptureLink:
            return count == 1 ? "1 scripture link" : "\(count) scripture links"
        default:
            return "\(count) highlights"
        }
    }

    private func highlightCounts() -> (miniCount: Int, linkedCount: Int, scriptCount: Int) {
        let noteId = note.id
        let descriptor = FetchDescriptor<StudyThread>(predicate: #Predicate {
            thread in thread.parentNoteId == noteId && !thread.isArchived
        })

        guard let rows = try? modelContext.fetch(descriptor) else {
            return (0, 0, 0)
        }

        func count(kind: StudyThread.EntryKind) -> Int {
            rows.count { StudyThread.anchoredHighlightKinds.contains($0.entryKind) && $0.entryKind == kind && $0.hasPersistedHighlightAnchor }
        }

        return (count(kind: .miniNote), count(kind: .linkedNote), count(kind: .scriptureLink))
    }

    // MARK: - Tags (theme / keyword; not scripture)

    @ViewBuilder
    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if note.tags.isEmpty {
                Text("No tags")
                    .font(HarvousTypography.inspectorBody)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            } else {
                FlowLayout(spacing: 6) {
                    ForEach(note.tags, id: \.self) { tag in
                        tagChip(tag)
                    }
                }
                .padding(.top, 4)
            }

            addTagRow
        }
    }

    private func tagChip(_ tag: String) -> some View {
        HStack(spacing: 0) {
            ThemeTagChip(text: tag)

            Button {
                removeTag(tag)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .frame(width: 22, height: 22)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Remove tag")
            .accessibilityLabel("Remove tag \(tag)")
            .padding(.leading, 2)
        }
    }

    private var addTagRow: some View {
        HStack(spacing: 8) {
            TextField("Add tag", text: $draftTag)
                .textFieldStyle(.plain)
                .font(HarvousTypography.inspectorBody)
                .padding(.horizontal, 10)
                .frame(height: 34)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.secondary.opacity(0.08))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                )
                .onSubmit { addDraftTag() }

            Button {
                addDraftTag()
            } label: {
                Text("Add")
                    .font(HarvousTypography.inspectorCompactMedium)
                    .padding(.horizontal, 10)
                    .frame(height: 34)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Color.harvousAccent)
                    )
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .help("Add tag")
            .accessibilityLabel("Add tag")
        }
    }

    // MARK: - Info

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            infoRow("Created", value: note.createdAt.formatted(date: .abbreviated, time: .shortened))
            infoRow("Modified", value: note.updatedAt.formatted(date: .abbreviated, time: .shortened))
            infoRow("Words", value: wordCount)
        }
        .padding(.top, 4)
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(HarvousTypography.inspectorCompactMedium)
                .foregroundStyle(.secondary)
                .frame(width: 64, alignment: .leading)
            Text(value)
                .font(HarvousTypography.inspectorCompact)
                .foregroundStyle(.primary)
        }
    }

    private var wordCount: String {
        let words = note.body.split(separator: " ").count
        return "\(words) word\(words == 1 ? "" : "s")"
    }

    private func clearCollection() {
        draftCollection = ""
        note.primaryCollection = nil
        note.isCollectionUserOverride = false
        note.isCollectionPinned = false
        note.collectionAutoConfidence = nil
        note.collectionLastAutoUpdatedAt = nil
        try? modelContext.save()
    }

    private func applyAutoSuggestedCollection() {
        guard let autoSuggestedCollection else { return }
        draftCollection = autoSuggestedCollection
        note.primaryCollection = autoSuggestedCollection
        note.isCollectionUserOverride = false
        note.isCollectionPinned = false
        note.collectionLastAutoUpdatedAt = Date()
        try? modelContext.save()
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
        try? modelContext.save()
    }

    private func addDraftTag() {
        let trimmed = draftTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard !note.tags.contains(where: { $0.caseInsensitiveCompare(trimmed) == .orderedSame }) else {
            draftTag = ""
            return
        }

        note.tags.append(trimmed)
        note.updatedAt = Date()
        draftTag = ""
        try? modelContext.save()
    }

    private func removeTag(_ tag: String) {
        note.tags.removeAll { $0 == tag }
        note.updatedAt = Date()
        try? modelContext.save()
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(HarvousTypography.inspectorSectionLabel)
            .foregroundStyle(.secondary)
            .tracking(0.8)
            .padding(.bottom, 6)
    }
}

// MARK: - Simple flow layout for pills/tags

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let width = proposal.width ?? 200
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > width && currentX > 0 {
                currentX = 0
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, currentX)
        }

        return CGSize(width: maxX, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: currentX, y: currentY), proposal: ProposedViewSize(size))
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

#Preview {
    let note = Note(title: "Test Note", body: "John 3:16 is a beautiful verse.")
    note.tags = ["Faith", "Love"]
    return NoteInspectorView(note: note)
        .frame(width: 280)
        .modelContainer(for: [Note.self], inMemory: true)
}
