import SwiftUI
import SwiftData

/// The left-column note list — Bear / Apple Notes style.
/// Custom header with note count + search + new note. Clean two-line rows.
struct NoteListColumn: View {
    @Binding var selectedNote: Note?
    @Binding var showCompose: Bool

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var context

    @State private var searchText = ""
    @State private var searchVisible = false

    private var filtered: [Note] {
        guard !searchText.isEmpty else { return notes }
        let q = searchText.lowercased()
        return notes.filter {
            $0.title.lowercased().contains(q) ||
            $0.body.lowercased().contains(q) ||
            $0.detectedRefs.contains(where: { $0.lowercased().contains(q) })
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            listHeader
            if searchVisible {
                searchBar
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            // Warm separator instead of system Divider
            Color.separatorWarm.frame(height: 0.5)
            noteList
        }
        .background(Color.surfacePaper)
        #if os(macOS)
        .navigationBarBackButtonHidden(true)
        #endif
    }

    // MARK: - Header

    private var listHeader: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Notes")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.inkPrimary)
                Text("\(notes.count)")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(Color.inkTertiary)
            }

            Spacer()

            // Search toggle
            Button {
                withAnimation(HarvousAnimation.spring) {
                    searchVisible.toggle()
                    if !searchVisible { searchText = "" }
                }
            } label: {
                Image(systemName: searchVisible ? "xmark.circle.fill" : "magnifyingglass")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(searchVisible ? Color.inkSecondary : Color.inkTertiary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Search")

            // New note
            Button {
                showCompose = true
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.inkTertiary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .keyboardShortcut("n", modifiers: .command)
            .help("New Note (⌘N)")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        #if os(macOS)
        .padding(.top, 28)   // clear traffic light buttons (~y=7, h=12, plus breathing room)
        #endif
    }

    // MARK: - Search bar

    private var searchBar: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.caption)
                .foregroundStyle(Color.inkTertiary)
            TextField("Search", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundStyle(Color.inkPrimary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.surfaceInset, in: RoundedRectangle(cornerRadius: HarvousRadius.input))
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
    }

    // MARK: - Note list

    private var noteList: some View {
        Group {
            if filtered.isEmpty && notes.isEmpty {
                emptyState
            } else if filtered.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                List {
                    ForEach(filtered) { note in
                        let isSelected = selectedNote?.id == note.id
                        NoteRow(note: note)
                            .listRowInsets(EdgeInsets(top: 4, leading: 6, bottom: 4, trailing: 6))
                            .listRowBackground(
                                RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight)
                                    .fill(isSelected ? Color.surfaceInset : Color.clear)
                            )
                            .listRowSeparator(.hidden)
                            .onTapGesture { selectedNote = note }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    withAnimation {
                                        if selectedNote?.id == note.id { selectedNote = nil }
                                        context.delete(note)
                                    }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "note.text")
                .font(.system(size: 36))
                .foregroundStyle(Color.inkQuaternary)
            Text("No Notes")
                .font(.headline)
                .foregroundStyle(Color.inkSecondary)
            Text("Tap + to write your first note")
                .font(.subheadline)
                .foregroundStyle(Color.inkTertiary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Note row (Bear-style)

struct NoteRow: View {
    let note: Note

    private var timeString: String {
        let cal = Calendar.current
        if cal.isDateInToday(note.updatedAt) {
            return note.updatedAt.formatted(date: .omitted, time: .shortened)
        } else if cal.isDateInYesterday(note.updatedAt) {
            return "Yesterday"
        } else if let days = cal.dateComponents([.day], from: note.updatedAt, to: Date()).day, days < 7 {
            return note.updatedAt.formatted(.dateTime.weekday(.abbreviated))
        } else {
            return note.updatedAt.formatted(.dateTime.month(.abbreviated).day())
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Thread color accent — 3px left border
            if let color = note.color {
                color
                    .frame(width: 3)
                    .clipShape(RoundedRectangle(cornerRadius: 1.5))
                    .padding(.vertical, 10)
            } else {
                Color.clear.frame(width: 3)
            }

            VStack(alignment: .leading, spacing: 4) {
                // Title
                Text(note.title.isEmpty ? "New Note" : note.title)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                    .foregroundStyle(Color.inkPrimary)

                // Time · Preview
                HStack(spacing: 4) {
                    Text(timeString)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Color.inkSecondary)
                        .monospacedDigit()

                    if !note.excerpt.isEmpty {
                        Text("·")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.inkTertiary)
                        Text(note.excerpt)
                            .font(.system(size: 11))
                            .foregroundStyle(Color.inkTertiary)
                            .lineLimit(1)
                    }
                }

                // Scripture ref badge (if any)
                if let ref = note.primaryRef {
                    HStack(spacing: 3) {
                        Image(systemName: "book.closed.fill")
                            .font(.system(size: 9))
                        Text(ref)
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(.tint)
                }
            }
            .padding(.leading, 10)
            .padding(.trailing, 12)
            .padding(.vertical, 14)

            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}

#Preview {
    NoteListColumn(selectedNote: .constant(nil), showCompose: .constant(false))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(width: 268)
}
