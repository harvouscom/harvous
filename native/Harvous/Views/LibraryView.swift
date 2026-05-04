import SwiftUI
import SwiftData
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

struct LibraryView: View {
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    #if os(iOS)
    var externalSearchText: Binding<String>? = nil
    var externalSearchPresented: Binding<Bool>? = nil
    @State private var fallbackSearchText = ""
    #endif

    private var notesInActiveSpace: [Note] {
        let sid = spaceStore.activeSpaceUUID()
        return notes.filter { $0.resolvedSpaceId() == sid }
    }

    private var grouped: [(key: String, notes: [Note])] {
        var dict: [String: [Note]] = [:]
        for note in notesInActiveSpace {
            let k = (note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? "Ungrouped"
            dict[k, default: []].append(note)
        }
        return dict
            .map { (key: $0.key, notes: $0.value) }
            .sorted { a, b in
                if a.key == "Ungrouped" { return false }
                if b.key == "Ungrouped" { return true }
                let aDate = a.notes.map(\.updatedAt).max() ?? .distantPast
                let bDate = b.notes.map(\.updatedAt).max() ?? .distantPast
                return aDate > bDate
            }
    }

    private var activeSearchQuery: String {
        #if os(iOS)
        if let externalSearchText {
            return externalSearchText.wrappedValue
        }
        return fallbackSearchText
        #else
        return ""
        #endif
    }

    private var groupedFiltered: [(key: String, notes: [Note])] {
        let base = grouped
        #if os(iOS)
        let trimmed = activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return base }
        let ql = trimmed.lowercased()
        return base.compactMap { pair in
            let notesFiltered: [Note]
            if pair.key.lowercased().contains(ql) {
                notesFiltered = pair.notes
            } else {
                notesFiltered = pair.notes.filter { libraryNoteMatches($0, ql) }
            }
            guard !notesFiltered.isEmpty else { return nil }
            return (pair.key, notesFiltered)
        }
        #else
        return base
        #endif
    }

    private func libraryNoteMatches(_ note: Note, _ ql: String) -> Bool {
        note.title.lowercased().contains(ql) ||
            note.body.lowercased().contains(ql) ||
            note.detectedRefs.contains(where: { $0.lowercased().contains(ql) }) ||
            note.tags.contains(where: { $0.lowercased().contains(ql) }) ||
            (note.primaryCollection?.lowercased().contains(ql) ?? false)
    }

    var body: some View {
        Group {
            if notesInActiveSpace.isEmpty {
                emptyState
            } else if !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && groupedFiltered.isEmpty {
                ContentUnavailableView.search(text: activeSearchQuery)
            } else {
                groupedList
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(harvousListChromeBackground)
        .navigationTitle("Collections")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        .modifier(
            LibraryIOSInlineSearchModifier(
                externalText: externalSearchText,
                externalPresented: externalSearchPresented,
                fallbackText: $fallbackSearchText
            )
        )
        #endif
    }

    private var harvousListChromeBackground: Color {
        #if os(iOS)
        Color(uiColor: .systemGroupedBackground)
        #elseif os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color.clear
        #endif
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "rectangle.stack")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("Your notes will organize here")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var groupedList: some View {
        List {
            ForEach(groupedFiltered, id: \.key) { group in
                Section {
                    ForEach(group.notes) { note in
                        NavigationLink(value: note.id) {
                            NoteFeedRow(note: note, variant: .conversation)
                        }
                        .listRowInsets(EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }
                } header: {
                    librarySectionHeader(title: group.key, count: group.notes.count)
                }
            }
        }
        .scrollContentBackground(.hidden)
        #if os(macOS)
        .listStyle(.sidebar)
        #else
        .listStyle(.plain)
        #endif
    }

    private func librarySectionHeader(title: String, count: Int) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.tertiary)
            Text(title)
                .font(HarvousTypography.noteListTitle)
                .foregroundStyle(.primary)
                .lineLimit(1)
            Spacer()
            Text("\(count) note\(count == 1 ? "" : "s")")
                .font(HarvousTypography.noteListPreview)
                .foregroundStyle(.secondary)
        }
        .textCase(nil)
        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
    }
}

#if os(iOS)
private struct LibraryIOSInlineSearchModifier: ViewModifier {
    var externalText: Binding<String>?
    var externalPresented: Binding<Bool>?
    @Binding var fallbackText: String

    func body(content: Content) -> some View {
        if let externalText, let externalPresented {
            content
                .searchable(text: externalText, isPresented: externalPresented, prompt: "Search")
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
        } else {
            content
                .searchable(text: $fallbackText, prompt: "Search")
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
        }
    }
}
#endif

#Preview {
    NavigationStack {
        LibraryView()
            .environmentObject(SpaceStore())
            .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    }
}
