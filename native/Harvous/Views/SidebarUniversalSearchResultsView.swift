import SwiftUI

/// Universal sidebar search results with active-view / elsewhere scope toggle.
struct SidebarUniversalSearchResultsView: View {
    let query: String
    let activeContext: SidebarUniversalSearchIndex.ActiveContext
    let searchData: SidebarUniversalSearchIndex.SearchData
    var onSelect: (SidebarSearchResult) -> Void

    @State private var searchScope: SidebarSearchScope = .active
    @State private var highlightKindFilter: SidebarUniversalSearchIndex.HighlightKindFilter = .all
    @State private var elsewhereTypeFilter: SidebarElsewhereTypeFilter = .all
    #if os(iOS)
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout
    #endif

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var activeContextWithHighlightFilter: SidebarUniversalSearchIndex.ActiveContext {
        var ctx = activeContext
        ctx.highlightKindFilter = highlightKindFilter
        return ctx
    }

    private var activeResults: [SidebarSearchResult] {
        SidebarUniversalSearchIndex.buildActiveResults(
            query: trimmedQuery,
            ctx: activeContextWithHighlightFilter,
            data: searchData
        )
    }

    private var elsewhereResults: [SidebarSearchResult] {
        let exclude = Set(activeResults.map(\.id))
        return SidebarUniversalSearchIndex.buildElsewhereResults(
            query: trimmedQuery,
            data: searchData,
            excluding: exclude,
            typeFilter: elsewhereTypeFilter
        )
    }

    private var scopeOptions: [HarvousSidebarSegmentedChipOption] {
        [
            HarvousSidebarSegmentedChipOption(
                id: SidebarSearchScope.active.rawValue,
                label: SidebarUniversalSearchIndex.activeSectionHeader(activeContextWithHighlightFilter),
                iconAsset: nil
            ),
            HarvousSidebarSegmentedChipOption(
                id: SidebarSearchScope.elsewhere.rawValue,
                label: "Elsewhere",
                iconAsset: nil
            ),
        ]
    }

    private var highlightKindOptions: [HarvousSidebarSegmentedChipOption] {
        SidebarUniversalSearchIndex.HighlightKindFilter.allCases.map { filter in
            HarvousSidebarSegmentedChipOption(
                id: filter.rawValue,
                label: filter.label,
                iconAsset: filter.iconAsset
            )
        }
    }

    private var elsewhereTypeOptions: [HarvousSidebarSegmentedChipOption] {
        SidebarElsewhereTypeFilter.allCases.map { filter in
            HarvousSidebarSegmentedChipOption(
                id: filter.rawValue,
                label: filter.label,
                iconAsset: filter.iconAsset
            )
        }
    }

    private var visibleResults: [SidebarSearchResult] {
        searchScope == .active ? activeResults : elsewhereResults
    }

    private var bothScopesEmpty: Bool {
        activeResults.isEmpty && elsewhereResults.isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            HarvousSidebarSegmentedChipBar(
                options: scopeOptions,
                selection: searchScopeSelection,
                matchedGeometryId: "searchScopeChip"
            )

            if searchScope == .active, activeContext.mode == .highlights {
                HarvousSidebarSegmentedChipBar(
                    options: highlightKindOptions,
                    selection: highlightKindSelection,
                    matchedGeometryId: "searchHighlightKindChip"
                )
            }

            if searchScope == .elsewhere {
                HarvousSidebarSegmentedChipBar(
                    options: elsewhereTypeOptions,
                    selection: elsewhereTypeSelection,
                    matchedGeometryId: "searchElsewhereTypeChip"
                )
            }

            if bothScopesEmpty {
                HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noResultsInSpace)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else if searchScope == .active, activeResults.isEmpty {
                HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noMatchesInView)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else if searchScope == .elsewhere, elsewhereResults.isEmpty {
                HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noOtherMatches)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                searchResultsList {
                    ForEach(visibleResults) { result in
                        Button {
                            onSelect(result)
                        } label: {
                            SidebarSearchResultRowView(result: result, searchData: searchData)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(searchListRowInsets)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func searchResultsList<Rows: View>(@ViewBuilder rows: () -> Rows) -> some View {
        List {
            rows()
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .layoutPriority(1)
        #if os(iOS)
        .modifier(IPadAwareListBottomChromeReserve(skip: isIPadSplitLayout))
        #elseif os(macOS)
        .modifier(MacOSSidebarDailyPassagePillListReserve(enabled: true))
        #endif
    }

    private var searchListRowInsets: EdgeInsets {
        EdgeInsets(
            top: HarvousFeedListLayout.sidebarListRowInsetVertical,
            leading: 0,
            bottom: HarvousFeedListLayout.sidebarListRowInsetVertical,
            trailing: 0
        )
    }

    private var searchScopeSelection: Binding<String> {
        Binding(
            get: { searchScope.rawValue },
            set: { newValue in
                if let scope = SidebarSearchScope(rawValue: newValue) {
                    searchScope = scope
                }
            }
        )
    }

    private var highlightKindSelection: Binding<String> {
        Binding(
            get: { highlightKindFilter.rawValue },
            set: { newValue in
                if let filter = SidebarUniversalSearchIndex.HighlightKindFilter(rawValue: newValue) {
                    highlightKindFilter = filter
                }
            }
        )
    }

    private var elsewhereTypeSelection: Binding<String> {
        Binding(
            get: { elsewhereTypeFilter.rawValue },
            set: { newValue in
                if let filter = SidebarElsewhereTypeFilter(rawValue: newValue) {
                    elsewhereTypeFilter = filter
                }
            }
        )
    }

}
