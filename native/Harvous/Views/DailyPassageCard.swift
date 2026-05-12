import SwiftUI
import SwiftData

private extension Note {
    func matchesDailyPassageReference(_ ref: String) -> Bool {
        title.caseInsensitiveCompare(ref) == .orderedSame
            || primaryRef?.caseInsensitiveCompare(ref) == .orderedSame
    }
}

/// Top-of-list row showing today's curated verse of the day.
/// "View" opens an inline passage sheet; "Add" creates/opens a note for the reference.
struct DailyPassageCard: View {
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.modelContext) private var modelContext
    @Environment(\.colorScheme) private var colorScheme

    var onStudyNow: (Note) -> Void

    @Query(sort: [
        SortDescriptor(\Note.updatedAt, order: .reverse),
        SortDescriptor(\Note.createdAt, order: .reverse),
    ]) private var notes: [Note]

    @State private var votd: VotdToday? = nil
    @State private var isLoading = true
    @State private var showingPassage = false
    @State private var pendingAddNoteReference: String?

    private var dailyPassageNoteExists: Bool {
        guard let votd else { return false }
        let spaceId = spaceStore.activeSpaceUUID()
        return notes.contains {
            guard $0.spaceId == spaceId else { return false }
            return $0.matchesDailyPassageReference(votd.reference)
        }
    }

    /// Trailing inset for orb overlay: ~one orb vs two (30 pt + spacing).
    private var passageTitleTrailingInset: CGFloat {
        dailyPassageNoteExists ? 38 : 68
    }

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
                    .padding(.trailing, passageTitleTrailingInset)
                    .overlay(alignment: .bottomTrailing) {
                        HStack(spacing: 8) {
                            orbButton(assetName: "Harvous.BookOpen", tint: .secondary.opacity(0.8), fill: Color.primary.opacity(0.08)) {
                                showingPassage = true
                            }
                            if !dailyPassageNoteExists {
                                orbButton(assetName: "Harvous.Plus", tint: .secondary.opacity(0.8), fill: Color.primary.opacity(0.08)) {
                                    addNote(ref: votd.reference)
                                }
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
        .padding(.horizontal, HarvousFeedListLayout.interiorContentHPadding)
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
            guard let v = votd else { return }
            let ref = v.reference
            let trans = v.translation
            Task.detached(priority: .utility) {
                await ScripturePassageCache.shared.prefetch(reference: ref, translation: trans)
            }
        }
        .sheet(isPresented: $showingPassage) {
            if let votd {
                VotdPassageSheet(
                    votd: votd,
                    showsAddFAB: !dailyPassageNoteExists,
                    onAdd: {
                        pendingAddNoteReference = votd.reference
                        showingPassage = false
                    }
                )
            }
        }
        .onChange(of: showingPassage) { _, presented in
            guard !presented, let ref = pendingAddNoteReference else { return }
            pendingAddNoteReference = nil
            addNote(ref: ref)
        }
    }

    private func orbButton(assetName: String, tint: Color, fill: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: 12)
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
        if let match = candidates.first(where: { $0.matchesDailyPassageReference(ref) }) {
            note = match
        } else {
            note = Note(title: ref, body: "", detectedRefs: [ref], spaceId: spaceId)
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
    private enum Metrics {
        /// Header and reading body use the same lateral and top rhythm (was 16 below the divider; felt tight vs reference block).
        static let sheetHorizontalPadding: CGFloat = 20
        static let sectionTopPadding: CGFloat = 20
        static let headerBottomPadding: CGFloat = 16
        /// Compact FAB — matches morphing compose orb (44) so the sheet does not feel dominated on medium detent.
        static let fabSide: CGFloat = 44
        static let fabIconSize: CGFloat = 17
        static let fabTrailingPadding: CGFloat = 16
        static let fabBottomPadding: CGFloat = 12
        static let scrollBottomInsetNoFAB: CGFloat = 20
    }

    let votd: VotdToday
    /// When false (passage already in notes), omit the FAB; reader still dismisses via header button.
    var showsAddFAB: Bool = true
    var onAdd: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var passageScrollBottomInset: CGFloat {
        guard showsAddFAB else { return Metrics.scrollBottomInsetNoFAB }
        return Metrics.fabSide + Metrics.fabBottomPadding + 8
    }

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
                    HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 22)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Metrics.sheetHorizontalPadding)
            .padding(.top, Metrics.sectionTopPadding)
            .padding(.bottom, Metrics.headerBottomPadding)

            Divider()

            ZStack(alignment: .bottomTrailing) {
                ScrollView {
                    ScripturePassageView(
                        reference: votd.reference,
                        translation: votd.translation,
                        showHeader: false,
                        useReadingTypography: true,
                        showAttribution: false
                    )
                    .padding(.horizontal, Metrics.sheetHorizontalPadding)
                    .padding(.top, Metrics.sectionTopPadding)
                    .padding(.bottom, passageScrollBottomInset)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if showsAddFAB {
                    Button(action: onAdd) {
                        HarvousFAGlyph(assetName: "Harvous.Plus", edgePt: Metrics.fabIconSize)
                            .foregroundStyle(.white)
                            .frame(width: Metrics.fabSide, height: Metrics.fabSide)
                            .background(Circle().fill(Color.harvousAccent))
                            .shadow(color: Color.black.opacity(0.12), radius: 4, x: 0, y: 2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add to Notes")
                    .padding(.trailing, Metrics.fabTrailingPadding)
                    .padding(.bottom, Metrics.fabBottomPadding)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if let attribution {
                Divider()
                HStack(alignment: .center, spacing: 10) {
                    HarvousFAGlyph(assetName: "Harvous.CircleInfo", edgePt: 9)
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
                                HarvousFAGlyph(assetName: "Harvous.ArrowUpRight", edgePt: 7)
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
        }
        .frame(minWidth: 300, idealWidth: 360, maxWidth: 460)
        #if os(iOS)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        #endif
    }
}
