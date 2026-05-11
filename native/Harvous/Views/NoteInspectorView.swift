import SwiftData
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Right-side inspector panel — shown via `.inspector(isPresented:)`.
/// Displays tags and note metadata. Passage text is edited via the note action bar.
/// Folder edits use the toolbar folder chip popover.
struct NoteInspectorView: View {
    let note: Note
    @Environment(\.modelContext) private var modelContext
    @State private var draftTag = ""
    @State private var simpleNoteIdCopied = false
    @State private var allResourceLines: [String] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader("Tags")
                tagsSection

                if !note.detectedRefs.isEmpty {
                    Divider().padding(.vertical, 12)
                    sectionHeader("Scripture")
                    scriptureRefSection
                }

                if !allResourceLines.isEmpty {
                    Divider().padding(.vertical, 12)
                    sectionHeader("Sources")
                    sourcesSection
                }

                Divider().padding(.vertical, 12)

                sectionHeader("Info")
                infoSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
        .task(id: note.id) { loadResourceLines() }
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
                    ForEach(note.tags.uniquedPreservingOrder(), id: \.self) { tag in
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

    // MARK: - Scripture references

    @ViewBuilder
    private var scriptureRefSection: some View {
        FlowLayout(spacing: 6) {
            ForEach(note.detectedRefs.uniquedPreservingOrder(), id: \.self) { ref in
                Text(ref)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.primary)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(
                        Capsule(style: .continuous)
                            .fill(Color.primary.opacity(0.07))
                    )
                    .overlay(
                        Capsule(style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
                    )
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Sources (resource lines from study threads)

    @ViewBuilder
    private var sourcesSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(allResourceLines, id: \.self) { line in
                if let url = URL(string: line), url.scheme?.hasPrefix("http") == true {
                    Link(destination: url) {
                        Text(line)
                            .font(HarvousTypography.inspectorCompact)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text(line)
                        .font(HarvousTypography.inspectorCompact)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(.top, 4)
    }

    @MainActor
    private func loadResourceLines() {
        let nid = note.id
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in t.parentNoteId == nid && !t.isArchived }
        )
        let threads = (try? modelContext.fetch(descriptor)) ?? []
        allResourceLines = threads.flatMap(\.resourceLines).filter { !$0.isEmpty }
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
        try? modelContext.saveWithLogging()
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

private extension Array where Element: Hashable {
    /// Removes duplicates while preserving the order of first occurrence. Defensive guard for SwiftUI
    /// `ForEach(_, id: \.self)` over `Note.detectedRefs` / `Note.tags`: legacy notes can hold duplicates
    /// (e.g. a VOTD note where the same reference appears in body more than once). Duplicate IDs put
    /// SwiftUI's diff into "undefined results" mode and have manifested as note-switch hangs.
    func uniquedPreservingOrder() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
