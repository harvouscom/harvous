import SwiftData
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Right-side inspector panel — shown via `.inspector(isPresented:)`.
/// Displays tags and note metadata. Passage text is edited via the note action bar.
/// Collection edits use the toolbar collection chip popover.
struct NoteInspectorView: View {
    let note: Note
    /// Scrolls the editor to the first anchored mini capture (highlight) on this note.
    var onJumpToHighlightedCaptures: (() -> Void)? = nil
    @Environment(\.modelContext) private var modelContext
    @State private var draftTag = ""
    @State private var simpleNoteIdCopied = false
    @State private var historyExpanded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader("Tags")
                tagsSection

                Divider().padding(.vertical, 12)

                sectionHeader("Highlights")
                highlightsSection

                Divider().padding(.vertical, 12)

                sectionHeader("History")
                NoteHistorySection(note: note, isExpanded: $historyExpanded)

                Divider().padding(.vertical, 12)

                sectionHeader("Info")
                infoSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
    }

    // MARK: - Highlights (mini notes anchored in prose)

    @ViewBuilder
    private var highlightsSection: some View {
        let count = anchoredHighlightCount()
        if count == 0 {
            Text("Highlights you add from selected text appear here. None are anchored in this note yet.")
                .font(HarvousTypography.inspectorBody)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Button {
                onJumpToHighlightedCaptures?()
            } label: {
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: "note.text.badge.plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.harvousAccent)
                        .frame(width: 20, alignment: .center)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(highlightCountTitle(count))
                            .font(HarvousTypography.inspectorCompactMedium)
                            .foregroundStyle(.primary)
                        Text("Show in editor")
                            .font(HarvousTypography.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.leading)

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                        .rotationEffect(.degrees(-90))
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            .accessibilityHint("Scrolls to the first highlight in the note body")
        }
    }

    private func highlightCountTitle(_ count: Int) -> String {
        count == 1 ? "1 highlight" : "\(count) highlights"
    }

    private func anchoredHighlightCount() -> Int {
        let noteId = note.id
        let descriptor = FetchDescriptor<StudyThread>(predicate: #Predicate {
            thread in thread.parentNoteId == noteId && !thread.isArchived
        })

        guard let rows = try? modelContext.fetch(descriptor) else { return 0 }

        return rows.count {
            $0.entryKind == .miniNote && $0.hasPersistedHighlightAnchor
        }
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
        RemovableThemeTagChip(text: tag) {
            removeTag(tag)
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
                    .padding(.horizontal, 20)
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
            if let sid = note.simpleNoteId {
                infoSimpleNoteIdRow(displayText: simpleNoteIdCopied ? "Copied" : formatSimpleNoteId(sid))
            }
            infoRow("Created", value: note.createdAt.formatted(date: .abbreviated, time: .shortened))
            infoRow("Modified", value: note.updatedAt.formatted(date: .abbreviated, time: .shortened))
            infoRow("Reading", value: readingTimeLabel)
            infoRow("Words", value: wordCount)
            if let summary = scriptureSummary {
                infoRow("Scripture", value: summary)
            }
        }
        .padding(.top, 4)
    }

    private func infoSimpleNoteIdRow(displayText: String) -> some View {
        let clipboardText = note.simpleNoteId.map { formatSimpleNoteId($0) } ?? ""
        return HStack(alignment: .top) {
            Text("ID")
                .font(HarvousTypography.inspectorCompactMedium)
                .foregroundStyle(.secondary)
                .frame(width: 64, alignment: .leading)
            Button {
                copySimpleNoteIdToPasteboard(clipboardText)
            } label: {
                Text(displayText)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)
            .help("Copy note ID")
            .accessibilityLabel("Note ID")
            .accessibilityHint("Copies \(clipboardText) to the clipboard")
        }
    }

    private func formatSimpleNoteId(_ id: Int) -> String {
        String(format: "N%03d", id)
    }

    private func copySimpleNoteIdToPasteboard(_ text: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
        simpleNoteIdCopied = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.5))
            simpleNoteIdCopied = false
        }
    }

    private var readingTimeLabel: String {
        let words = wordCountInt
        if words == 0 { return "<1 min read" }
        if words < 50 { return "<1 min read" }
        let minutes = max(1, Int((Double(words) / 225.0).rounded()))
        return "\(minutes) min read"
    }

    private var scriptureSummary: String? {
        let refs = note.detectedRefs
        guard let first = refs.first else { return nil }
        return refs.count == 1 ? first : "\(first) +\(refs.count - 1) more"
    }

    private var wordCountInt: Int {
        note.body.split(whereSeparator: { $0.isWhitespace }).count
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
        let words = wordCountInt
        return "\(words) word\(words == 1 ? "" : "s")"
    }

    private func persistInspectorMutation() {
        try? modelContext.save()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
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
        persistInspectorMutation()
    }

    private func removeTag(_ tag: String) {
        note.tags.removeAll { $0 == tag }
        note.updatedAt = Date()
        persistInspectorMutation()
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
    note.detectedRefs = ["John 3:16", "Psalm 23"]
    note.simpleNoteId = 42
    return NoteInspectorView(note: note)
        .frame(width: 280)
        .modelContainer(for: [Note.self], inMemory: true)
}
