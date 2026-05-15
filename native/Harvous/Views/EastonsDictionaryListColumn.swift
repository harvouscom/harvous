import SwiftUI

#if os(macOS)

/// Sidebar column listing all Easton's Bible Dictionary entries A-Z with category filter tabs and
/// search. Tapping a row pushes `EastonsEntryDetailView` inside the parent `NavigationStack`.
struct EastonsDictionaryListColumn: View {
    var externalSearchText: Binding<String>? = nil

    @ObservedObject private var service = EastonsDictionaryService.shared
    @State private var categoryFilter: CategoryFilter = .all

    private enum CategoryFilter: String, CaseIterable, Identifiable {
        case all
        case person
        case place
        case thing

        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "All"
            case .person: return "People"
            case .place: return "Places"
            case .thing: return "Things"
            }
        }
    }

    private var searchQuery: String {
        externalSearchText?.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private var filteredEntries: [EastonsSlugIndexEntry] {
        let all = service.slugIndex.values
        let categoryFiltered: [EastonsSlugIndexEntry]
        if categoryFilter == .all {
            categoryFiltered = Array(all)
        } else {
            categoryFiltered = all.filter { ($0.category ?? "") == categoryFilter.rawValue }
        }
        let q = searchQuery.lowercased()
        let searched: [EastonsSlugIndexEntry]
        if q.isEmpty {
            searched = categoryFiltered
        } else {
            searched = categoryFiltered.filter { $0.headword.lowercased().contains(q) }
        }
        return searched.sorted { $0.headword.localizedCaseInsensitiveCompare($1.headword) == .orderedAscending }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Category", selection: $categoryFilter) {
                ForEach(CategoryFilter.allCases) { filter in
                    Text(filter.label).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 10)
            .padding(.top, 8)
            .padding(.bottom, 6)

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
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 10))
                }
                .listStyle(.plain)
            }
        }
    }

    private func dictionaryRow(_ entry: EastonsSlugIndexEntry) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.headword)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.primary)
                if let category = entry.category, !category.isEmpty {
                    Text(category.capitalized)
                        .font(.system(size: 11))
                        .foregroundStyle(Color.primary.opacity(0.5))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .contentShape(Rectangle())
    }
}

#endif
