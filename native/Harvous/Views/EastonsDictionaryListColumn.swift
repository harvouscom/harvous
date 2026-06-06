import SwiftUI

/// Sidebar column listing all Easton's Bible Dictionary entries A-Z.
/// Category chips filter by person / place / thing; the sidebar search bar narrows by headword.
/// Tapping a row calls `onSelectEntry` so the parent can drill in-sidebar (like folders).
struct EastonsDictionaryListColumn: View {
    var externalSearchText: Binding<String>? = nil
    var onSelectEntry: (String) -> Void = { _ in }

    @ObservedObject private var service = EastonsDictionaryService.shared
    @State private var categoryFilter: CategoryFilter = .all
    @State private var chipBarAvailableWidth: CGFloat = 300
    @Namespace private var chipNamespace
    @State private var pinnedSlugs: [String] = []
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout

    private enum CategoryFilter: String, CaseIterable, Identifiable {
        case all, person, place, thing
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all:    return "All"
            case .person: return "People"
            case .place:  return "Places"
            case .thing:  return "Things"
            }
        }
        var iconAsset: String? {
            EastonsSlugIndexEntry.categoryIconAsset(for: rawValue == "all" ? nil : rawValue)
        }
    }

    private var selectedSegmentBackground: Color {
        #if os(macOS)
        Color(NSColor.controlBackgroundColor)
        #else
        // `systemBackground` (white in light, near-black in dark) — gives the same raised
        // pill contrast macOS gets from `controlBackgroundColor`. `secondarySystemBackground`
        // was too close to the chip track's translucent grey and made the selected state
        // nearly invisible.
        Color(UIColor.systemBackground)
        #endif
    }

    private var searchQuery: String {
        externalSearchText?.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private var filteredEntries: [EastonsSlugIndexEntry] {
        let base = service.slugIndex.values
        let categoryFiltered: AnySequence<EastonsSlugIndexEntry> = categoryFilter == .all
            ? AnySequence(base)
            : AnySequence(base.filter { ($0.category ?? "") == categoryFilter.rawValue })
        let q = searchQuery.lowercased()
        let searched = q.isEmpty
            ? Array(categoryFiltered)
            : categoryFiltered.filter { $0.headword.lowercased().contains(q) }
        let alphabetical = searched.sorted { $0.headword.localizedCaseInsensitiveCompare($1.headword) == .orderedAscending }
        guard !pinnedSlugs.isEmpty else { return alphabetical }
        let pinnedSet = Set(pinnedSlugs)
        let bySlug = Dictionary(uniqueKeysWithValues: alphabetical.map { ($0.slug, $0) })
        let pinned = pinnedSlugs.compactMap { bySlug[$0] }
        let unpinned = alphabetical.filter { !pinnedSet.contains($0.slug) }
        return pinned + unpinned
    }

    private func togglePin(_ slug: String) {
        withAnimation {
            pinnedSlugs = HarvousPinnedDictionaryEntriesStore.togglePin(slug: slug)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            categoryChipBar
            listBody
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        #if os(iOS)
        .harvousIOSGlassOverCanvasShell()
        #endif
        .onAppear {
            EastonsDictionaryService.shared.loadIndexIfNeeded()
            pinnedSlugs = HarvousPinnedDictionaryEntriesStore.loadOrderedSlugs()
        }
    }

    // MARK: - Category segmented control

    private var categoryChipBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(CategoryFilter.allCases) { filter in
                    categorySegment(filter)
                }
            }
            .frame(minWidth: chipBarAvailableWidth - 2 * HarvousFeedListLayout.listRowHorizontalInset)
            .padding(3)
            .background(Capsule().fill(Color.primary.opacity(0.07)))
            .padding(.horizontal, HarvousFeedListLayout.listRowHorizontalInset)
            .padding(.vertical, 8)
        }
        .background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear { chipBarAvailableWidth = proxy.size.width }
                    .onChange(of: proxy.size.width) { _, w in chipBarAvailableWidth = w }
            }
        )
    }

    private func categorySegment(_ filter: CategoryFilter) -> some View {
        let isSelected = categoryFilter == filter
        #if os(iOS)
        let iconPt: CGFloat = 14
        let labelFont: Font = HarvousFonts.font(size: 16, weight: 500, design: .default)
        let hStackSpacing: CGFloat = 6
        let hPad: CGFloat = 12
        let vPad: CGFloat = 8
        #else
        let iconPt: CGFloat = 10
        let labelFont: Font = .system(size: 12, weight: .medium)
        let hStackSpacing: CGFloat = 4
        let hPad: CGFloat = 10
        let vPad: CGFloat = 5
        #endif
        return Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.82)) {
                categoryFilter = filter
            }
        } label: {
            HStack(spacing: hStackSpacing) {
                if let iconAsset = filter.iconAsset {
                    HarvousFAGlyph(assetName: iconAsset, edgePt: iconPt)
                }
                Text(filter.label)
                    .font(labelFont)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .frame(maxWidth: .infinity)
            .foregroundStyle(isSelected ? Color.primary : Color.primary.opacity(0.5))
            .background {
                if isSelected {
                    Capsule()
                        .fill(selectedSegmentBackground)
                        .shadow(color: .black.opacity(0.1), radius: 2, y: 1)
                        .matchedGeometryEffect(id: "dictionaryChip", in: chipNamespace)
                }
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    @ViewBuilder
    private var listBody: some View {
        switch service.indexLoadState {
        case .idle, .loading:
            VStack {
                Spacer()
                ProgressView()
                Spacer()
            }
        case .failed:
            HarvousEmptyStateView(
                iconAsset: "Harvous.LinesLeaning",
                title: "Couldn't Load Dictionary",
                description: "Check your connection and reopen the sidebar.",
                scale: .compact
            )
        case .loaded:
            // Single-pass filter+sort: previously `filteredEntries` ran twice (empty check + List source) on
            // every render, which under category-switch animation became a perceptible main-thread cost while
            // a system back button was trying to claim hits.
            let entries = filteredEntries
            if entries.isEmpty {
                ContentUnavailableView.search(text: searchQuery)
            } else {
                List(entries, id: \.slug) { entry in
                    let pinned = pinnedSlugs.contains(entry.slug)
                    Button { onSelectEntry(entry.slug) } label: {
                        dictionaryRow(entry, isPinned: pinned)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .contextMenu {
                        Button {
                            togglePin(entry.slug)
                        } label: {
                            Label {
                                Text(pinned ? "Unpin" : "Pin")
                            } icon: {
                                HarvousFAGlyph(
                                    assetName: pinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                                    edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                                )
                            }
                        }
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        Button {
                            togglePin(entry.slug)
                        } label: {
                            Label {
                                Text(pinned ? "Unpin" : "Pin")
                            } icon: {
                                HarvousFAGlyph(
                                    assetName: pinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                                    edgePt: 14
                                )
                            }
                        }
                        .tint(.orange)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                #if os(iOS)
                .modifier(IPadAwareListBottomChromeReserve(skip: isIPadSplitLayout))
                #elseif os(macOS)
                .harvousListDailyPassagePillScrollReserve()
                #endif
            }
        }
    }

    private func dictionaryRow(_ entry: EastonsSlugIndexEntry, isPinned: Bool = false) -> some View {
        HStack(alignment: .center, spacing: 8) {
            if let iconAsset = entry.categoryIconAsset {
                HarvousFAGlyph(assetName: iconAsset, edgePt: 13)
                    .foregroundStyle(Color.primary.opacity(0.35))
                    .frame(width: 16, alignment: .center)
            } else {
                Color.clear.frame(width: 16)
            }
            Text(entry.headword)
                .font(HarvousTypography.noteListTitle)
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer(minLength: 0)
            if isPinned {
                HarvousFAGlyph(assetName: "Harvous.Thumbtack", edgePt: 11)
                    .foregroundStyle(Color.primary.opacity(0.45))
            }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

#if os(iOS)
/// iOS hub that hosts the dictionary list.
/// Toolbar matches the other hub views (Notes, Folders, etc.): SpaceSwitcher + list chip + Account.
///
/// Drill-in is a state replacement (not a nested NavigationStack push) — nesting a String-typed
/// NavigationStack inside the outer UUID-typed `iosNavigationStack` crashes with
/// `AnyNavigationPath.Error.comparisonTypeMismatch` because the inner stack's destination
/// registration leaks into the outer scope's type-comparison machinery. Same pattern macOS sidebar
/// uses (see `SidebarPanelView.dictionaryDrill`).
struct IOSDictionaryHubView: View {
    @EnvironmentObject private var appRouter: HarvousAppRouter
    var externalSearchText: Binding<String>? = nil
    @State private var drilledSlug: String?

    var body: some View {
        Group {
            if let slug = drilledSlug {
                EastonsEntryDetailView(initialSlug: slug)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            SpaceSwitcherView()
                        }
                        if #available(iOS 26, *) {
                            ToolbarSpacer(.fixed, placement: .topBarLeading)
                        }
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                withAnimation(.easeOut(duration: 0.22)) {
                                    drilledSlug = nil
                                }
                            } label: {
                                HStack(spacing: 6) {
                                    HarvousFAGlyph(
                                        assetName: "Harvous.ChevronLeft",
                                        edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                                    )
                                    .frame(
                                        width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                                        height: HarvousFAIconMetrics.catalogGlyphBoxPt
                                    )
                                    Text("Dictionary")
                                        .font(HarvousFonts.font(size: 16, weight: 500, design: .default))
                                        .lineLimit(1)
                                }
                                .fixedSize(horizontal: true, vertical: false)
                                .padding(.horizontal, 8)
                                .frame(minHeight: 24)
                                .foregroundStyle(.primary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Back to dictionary")
                        }
                        HarvousIOSProfileToolbarTrailingItem {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            appRouter.selectIOSListSurface(.more)
                        }
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            } else {
                EastonsDictionaryListColumn(
                    externalSearchText: externalSearchText,
                    onSelectEntry: { slug in
                        withAnimation(.easeOut(duration: 0.22)) {
                            drilledSlug = slug
                        }
                    }
                )
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        SpaceSwitcherView()
                    }
                    if #available(iOS 26, *) {
                        ToolbarSpacer(.fixed, placement: .topBarLeading)
                    }
                    ToolbarItem(placement: .topBarLeading) {
                        IOSListSurfaceChip()
                    }
                    HarvousIOSProfileToolbarTrailingItem {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        appRouter.selectIOSListSurface(.more)
                    }
                }
                .transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .onChange(of: appRouter.iosListSurface) { _, surface in
            if surface != .dictionary { drilledSlug = nil }
        }
        .harvousIOSGlassOverCanvasShell()
    }
}
#endif
