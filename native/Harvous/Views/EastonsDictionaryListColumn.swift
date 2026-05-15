import SwiftUI

#if os(macOS)

/// Sidebar column listing all Easton's Bible Dictionary entries A-Z.
/// Category tabs filter by person / place / thing; the sidebar search bar narrows by headword.
struct EastonsDictionaryListColumn: View {
    var externalSearchText: Binding<String>? = nil

    @ObservedObject private var service = EastonsDictionaryService.shared
    @State private var categoryFilter: CategoryFilter = .all

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
        return searched.sorted { $0.headword.localizedCaseInsensitiveCompare($1.headword) == .orderedAscending }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker(selection: $categoryFilter) {
                ForEach(CategoryFilter.allCases) { filter in
                    Text(filter.label).tag(filter)
                }
            } label: { EmptyView() }
            .labelsHidden()
            .pickerStyle(.segmented)
            .padding(.horizontal, 10)
            .padding(.top, 8)
            .padding(.bottom, 4)

            listBody
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear {
            EastonsDictionaryService.shared.loadIndexIfNeeded()
        }
    }

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
            ContentUnavailableView {
                Label {
                    Text("Couldn't Load Dictionary")
                } icon: {
                    HarvousFAGlyph(assetName: "Harvous.LinesLeaning", edgePt: 28)
                }
            } description: {
                Text("Check your connection and reopen the sidebar.")
            }
        case .loaded:
            if filteredEntries.isEmpty {
                ContentUnavailableView.search(text: searchQuery)
            } else {
                List(filteredEntries, id: \.slug) { entry in
                    NavigationLink(destination: EastonsEntryDetailView(initialSlug: entry.slug)) {
                        dictionaryRow(entry)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 2)
                    }
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    private func dictionaryRow(_ entry: EastonsSlugIndexEntry) -> some View {
        HStack(alignment: .center, spacing: 8) {
            if let iconAsset = entry.categoryIconAsset {
                HarvousFAGlyph(assetName: iconAsset, edgePt: 11)
                    .foregroundStyle(Color.primary.opacity(0.35))
                    .frame(width: 14, alignment: .center)
            } else {
                Color.clear.frame(width: 14)
            }
            Text(entry.headword)
                .font(HarvousTypography.noteListTitle)
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

#endif
