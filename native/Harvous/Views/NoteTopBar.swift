import SwiftData
import SwiftUI

/// Collection chip toolbar item — tapping opens a compact collection editor popover.
struct NoteCollectionChip: View {
    @Bindable var note: Note
    var isCollectionContextUpdating: Bool
    var showCollectionToolbarText: Bool
    var scriptureTheme: HarvousColors.ThemeVariant

    @State private var showPopover = false

    private var chipFont: Font {
        #if os(macOS)
        .system(size: 15, weight: .regular)
        #else
        .system(size: 16)
        #endif
    }

    private var collectionLabelFont: Font {
        #if os(macOS)
        .system(size: 14, weight: .medium)
        #else
        HarvousFonts.font(size: 18, weight: 500, design: .default)
        #endif
    }

    private var chipMainLabel: String? {
        note.collectionChipPrimaryLabelText()
    }

    private var extraCount: Int {
        note.collectionChipAdditionalCount()
    }

    private var accessibilitySummary: String {
        let labels = note.allCollectionMembershipLabels()
        if labels.isEmpty { return "No collection" }
        return "Collections: \(labels.joined(separator: ", "))"
    }

    var body: some View {
        Button {
            showPopover = true
        } label: {
            HStack(spacing: 6) {
                CollectionSymbol(
                    isContextUpdating: isCollectionContextUpdating,
                    font: chipFont
                )
                if let label = chipMainLabel {
                    HStack(spacing: 4) {
                        Text(label)
                            .font(collectionLabelFont)
                            .lineLimit(1)
                        if extraCount > 0 {
                            Text("+\(extraCount)")
                                .font(collectionLabelFont)
                                .foregroundStyle(.secondary)
                        }
                    }
                    #if os(iOS)
                        .minimumScaleFactor(1)
                    #endif
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.trailing, 8)
                    .opacity(showCollectionToolbarText ? 1 : 0)
                    .offset(x: showCollectionToolbarText ? 0 : -8)
                    .animation(.easeOut(duration: 0.18), value: showCollectionToolbarText)
                }
            }
            .frame(minHeight: 24)
        }
        #if os(macOS)
        .buttonStyle(.bordered)
        .controlSize(.regular)
        .tint(
            chipMainLabel != nil
                ? HarvousColors.themeAccent(scriptureTheme)
                : Color.secondary
        )
        #else
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
        #endif
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint(
            chipMainLabel != nil
                ? "Opens a popover to edit collections"
                : "Opens a popover to add a collection"
        )
        #if os(macOS)
        .popover(isPresented: $showPopover, arrowEdge: .bottom) {
            CollectionChipPopover(note: note)
        }
        #else
        .popover(isPresented: $showPopover) {
            CollectionChipPopover(note: note)
        }
        #endif
    }
}

/// Share button + ellipsis "more" menu (pin toggle, delete with confirmation).
/// Apple Notes pattern: [share] [⋯ more]
struct NoteShareMoreBar: View {
    @Bindable var note: Note
    @Environment(\.modelContext) private var modelContext
    var scriptureTheme: HarvousColors.ThemeVariant
    var onDeleteConfirmed: () -> Void
    /// iOS only: opens full note inspector (tags, highlights, metadata).
    var onOpenNoteDetails: (() -> Void)?

    @State private var confirmDelete = false

    init(
        note: Note,
        scriptureTheme: HarvousColors.ThemeVariant,
        onDeleteConfirmed: @escaping () -> Void,
        onOpenNoteDetails: (() -> Void)? = nil
    ) {
        _note = Bindable(note)
        self.scriptureTheme = scriptureTheme
        self.onDeleteConfirmed = onDeleteConfirmed
        self.onOpenNoteDetails = onOpenNoteDetails
    }

    var body: some View {
        HStack(spacing: 8) {
            shareButton
            moreMenu
        }
        .confirmationDialog(
            "Delete this note? This cannot be undone.",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDeleteConfirmed()
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var shareButton: some View {
        Button {} label: {
            Image(systemName: "square.and.arrow.up")
        }
        #if os(macOS)
        .buttonStyle(.bordered)
        .controlSize(.regular)
        #else
        .buttonStyle(.bordered)
        #endif
        .tint(Color.secondary)
        .disabled(true)
        .opacity(0.4)
        .accessibilityLabel("Share")
        .accessibilityHint("Share is not yet available")
    }

    private var moreMenu: some View {
        Menu {
            #if os(iOS)
            if let onOpenNoteDetails {
                Button {
                    onOpenNoteDetails()
                } label: {
                    Label("Note details", systemImage: "sidebar.right")
                }

                Divider()
            }
            #endif

            Button {
                note.isPinned.toggle()
                note.updatedAt = Date()
                try? modelContext.saveWithLogging()
                HarvousNoteSpotlightIndexer.reindex(note: note)
                HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
            } label: {
                Label(
                    note.isPinned ? "Unpin Note" : "Pin Note",
                    systemImage: note.isPinned ? "pin.slash" : "pin"
                )
            }

            Divider()

            Button(role: .destructive) {
                confirmDelete = true
            } label: {
                Label("Delete Note", systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        #if os(macOS)
        .buttonStyle(.bordered)
        .controlSize(.regular)
        #else
        .buttonStyle(.bordered)
        #endif
        .tint(Color.secondary)
        .accessibilityLabel("More options")
    }
}

// MARK: - Legacy aliases

/// Toolbar group — collection chip opens its own popover.
struct NoteTopBar: View {
    @Bindable var note: Note
    var isCollectionContextUpdating: Bool
    var showCollectionToolbarText: Bool
    var scriptureTheme: HarvousColors.ThemeVariant

    var body: some View {
        NoteCollectionChip(
            note: note,
            isCollectionContextUpdating: isCollectionContextUpdating,
            showCollectionToolbarText: showCollectionToolbarText,
            scriptureTheme: scriptureTheme
        )
    }
}

/// Share (stub) + delete as a separate toolbar group.
/// Kept as a façade so call sites that still reference this name compile.
struct NoteShareDeleteBar: View {
    var note: Note
    var scriptureTheme: HarvousColors.ThemeVariant
    var onDeleteConfirmed: () -> Void
    var onOpenNoteDetails: (() -> Void)?

    init(
        note: Note,
        scriptureTheme: HarvousColors.ThemeVariant,
        onDeleteConfirmed: @escaping () -> Void,
        onOpenNoteDetails: (() -> Void)? = nil
    ) {
        self.note = note
        self.scriptureTheme = scriptureTheme
        self.onDeleteConfirmed = onDeleteConfirmed
        self.onOpenNoteDetails = onOpenNoteDetails
    }

    var body: some View {
        NoteShareMoreBar(
            note: note,
            scriptureTheme: scriptureTheme,
            onDeleteConfirmed: onDeleteConfirmed,
            onOpenNoteDetails: onOpenNoteDetails
        )
    }
}
