import SwiftUI
import SwiftData

private extension Note {
    func matchesDailyPassageReference(_ ref: String) -> Bool {
        title.caseInsensitiveCompare(ref) == .orderedSame
            || primaryRef?.caseInsensitiveCompare(ref) == .orderedSame
    }
}

/// Floating verse-of-the-day card. Pinned to the bottom of the sidebar (macOS) /
/// above the compose orb (iOS). Renders without its own background material —
/// sits over whatever the host surface paints, View/Add orbs handle interaction.
struct DailyPassagePill: View {
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.modelContext) private var modelContext

    var onStudyNow: (Note) -> Void

    @Query(sort: [
        SortDescriptor(\Note.updatedAt, order: .reverse),
        SortDescriptor(\Note.createdAt, order: .reverse),
    ]) private var notes: [Note]

    @State private var votd: VotdToday?
    @State private var showingPassage = false
    @State private var pendingAddNoteReference: String?
    @State private var isHovered = false
    @State private var isDismissHovered = false
    @State private var dragOffset: CGFloat = 0
    /// True when the user partially swiped left and released — card rests at `revealLatchOffset`
    /// showing the dismiss button (matches `List.swipeActions` latching behavior).
    @State private var swipeLatched: Bool = false

    private var showDismiss: Bool { isHovered || isDismissHovered }

    /// Position the card latches to after a partial left-swipe (button is fully visible here).
    private let revealLatchOffset: CGFloat = -88
    /// Past this drag distance on release, the swipe latches open instead of springing back.
    private let partialRevealThreshold: CGFloat = -40
    /// Past this projected drag distance (uses predicted velocity), full-swipe commits dismiss.
    private let fullSwipeCommitThreshold: CGFloat = -180
    /// Opacity fade as the card is dragged past the latch position toward full commit.
    private var swipeFadeOpacity: Double {
        guard dragOffset < revealLatchOffset else { return 1 }
        let frac = min(1, (abs(dragOffset) - abs(revealLatchOffset)) / abs(fullSwipeCommitThreshold))
        return Double(1 - frac * 0.5)
    }

    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var dismissedDay: String = ""

    private var dailyPassageNoteExists: Bool {
        guard let votd else { return false }
        let spaceId = spaceStore.activeSpaceUUID()
        return notes.contains {
            guard $0.spaceId == spaceId else { return false }
            return $0.matchesDailyPassageReference(votd.reference)
        }
    }

    private var isVisible: Bool {
        guard votd != nil else { return false }
        return dismissedDay != VotdService.todayCalendarDayKey()
    }

    var body: some View {
        pillBody
            .task(id: VotdService.todayCalendarDayKey()) {
                let fetched = await VotdService.fetchToday()
                withAnimation(HarvousAnimation.snappy) {
                    votd = fetched
                }
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

    @ViewBuilder
    private var pillBody: some View {
        if isVisible, let votd {
            ZStack(alignment: .trailing) {
                #if os(iOS)
                swipeDismissActionBackground
                #endif
                cardContent(votd: votd)
                    .offset(x: dragOffset)
                    .opacity(swipeFadeOpacity)
                    .overlay(alignment: .topTrailing) {
                        if showDismiss {
                            Button {
                                withAnimation(HarvousAnimation.spring) {
                                    dismissedDay = VotdService.todayCalendarDayKey()
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 10)
                                    Text("Dismiss").font(HarvousFonts.font(size: 11, weight: .medium, design: .default))
                                }
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(.regularMaterial))
                            }
                            .buttonStyle(.plain)
                            .offset(y: -12)
                            .padding(.trailing, 6)
                            .onHover { isDismissHovered = $0 }
                            .transition(.opacity)
                        }
                    }
                    .onHover { isHovered = $0 }
                    #if os(iOS)
                    .gesture(swipeDismissGesture)
                    #endif
                    .contextMenu {
                        Button {
                            dismissedDay = VotdService.todayCalendarDayKey()
                        } label: {
                            Label("Dismiss for today", systemImage: "xmark.circle")
                        }
                    }
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else {
            Color.clear.frame(width: 0, height: 0)
        }
    }

    #if os(iOS)
    /// Red "Dismiss" surface revealed under the card as the user swipes left.
    /// Matches the visual language of `List.swipeActions(edge: .trailing)` used on notes.
    private var swipeDismissActionBackground: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(HarvousAnimation.snappy) {
                dragOffset = -UIScreen.main.bounds.width
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                dismissedDay = VotdService.todayCalendarDayKey()
                dragOffset = 0
            }
        } label: {
            HStack {
                Spacer(minLength: 0)
                VStack(spacing: 4) {
                    HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 18)
                    Text("Dismiss")
                        .font(HarvousFonts.font(size: 12, weight: .semibold, design: .default))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
            }
            .frame(maxHeight: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.red.opacity(0.9))
            )
        }
        .buttonStyle(.plain)
        .opacity(dragOffset < -8 ? 1 : 0)
        .allowsHitTesting(dragOffset <= partialRevealThreshold)
        .accessibilityLabel("Dismiss today's passage")
    }
    #endif

    #if os(iOS)
    /// Latching swipe-to-dismiss matching `List.swipeActions(allowsFullSwipe: true)`:
    ///  - Partial left-swipe past `partialRevealThreshold` → latches at `revealLatchOffset`
    ///    with the red dismiss button revealed. User can tap the button to commit.
    ///  - Full left-swipe whose projected end (velocity-aware) is past `fullSwipeCommitThreshold`
    ///    → commits dismiss immediately, sliding card off-screen.
    ///  - Right-swipe while latched → closes the latch.
    private var swipeDismissGesture: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { value in
                let base: CGFloat = swipeLatched ? revealLatchOffset : 0
                let proposed = base + value.translation.width
                if swipeLatched {
                    // While latched, allow drag in either direction (clamped to closed/open).
                    dragOffset = max(-UIScreen.main.bounds.width, min(0, proposed))
                } else {
                    // From closed state, only respond to leftward drags.
                    guard value.translation.width <= 0 else { return }
                    dragOffset = max(-UIScreen.main.bounds.width, proposed)
                }
            }
            .onEnded { value in
                let base: CGFloat = swipeLatched ? revealLatchOffset : 0
                // Velocity-aware projection — matches List swipe feel where a fast flick
                // past a smaller actual distance still commits.
                let projected = base + value.predictedEndTranslation.width
                if projected < fullSwipeCommitThreshold {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(HarvousAnimation.snappy) {
                        dragOffset = -UIScreen.main.bounds.width
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
                        dismissedDay = VotdService.todayCalendarDayKey()
                        dragOffset = 0
                        swipeLatched = false
                    }
                } else if projected < partialRevealThreshold {
                    if !swipeLatched {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                    withAnimation(HarvousAnimation.spring) {
                        dragOffset = revealLatchOffset
                    }
                    swipeLatched = true
                } else {
                    withAnimation(HarvousAnimation.spring) {
                        dragOffset = 0
                    }
                    swipeLatched = false
                }
            }
    }
    #endif

    private var passageTitleTrailingInset: CGFloat {
        dailyPassageNoteExists ? 38 : 68
    }

    private func cardContent(votd: VotdToday) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Today's Passage")
                // Use 12pt on both platforms — matches the Mac sidebar pill; noteListPreview
                // intentionally upsizes to 14pt on iOS for list rows but the pill is a compact
                // widget that should stay tight regardless of platform.
                .font(HarvousFonts.font(size: 12, weight: 400, design: .default))
                .foregroundStyle(.secondary)

            Text(votd.reference)
                .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, passageTitleTrailingInset)
                .overlay(alignment: .bottomTrailing) {
                    HStack(spacing: 8) {
                        orbButton(assetName: "Harvous.BookOpen") {
                            showingPassage = true
                        }
                        if !dailyPassageNoteExists {
                            orbButton(assetName: "Harvous.Plus") {
                                addNote(ref: votd.reference)
                            }
                        }
                    }
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, HarvousFeedListLayout.interiorContentHPadding)
        .padding(.top, 9)
        .padding(.bottom, 8)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.thinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 16, x: 0, y: 6)
        .shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
    }

    private func orbButton(assetName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HarvousFAGlyph(assetName: assetName, edgePt: 12)
                .foregroundStyle(.secondary.opacity(0.8))
                .frame(width: 30, height: 30)
                .background(Circle().fill(Color.primary.opacity(0.08)))
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
