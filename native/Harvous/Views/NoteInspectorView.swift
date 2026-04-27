import SwiftUI
import SwiftData

/// Right-side inspector panel — shown via `.inspector(isPresented:)`.
/// Displays tags and note metadata. Passage text is edited via the note action bar.
struct NoteInspectorView: View {
    let note: Note

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader("Tags")
                tagsSection

                Divider().padding(.vertical, 12)

                sectionHeader("Info")
                infoSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
    }

    // MARK: - Tags (theme / keyword; not scripture)

    @ViewBuilder
    private var tagsSection: some View {
        if note.tags.isEmpty {
            Text("No tags")
                .font(HarvousTypography.inspectorBody)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        } else {
            FlowLayout(spacing: 6) {
                ForEach(note.tags, id: \.self) { tag in
                    ThemeTagChip(text: tag)
                }
            }
            .padding(.top, 4)
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
