import SwiftUI

struct NoteCardView: View {
    let note: Note

    private var relativeDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: note.updatedAt, relativeTo: Date())
    }

    var body: some View {
        RoundedRectangle(cornerRadius: HarvousRadius.card)
            .fill(.background)
            .cardShadow()
            .overlay(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 0) {
                    // Thread color bar + name
                    if let color = note.color {
                        HStack(spacing: 8) {
                            Rectangle()
                                .fill(color)
                                .frame(width: 4)

                            if let name = note.threadName {
                                Text(name)
                                    .font(HarvousTypography.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(height: 32)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(color.opacity(0.12))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        // Title
                        if !note.title.isEmpty {
                            Text(note.title)
                                .font(HarvousTypography.title)
                                .lineLimit(2)
                        }

                        // Excerpt
                        if !note.excerpt.isEmpty {
                            Text(note.excerpt)
                                .font(HarvousTypography.body)
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                                .lineSpacing(2)
                        }

                        // Footer: primary ref + date
                        HStack {
                            if let ref = note.primaryRef {
                                Label(ref, systemImage: "book.closed")
                                    .font(HarvousTypography.caption)
                                    .foregroundStyle(Color.harvousAccent)
                                    .labelStyle(.titleAndIcon)
                            }
                            Spacer()
                            Text(relativeDate)
                                .font(HarvousTypography.footnote)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(14)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: HarvousRadius.card))
    }
}
