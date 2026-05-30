import SwiftUI

struct NoteCardView: View {
    let note: Note

    var body: some View {
        RoundedRectangle(cornerRadius: HarvousRadius.card)
            .fill(.background)
            .cardShadow()
            .overlay(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 0) {
                    if let folderChip = note.folderChipPrimaryLabelText(), !folderChip.isEmpty {
                        HStack(spacing: 6) {
                            HarvousFAGlyph(assetName: "Harvous.Folder", edgePt: 10)
                                .foregroundStyle(.secondary)
                            Text(folderChip)
                                .font(HarvousTypography.caption)
                                .lineLimit(1)
                        }
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.secondary.opacity(0.06))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        if !note.title.isEmpty {
                            Text(note.title)
                                .font(HarvousTypography.noteCardTitle)
                                .lineLimit(2)
                        }

                        if !note.excerpt.isEmpty {
                            Text(note.excerpt)
                                .font(HarvousTypography.body)
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                                .lineSpacing(2)
                        }

                        HStack(alignment: .center, spacing: 6) {
                            if let ref = note.primaryRef {
                                ScriptureRefChip(reference: ref)
                            }
                            Spacer()
                            TimelineView(.periodic(from: .now, by: 30)) { context in
                                Text(NoteRelativeTime.formatted(note.updatedAt, relativeTo: context.date, abbreviated: true))
                                    .font(HarvousTypography.footnote)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                    .padding(14)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: HarvousRadius.card))
    }
}
