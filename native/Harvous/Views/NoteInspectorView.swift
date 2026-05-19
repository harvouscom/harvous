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
    private enum FieldMetrics {
        static var rowHeight: CGFloat {
            #if os(iOS)
            48
            #else
            38
            #endif
        }

        static var trailingReserve: CGFloat {
            #if os(iOS)
            108
            #else
            84
            #endif
        }

        static var trailingButtonExtent: CGFloat {
            #if os(iOS)
            32
            #else
            26
            #endif
        }

        static var bodyFont: Font {
            #if os(iOS)
            HarvousTypography.body
            #else
            HarvousTypography.subheadline
            #endif
        }
    }

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
                FlowLayout(spacing: 8) {
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
        RemovableInspectorNeutralTagChip(text: tag) {
            removeTag(tag)
        }
    }

    private var addTagRow: some View {
        HStack(spacing: 0) {
            TextField("Add tag", text: $draftTag)
                .textFieldStyle(.plain)
                .font(FieldMetrics.bodyFont)
                .frame(
                    maxWidth: .infinity,
                    minHeight: FieldMetrics.rowHeight,
                    maxHeight: FieldMetrics.rowHeight
                )
                .padding(.leading, 16)
                .padding(.trailing, FieldMetrics.trailingReserve)
                .onSubmit { addDraftTag() }
        }
        .frame(maxWidth: .infinity, minHeight: FieldMetrics.rowHeight)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.secondary.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .overlay(alignment: .trailing) {
            HStack(spacing: 10) {
                Button {
                    addDraftTag()
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 13)
                        .frame(width: FieldMetrics.trailingButtonExtent, height: FieldMetrics.trailingButtonExtent)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.harvousAccent)
                )
                .disabled(draftTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .help("Add tag")
                .accessibilityLabel("Add tag")

                Button {
                    draftTag = ""
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 13)
                        .frame(width: FieldMetrics.trailingButtonExtent, height: FieldMetrics.trailingButtonExtent)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary.opacity(0.85))
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.secondary.opacity(0.16))
                )
                .help("Clear typed tag")
                .accessibilityLabel("Clear typed tag")
            }
            .padding(.trailing, 10)
        }
    }

    // MARK: - Scripture references

    /// Neutral grey capsules (same language as legacy inspector scripture rows) — not theme-gradient scripture blues.
    @ViewBuilder
    private var scriptureRefSection: some View {
        FlowLayout(spacing: 8) {
            ForEach(note.detectedRefs.uniquedPreservingOrder(), id: \.self) { ref in
                InspectorScriptureReferenceNeutralCapsule(reference: ref)
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

// MARK: - Note Details pills (neutral — not scripture-theme blues)

private enum InspectorDetailChipMetrics {
    /// Slightly larger than legacy 12pt inspector pills for readability while staying secondary UI.
    static var labelFont: Font {
        #if os(iOS)
        .system(size: 15, weight: .medium, design: .default)
        #else
        .system(size: 14, weight: .medium, design: .default)
        #endif
    }

    static let horizontalPadding: CGFloat = 12
    static let verticalPadding: CGFloat = 8
    static let capsuleFillOpacity: Double = 0.07
    static let capsuleStrokeOpacity: Double = 0.12
    static let rowIconSpacing: CGFloat = 6
    /// Sized up with `labelFont` (~15/14pt) so icons feel paired with the caps, not miniature.
    static var leadingGlyphPt: CGFloat {
        #if os(iOS)
        14
        #else
        13
        #endif
    }

    static var removeGlyphPt: CGFloat {
        #if os(iOS)
        12
        #else
        11
        #endif
    }

    /// Column for the leading tag glyph when the remove control is hidden.
    static var tagGlyphColumnWidth: CGFloat {
        #if os(iOS)
        18
        #else
        16
        #endif
    }
}

private struct InspectorScriptureReferenceNeutralCapsule: View {
    let reference: String

    var body: some View {
        HStack(spacing: InspectorDetailChipMetrics.rowIconSpacing) {
            HarvousFAGlyph(assetName: "Harvous.Bookmark", edgePt: InspectorDetailChipMetrics.leadingGlyphPt)
                .foregroundStyle(.secondary.opacity(0.75))
            Text(reference)
                .font(InspectorDetailChipMetrics.labelFont)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.leading)
        }
        .padding(.horizontal, InspectorDetailChipMetrics.horizontalPadding)
        .padding(.vertical, InspectorDetailChipMetrics.verticalPadding)
        .background(
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(InspectorDetailChipMetrics.capsuleFillOpacity))
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(
                    Color.primary.opacity(InspectorDetailChipMetrics.capsuleStrokeOpacity),
                    lineWidth: 0.5
                )
        )
    }
}

/// Same interaction model as `RemovableThemeTagChip`, styled like pre-theme neutral inspector pills.
private struct RemovableInspectorNeutralTagChip: View {
    let text: String
    let onRemove: () -> Void

    @State private var hoverRemoval = false
    @State private var tapRevealRemoval = false

    private var showRemoval: Bool { hoverRemoval || tapRevealRemoval }

    var body: some View {
        HStack(spacing: InspectorDetailChipMetrics.rowIconSpacing) {
            HarvousFAGlyph(assetName: "Harvous.Tag", edgePt: InspectorDetailChipMetrics.leadingGlyphPt)
                .foregroundStyle(.secondary.opacity(0.75))
                .frame(width: InspectorDetailChipMetrics.tagGlyphColumnWidth)
                .accessibilityHidden(true)

            Text(text)
                .font(InspectorDetailChipMetrics.labelFont)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .contentShape(Rectangle())
                .onTapGesture {
                    guard !hoverRemoval else { return }
                    withAnimation(.easeInOut(duration: 0.18)) {
                        tapRevealRemoval.toggle()
                    }
                }

            if showRemoval {
                Button {
                    onRemove()
                    tapRevealRemoval = false
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: InspectorDetailChipMetrics.removeGlyphPt)
                        .foregroundStyle(.primary.opacity(0.55))
                        .frame(width: InspectorDetailChipMetrics.tagGlyphColumnWidth)
                }
                .buttonStyle(.plain)
                .help("Remove tag")
                .accessibilityLabel("Remove tag \(text)")
                .transition(.opacity)
            }
        }
        .padding(.horizontal, InspectorDetailChipMetrics.horizontalPadding)
        .padding(.vertical, InspectorDetailChipMetrics.verticalPadding)
        .background(
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(InspectorDetailChipMetrics.capsuleFillOpacity))
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(
                    Color.primary.opacity(InspectorDetailChipMetrics.capsuleStrokeOpacity),
                    lineWidth: 0.5
                )
        )
        .animation(.easeInOut(duration: 0.18), value: showRemoval)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.18)) {
                hoverRemoval = hovering
                if hovering {
                    tapRevealRemoval = false
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tag \(text)")
        .accessibilityHint(showRemoval ? "Close icon is visible; activate it to remove this tag" : "Tag keyword")
        .accessibilityActions {
            Button("Remove tag", role: .destructive) {
                onRemove()
                tapRevealRemoval = false
            }
        }
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
