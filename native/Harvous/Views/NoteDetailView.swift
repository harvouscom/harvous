import SwiftUI

struct NoteDetailView: View {
    @Bindable var note: Note
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var editorState: EditorState
    @State private var isEditing = false

    init(note: Note) {
        self.note = note
        _editorState = State(initialValue: EditorState(
            plainText: note.body,
            detectedRefs: note.detectedRefs
        ))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Title
                if !note.title.isEmpty {
                    Text(note.title)
                        .font(HarvousTypography.largeTitle)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Thread badge
                if let color = note.color {
                    HStack(spacing: 6) {
                        Circle().fill(color).frame(width: 10, height: 10)
                        Text(note.threadName ?? "Study")
                            .font(HarvousTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Divider()

                // Body — read-only rich display with refs
                if note.detectedRefs.isEmpty {
                    Text(note.body)
                        .font(HarvousTypography.body)
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Text(note.body)
                        .font(HarvousTypography.body)
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    // Scripture refs as tappable pills
                    FlowLayout(spacing: 8) {
                        ForEach(note.detectedRefs, id: \.self) { ref in
                            Menu {
                                ForEach(ScriptureReference.availableTranslations, id: \.self) { t in
                                    Button(t) { /* translation switch — stubbed */ }
                                }
                            } label: {
                                Label(ref, systemImage: "book.closed")
                                    .font(HarvousTypography.caption)
                                    .foregroundStyle(Color.harvousAccent)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Color.harvousAccent.opacity(0.08), in: Capsule())
                                    .overlay(Capsule().strokeBorder(Color.harvousAccent.opacity(0.2), lineWidth: 0.5))
                            }
                        }
                    }
                }

                // Tags
                if !note.tags.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(note.tags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(HarvousTypography.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(.quaternary, in: Capsule())
                        }
                    }
                }
            }
            .padding(24)
        }
        .navigationTitle(note.title.isEmpty ? "Note" : note.title)
        #if os(macOS)
        .navigationSubtitle(note.primaryRef ?? "")
        #endif
    }
}

// MARK: - Simple flow layout for pills

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
