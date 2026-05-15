import SwiftUI

// MARK: - Easton's entry view (shared)
//
// Renders a single Easton's Bible Dictionary entry — category chip, headword, body, see-also
// chips, optional disclaimer. Used by `ActiveHighlightDock` (when the active thread is a
// reference highlight) and `EastonsEntryDetailView` (sidebar dictionary mode drill-down).
//
// Slug-based, not query-based: the caller owns the `@Binding<String>` so see-also chips can
// swap the displayed entry **in place** without re-creating a parent view. Re-fetches whenever
// `slug` changes.

struct EastonsEntryView: View {
    @Binding var slug: String
    var showCategoryChip: Bool = true
    var showDisclaimer: Bool = true

    @State private var entry: EastonsDictionaryEntry?
    @State private var loadState: LoadState = .idle
    @State private var lastFetchedSlug: String?

    private enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case notFound
        case failed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            content
            if showDisclaimer {
                disclaimerRow
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            runFetch()
        }
        .onChange(of: slug) { _, _ in
            runFetch()
        }
    }

    @ViewBuilder
    private var content: some View {
        switch loadState {
        case .idle, .loading:
            HStack(spacing: 8) {
                ProgressView().scaleEffect(0.7)
                Text("Looking up…")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.primary.opacity(0.65))
            }
            .padding(.vertical, 4)
        case .notFound:
            Text("No Easton's entry found.")
                .font(.system(size: 13))
                .foregroundStyle(Color.primary.opacity(0.65))
        case .failed:
            Text("Couldn't load entry. Check your connection and try again.")
                .font(.system(size: 13))
                .foregroundStyle(Color.primary.opacity(0.65))
        case .loaded:
            if let entry { entryBody(entry) }
        }
    }

    @ViewBuilder
    private func entryBody(_ entry: EastonsDictionaryEntry) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(entry.headword)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.primary)
            if showCategoryChip, let category = entry.category, !category.isEmpty {
                Text(category.capitalized)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.primary.opacity(0.7))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.primary.opacity(0.08)))
            }
        }
        Text(entry.body)
            .font(.system(size: 13))
            .foregroundStyle(Color.primary.opacity(0.85))
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
        if !entry.seeAlso.isEmpty {
            seeAlsoRow(entry.seeAlso)
        }
    }

    private func seeAlsoRow(_ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("See also")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.primary.opacity(0.55))
            EastonsChipFlowLayout(spacing: 6) {
                ForEach(items, id: \.self) { item in
                    seeAlsoChip(item)
                }
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private func seeAlsoChip(_ item: String) -> some View {
        let matched = EastonsDictionaryService.shared.matchedSlug(forWord: item)
        Button {
            if let matched { slug = matched }
        } label: {
            Text(item)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(matched != nil ? Color.accentColor : Color.primary.opacity(0.45))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(
                        (matched != nil ? Color.accentColor : Color.primary).opacity(0.10)
                    )
                )
        }
        .buttonStyle(.plain)
        .disabled(matched == nil)
    }

    private var disclaimerRow: some View {
        Text("Easton's Bible Dictionary, 1897 · Public domain")
            .font(.system(size: 10))
            .foregroundStyle(Color.primary.opacity(0.45))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
    }

    // MARK: - Fetch

    private func runFetch() {
        let trimmed = slug.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else {
            loadState = .idle
            entry = nil
            lastFetchedSlug = nil
            return
        }
        if trimmed == lastFetchedSlug, loadState == .loaded { return }
        let service = EastonsDictionaryService.shared
        loadState = .loading
        lastFetchedSlug = trimmed
        Task {
            do {
                let fetched = try await service.fetchEntry(slug: trimmed)
                await MainActor.run {
                    if self.lastFetchedSlug == trimmed {
                        self.entry = fetched
                        self.loadState = .loaded
                    }
                }
            } catch EastonsDictionaryError.notFound {
                await MainActor.run {
                    if self.lastFetchedSlug == trimmed {
                        self.entry = nil
                        self.loadState = .notFound
                    }
                }
            } catch {
                await MainActor.run {
                    if self.lastFetchedSlug == trimmed {
                        self.entry = nil
                        self.loadState = .failed
                    }
                }
            }
        }
    }
}

// MARK: - Chip flow layout
//
// Wraps see-also chips across lines. Private to this file — no consumers outside Easton's entry views.

struct EastonsChipFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let rows = computeRows(maxWidth: maxWidth, subviews: subviews)
        let height = rows.reduce(0) { partial, row in
            partial + row.height + (partial > 0 ? spacing : 0)
        }
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: min(width, maxWidth), height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = computeRows(maxWidth: bounds.width, subviews: subviews)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            for index in row.indices {
                let sub = subviews[index]
                let size = sub.sizeThatFits(.unspecified)
                sub.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func computeRows(maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for (idx, sub) in subviews.enumerated() {
            let size = sub.sizeThatFits(.unspecified)
            let last = rows.count - 1
            let proposed = rows[last].width + (rows[last].indices.isEmpty ? 0 : spacing) + size.width
            if proposed <= maxWidth || rows[last].indices.isEmpty {
                rows[last].indices.append(idx)
                rows[last].width = proposed
                rows[last].height = max(rows[last].height, size.height)
            } else {
                rows.append(Row(indices: [idx], width: size.width, height: size.height))
            }
        }
        return rows
    }
}
