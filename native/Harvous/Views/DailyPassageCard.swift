import SwiftUI
import SwiftData

/// Top-of-list row showing today's curated verse of the day.
/// "View" opens an inline passage sheet; "Add" creates/opens a note for the reference.
struct DailyPassageCard: View {
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var colorScheme

    var onStudyNow: (Note) -> Void

    @State private var votd: VotdToday? = nil
    @State private var isLoading = true
    @State private var showingPassage = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Today's Passage")
                .font(HarvousTypography.noteListPreview)
                .foregroundStyle(.secondary)

            if let votd {
                Text(votd.reference)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, 68)
                    .overlay(alignment: .bottomTrailing) {
                        HStack(spacing: 8) {
                            orbButton(icon: "book.pages", tint: .secondary.opacity(0.8), fill: Color.primary.opacity(0.08)) {
                                showingPassage = true
                            }
                            orbButton(icon: "plus", tint: .secondary.opacity(0.8), fill: Color.primary.opacity(0.08)) {
                                addNote(ref: votd.reference)
                            }
                        }
                    }
            } else if !isLoading {
                Text("No passage today")
                    .font(.system(size: 14))
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        #if os(macOS)
        .padding(.horizontal, 10)
        #endif
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.primary.opacity(colorScheme == .dark ? 0.06 : 0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
        )
        .task(id: VotdService.todayCalendarDayKey()) {
            votd = await VotdService.fetchToday()
            isLoading = false
        }
        .sheet(isPresented: $showingPassage) {
            if let votd {
                VotdPassageSheet(votd: votd, onAdd: {
                    showingPassage = false
                    // Small delay so sheet dismisses before navigation fires
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        addNote(ref: votd.reference)
                    }
                })
            }
        }
    }

    private func orbButton(icon: String, tint: Color, fill: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(Circle().fill(fill))
        }
        .buttonStyle(.plain)
    }

    private func addNote(ref: String) {
        let spaceId = spaceStore.activeSpaceUUID()
        let fd = FetchDescriptor<Note>(
            predicate: #Predicate { n in n.spaceId == spaceId },
            sortBy: [SortDescriptor(\Note.updatedAt, order: .reverse)]
        )
        let candidates = (try? modelContext.fetch(fd)) ?? []
        let note: Note
        if let match = candidates.first(where: {
            $0.title.caseInsensitiveCompare(ref) == .orderedSame
            || $0.primaryRef?.caseInsensitiveCompare(ref) == .orderedSame
        }) {
            note = match
        } else {
            note = Note(title: ref, body: ref, detectedRefs: [], spaceId: spaceId)
            modelContext.insert(note)
            NoteSimpleIDAssigner.assignIfMissing(note, in: modelContext)
            try? modelContext.saveWithLogging()
        }
        Task { @MainActor in
            onStudyNow(note)
        }
    }
}

// MARK: - Passage sheet

private struct VotdPassageSheet: View {
    let votd: VotdToday
    var onAdd: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var attribution: ScriptureReference.TranslationAttribution? {
        ScriptureReference.attribution(for: votd.translation)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Today's Passage")
                        .font(HarvousTypography.noteListPreview)
                        .foregroundStyle(.secondary)
                    Text(votd.reference)
                        .font(.system(size: 17, weight: .semibold))
                }
                Spacer(minLength: 0)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.secondary)
                        .symbolRenderingMode(.hierarchical)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)

            Divider()

            // Passage text — no attribution inside scroll
            ScrollView {
                ScripturePassageView(
                    reference: votd.reference,
                    translation: votd.translation,
                    showHeader: false,
                    useReadingTypography: true,
                    showAttribution: false
                )
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 12)
            }

            // Sticky attribution footer
            if let attribution {
                Divider()
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: "info.circle")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(attribution.copyright)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                    if let url = URL(string: attribution.website) {
                        Link(destination: url) {
                            HStack(spacing: 3) {
                                Text(ScriptureReference.displayTranslationLabel(votd.translation))
                                    .font(.system(size: 9, weight: .semibold))
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 7, weight: .bold))
                            }
                            .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 8)
                .background(Color.primary.opacity(0.03))
            }

            Divider()

            // Add button
            HStack {
                Spacer(minLength: 0)
                Button(action: onAdd) {
                    Label("Add to Notes", systemImage: "note.text.badge.plus")
                        .font(.system(size: 14, weight: .medium))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Capsule(style: .continuous).fill(Color.harvousAccent))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 16)
        }
        .frame(minWidth: 300, idealWidth: 360, maxWidth: 460)
        #if os(iOS)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        #endif
    }
}
