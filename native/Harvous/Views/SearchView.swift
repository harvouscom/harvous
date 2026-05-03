import SwiftUI
import SwiftData
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

struct SearchView: View {
    @Query private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var query = ""

    private var notesInActiveSpace: [Note] {
        let sid = spaceStore.activeSpaceUUID()
        return notes.filter { $0.resolvedSpaceId() == sid }
    }

    private var results: [Note] {
        guard !query.isEmpty else { return [] }
        let q = query.lowercased()
        return notesInActiveSpace.filter {
            $0.title.lowercased().contains(q) ||
            $0.body.lowercased().contains(q) ||
            $0.detectedRefs.contains(where: { $0.lowercased().contains(q) }) ||
            $0.tags.contains(where: { $0.lowercased().contains(q) })
        }
    }

    var body: some View {
        Group {
            if query.isEmpty {
                emptyPrompt
            } else if results.isEmpty {
                noResults
            } else {
                resultsList
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(harvousListChromeBackground)
        .navigationTitle("Search")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .searchable(text: $query, prompt: "Notes, verses, tags…")
        #if os(iOS)
        .autocorrectionDisabled(true)
        .textInputAutocapitalization(.never)
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

    private var emptyPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("Search your notes and scripture")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noResults: some View {
        VStack(spacing: 12) {
            Image(systemName: "doc.questionmark")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("No notes for \"\(query)\"")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var resultsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(results) { note in
                    VStack(spacing: 0) {
                        NavigationLink {
                            StatefulNoteEditorView(note: note)
                        } label: {
                            NoteFeedRow(note: note, variant: .conversation)
                                .padding(.horizontal, 16)
                        }
                        .buttonStyle(.plain)
                        Divider()
                            .padding(.leading, 72)
                    }
                }
            }
            .padding(.vertical, 8)
        }
    }
}

#Preview {
    NavigationStack {
        SearchView()
            .environmentObject(SpaceStore())
            .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    }
}
