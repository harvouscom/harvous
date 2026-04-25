import SwiftUI
import SwiftData

/// Right-side inspector panel — shown via `.inspector(isPresented:)`.
/// Displays note metadata: thread color, tags, detected refs, dates, and pin toggle.
struct NoteInspectorView: View {
    let note: Note
    @Environment(\.modelContext) private var context

    private let threadColors: [(name: String, color: Color)] = [
        ("blue",   .threadBlue),
        ("yellow", .threadYellow),
        ("green",  .threadGreen),
        ("pink",   .threadPink),
        ("orange", .threadOrange),
        ("purple", .threadPurple),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader("Thread")
                threadPicker

                warmSeparator.padding(.vertical, 12)

                sectionHeader("Scripture")
                scripturePills

                warmSeparator.padding(.vertical, 12)

                sectionHeader("Tags")
                tagsSection

                warmSeparator.padding(.vertical, 12)

                sectionHeader("Info")
                infoSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
        .background(Color.surfacePaper)
    }

    // MARK: - Thread color picker

    private var threadPicker: some View {
        HStack(spacing: 10) {
            ForEach(threadColors, id: \.name) { item in
                Button {
                    note.threadColor = item.name
                } label: {
                    Circle()
                        .fill(item.color)
                        .frame(width: 22, height: 22)
                        .overlay(
                            Circle()
                                .strokeBorder(
                                    note.threadColor == item.name
                                        ? Color.inkSecondary
                                        : Color.clear,
                                    lineWidth: 2
                                )
                        )
                        .scaleEffect(note.threadColor == item.name ? 1.15 : 1.0)
                        .animation(HarvousAnimation.spring, value: note.threadColor)
                }
                .buttonStyle(.plain)
                .help(item.name.capitalized)
            }
        }
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    // MARK: - Scripture refs

    @ViewBuilder
    private var scripturePills: some View {
        if note.detectedRefs.isEmpty {
            Text("No references detected")
                .font(.system(size: 12))
                .foregroundStyle(Color.inkQuaternary)
                .padding(.top, 4)
        } else {
            FlowLayout(spacing: 6) {
                ForEach(note.detectedRefs, id: \.self) { ref in
                    HStack(spacing: 4) {
                        Image(systemName: "book.closed.fill")
                            .font(.system(size: 9))
                        Text(ref)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundStyle(.tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.tint.opacity(0.08), in: Capsule())
                }
            }
            .padding(.top, 4)
        }
    }

    // MARK: - Tags

    @ViewBuilder
    private var tagsSection: some View {
        if note.tags.isEmpty {
            Text("No tags")
                .font(.system(size: 12))
                .foregroundStyle(Color.inkQuaternary)
                .padding(.top, 4)
        } else {
            FlowLayout(spacing: 6) {
                ForEach(note.tags, id: \.self) { tag in
                    Text(tag)
                        .font(.system(size: 11))
                        .foregroundStyle(Color.inkSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.surfaceInset, in: Capsule())
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
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.inkTertiary)
                .frame(width: 64, alignment: .leading)
            Text(value)
                .font(.system(size: 11))
                .foregroundStyle(Color.inkSecondary)
        }
    }

    private var wordCount: String {
        let words = note.body.split(separator: " ").count
        return "\(words) word\(words == 1 ? "" : "s")"
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(Color.inkQuaternary)
            .tracking(0.8)
            .padding(.bottom, 6)
    }

    private var warmSeparator: some View {
        Color.separatorWarm.frame(height: 0.5)
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
    note.threadColor = "blue"
    note.tags = ["faith", "study"]
    note.detectedRefs = ["John 3:16"]
    return NoteInspectorView(note: note)
        .frame(width: 280)
        .modelContainer(for: [Note.self], inMemory: true)
}
