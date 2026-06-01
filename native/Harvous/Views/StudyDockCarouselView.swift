import SwiftUI
import UniformTypeIdentifiers

/// Horizontal carousel of study dock cards: inactive entries use a lightweight collapsed card;
/// the active entry renders full dock chrome and expands to the remaining track width.
struct StudyDockCarouselView<ActiveContent: View>: View {
    let stack: StudyDockStack
    let onSelectEntry: (UUID) -> Void
    let onDismissEntry: (UUID) -> Void
    let onMoveEntry: (UUID, Int) -> Void
    /// Editor column width from `NoteEditorView` (avoids measuring horizontal scroll content width).
    var containerTrackWidth: CGFloat? = nil
    let collapsedTitle: (StudyDockEntry) -> String
    let collapsedIconAsset: (StudyDockEntry) -> String
    let collapsedAccentTint: (StudyDockEntry) -> Color
    @ViewBuilder let renderActiveEntry: (StudyDockEntry) -> ActiveContent

    private let trackHorizontalPadding: CGFloat = 24
    private let itemSpacing: CGFloat = 8
    /// Drag handle column inside each slot (`14` frame + `4` spacing).
    private let dragHandleColumnWidth: CGFloat = 18

    /// Responsive collapsed-card sizing: wide tracks peek ~3.25 cards; narrow tracks (small Mac windows,
    /// iPhone) step down so cards stay readable instead of bottoming out on a fixed 200pt floor.
    /// Mirrors the `study-dock-carousel.css` breakpoints so native and web match.
    private func compactLayout(trackInner: CGFloat) -> (slots: CGFloat, floor: CGFloat) {
        switch trackInner {
        case ..<380: return (slots: 1.35, floor: 150)
        case ..<560: return (slots: 2.30, floor: 176)
        default:     return (slots: 3.25, floor: 200)
        }
    }
    private let expandScrollDelayMs: UInt64 = 340

    @State private var trackWidth: CGFloat = 0
    @State private var scrollCenterTask: Task<Void, Never>?
    @State private var draggedEntryId: UUID?

    /// Active id + expanded flag + order — drives width animation and re-center after expand/reorder.
    private var scrollCenterToken: String {
        guard let activeId = stack.activeId,
              let entry = stack.entries.first(where: { $0.id == activeId }) else {
            return stack.entries.map(\.id.uuidString).joined(separator: ",")
        }
        let order = stack.entries.map(\.id.uuidString).joined(separator: ",")
        return "\(activeId.uuidString)-\(entry.expanded)-\(order)"
    }

    private var resolvedTrackWidth: CGFloat {
        let external = containerTrackWidth ?? 0
        if external > 0 { return external }
        return trackWidth
    }

    var body: some View {
        if stack.isEmpty {
            EmptyView()
        } else {
            ZStack(alignment: .bottomLeading) {
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: 1)
                    .allowsHitTesting(false)

                ScrollViewReader { scrollProxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .bottom, spacing: itemSpacing) {
                            ForEach(stack.entries) { entry in
                                carouselSlot(entry: entry)
                                    .id(entry.id)
                            }
                        }
                        .padding(.horizontal, trackHorizontalPadding / 2)
                        // Extra vertical padding gives dock shadows room to render without
                        // being clipped by the ScrollView's content bounds.
                        .padding(.top, 16)
                        .padding(.bottom, 12)
                        .animation(draggedEntryId == nil ? HarvousAnimation.spring : nil, value: scrollCenterToken)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // A horizontal ScrollView otherwise greedily fills all offered HEIGHT. Inside the
                    // bottom editor overlay that means it covers the whole editor and swallows every
                    // click. Pin it to its content height so only the dock's own row intercepts taps
                    // and the rest of the editor stays clickable.
                    .fixedSize(horizontal: false, vertical: true)
                    // Allow dock card shadows to bleed outside the scroll viewport boundary.
                    .scrollClipDisabled()
                    .scrollDisabled(draggedEntryId != nil)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Open study docks")
                    .onAppear {
                        scrollExpandedActiveToCenter(scrollProxy: scrollProxy, delayed: false)
                    }
                    .onChange(of: scrollCenterToken) { _, _ in
                        scrollExpandedActiveToCenter(scrollProxy: scrollProxy, delayed: true)
                    }
                    .onChange(of: resolvedTrackWidth) { _, _ in
                        scrollExpandedActiveToCenter(scrollProxy: scrollProxy, delayed: true)
                    }
                    .onDisappear {
                        scrollCenterTask?.cancel()
                        scrollCenterTask = nil
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                GeometryReader { geo in
                    Color.clear
                        .preference(key: StudyDockCarouselTrackWidthKey.self, value: geo.size.width)
                }
            }
            .onPreferenceChange(StudyDockCarouselTrackWidthKey.self) { newWidth in
                guard newWidth > 0 else { return }
                trackWidth = newWidth
            }
            .environment(\.harvousStudyDockInCarousel, true)
        }
    }

    @ViewBuilder
    private func carouselSlot(entry: StudyDockEntry) -> some View {
        let isActive = entry.id == stack.activeId
        let isExpandedSlot = isActive && entry.expanded
        let slotWidth = widthForEntry(entry, trackWidth: resolvedTrackWidth)
        let isDragging = draggedEntryId == entry.id
        let centersCardInSlot = isExpandedSlot || stack.entries.count == 1

        HStack(alignment: .bottom, spacing: 4) {
            carouselDragHandle(entry: entry)

            carouselCardContent(entry: entry, isActive: isActive, centersInSlot: centersCardInSlot)
        }
        .frame(width: max(slotWidth, 1), alignment: .leading)
        .layoutPriority(isExpandedSlot ? 1 : 0)
        .opacity(isDragging ? 0.55 : 1)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .onDrop(
            of: [UTType.plainText],
            delegate: StudyDockCarouselDropDelegate(
                destinationEntry: entry,
                entries: stack.entries,
                draggedEntryId: $draggedEntryId,
                onMoveEntry: onMoveEntry
            )
        )
    }

    @ViewBuilder
    private func carouselCardContent(entry: StudyDockEntry, isActive: Bool, centersInSlot: Bool) -> some View {
        let card = Group {
            if isActive {
                // The active dock's own header (chevron + title tap) handles expand/collapse.
                // We intentionally do NOT add a carousel-level tap-to-expand here: it raced with
                // the header's `isExpanded.toggle()` — when the carousel set `expanded = true`
                // first, the toggle then read `true` and flipped it back to `false`, so a collapsed
                // dock could never be re-expanded.
                renderActiveEntry(entry)
            } else {
                StudyDockCarouselCollapsedCard(
                    title: collapsedTitle(entry),
                    iconAsset: collapsedIconAsset(entry),
                    accentTint: collapsedAccentTint(entry),
                    onActivate: { onSelectEntry(entry.id) },
                    onDismiss: { onDismissEntry(entry.id) }
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)

        if centersInSlot {
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                card
                    .frame(maxWidth: StudyDockLayoutMetrics.maxCardWidth)
                    .frame(maxWidth: .infinity)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .bottom)
        } else {
            card.frame(maxWidth: .infinity, alignment: .bottomLeading)
        }
    }

    private func carouselDragHandle(entry: StudyDockEntry) -> some View {
        HarvousFormatToolbarHairline()
            .frame(width: 14, height: 22)
            .padding(.bottom, 10)
            .frame(width: 14, height: 32, alignment: .bottom)
            .contentShape(Rectangle())
            .focusable(false)
            .onDrag {
                draggedEntryId = entry.id
                return NSItemProvider(object: entry.id.uuidString as NSString)
            }
            .accessibilityLabel("Reorder")
            .accessibilityHint("Drag to change dock order")
    }

    private func scrollExpandedActiveToCenter(scrollProxy: ScrollViewProxy, delayed: Bool) {
        scrollCenterTask?.cancel()
        guard draggedEntryId == nil,
              let activeId = stack.activeId,
              let entry = stack.entries.first(where: { $0.id == activeId }),
              entry.expanded else { return }

        scrollCenterTask = Task { @MainActor in
            withAnimation(HarvousAnimation.spring) {
                scrollProxy.scrollTo(activeId, anchor: .center)
            }
            guard delayed else { return }
            try? await Task.sleep(nanoseconds: expandScrollDelayMs * 1_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(HarvousAnimation.spring) {
                scrollProxy.scrollTo(activeId, anchor: .center)
            }
        }
    }

    /// Collapsed card face width from track (visible-slot count scales with width).
    private func compactCardWidth(trackInner: CGFloat) -> CGFloat {
        let layout = compactLayout(trackInner: trackInner)
        guard trackInner > 0 else { return layout.floor }
        let peekGaps = itemSpacing * (layout.slots - 1)
        return max(layout.floor, (trackInner - peekGaps) / layout.slots)
    }

    private func trackInnerWidth(_ trackWidth: CGFloat) -> CGFloat {
        max(0, trackWidth - trackHorizontalPadding)
    }


    /// Outer slot width (card + drag handle), matching web flex rules.
    private func widthForEntry(_ entry: StudyDockEntry, trackWidth: CGFloat) -> CGFloat {
        let count = stack.entries.count
        let trackInner = trackInnerWidth(trackWidth)
        let floor = compactLayout(trackInner: trackInner).floor
        guard count > 0 else { return floor + dragHandleColumnWidth }

        let compactCardW = compactCardWidth(trackInner: trackInner)
        let compactSlotOuter = compactCardW + dragHandleColumnWidth

        let isExpandedSlot = entry.id == stack.activeId && entry.expanded
        let compactEntryCount = stack.entries.filter { !($0.id == stack.activeId && $0.expanded) }.count
        let compactCount = CGFloat(compactEntryCount)
        let gaps = itemSpacing * CGFloat(max(0, count - 1))
        let hasExpandedSlot = stack.entries.contains { $0.id == stack.activeId && $0.expanded }

        guard trackInner > 0 else {
            return isExpandedSlot ? min(trackWidth * 0.80, StudyDockLayoutMetrics.maxCardWidth) : compactSlotOuter
        }

        // Single dock: span the full track (web `:only-child` / equal flex when alone).
        if count == 1 {
            return trackInner
        }

        if isExpandedSlot {
            // Expanded card takes the remaining space after compact companions reserve
            // their natural minimum. The floor is 80% of the viewable track width,
            // capped at the card max-width (768pt = web's --study-dock-max-width).
            // When this minimum causes overflow the ScrollView scrolls horizontally and
            // scrollExpandedActiveToCenter snaps the card into view.
            let reservedForCompacts = compactSlotOuter * compactCount + gaps
            let expandedOuter = trackInner - reservedForCompacts
            let expandedMin = min(trackWidth * 0.80, StudyDockLayoutMetrics.maxCardWidth)
            return max(expandedOuter, expandedMin)
        }

        if hasExpandedSlot {
            // Compact companions keep their natural formula width — no squeezing.
            // The expanded card's minimum above handles overflow + scroll if needed.
            return compactSlotOuter
        }

        // All collapsed: share leftover track equally, never shrink below compact minimum.
        // If there are enough entries that each would go below compact-min, the HStack
        // overflows and the user scrolls horizontally (web `flex: 1 1 compact-min` parity).
        let budgetForCards = trackInner - gaps - dragHandleColumnWidth * CGFloat(count)
        let perCard = max(compactCardW, budgetForCards / CGFloat(count))
        return perCard + dragHandleColumnWidth
    }
}

// MARK: - Live reorder while dragging across carousel slots

private struct StudyDockCarouselDropDelegate: DropDelegate {
    let destinationEntry: StudyDockEntry
    let entries: [StudyDockEntry]
    @Binding var draggedEntryId: UUID?
    let onMoveEntry: (UUID, Int) -> Void

    func validateDrop(info: DropInfo) -> Bool {
        guard let dragged = draggedEntryId else { return false }
        return dragged != destinationEntry.id
    }

    func dropEntered(info: DropInfo) {
        guard let dragged = draggedEntryId,
              let fromIndex = entries.firstIndex(where: { $0.id == dragged }),
              let toIndex = entries.firstIndex(where: { $0.id == destinationEntry.id }),
              fromIndex != toIndex else { return }
        onMoveEntry(dragged, toIndex)
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        draggedEntryId = nil
        return true
    }
}

private struct StudyDockCarouselTrackWidthKey: PreferenceKey {
    nonisolated static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
