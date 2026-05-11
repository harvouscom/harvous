import SwiftData
import SwiftUI

/// Folder chip toolbar item — tapping opens a compact folder editor popover.
struct NoteFolderChip: View {
    @Bindable var note: Note
    var isFolderContextUpdating: Bool
    var showFolderToolbarText: Bool
    var scriptureTheme: HarvousColors.ThemeVariant

    @State private var showPopover = false

    private var chipFont: Font {
        #if os(macOS)
        .system(size: 15, weight: .regular)
        #else
        .system(size: 16)
        #endif
    }

    private var folderChipLabelFont: Font {
        #if os(macOS)
        .system(size: 14, weight: .medium)
        #else
        HarvousFonts.font(size: 18, weight: 500, design: .default)
        #endif
    }

    private var chipMainLabel: String? {
        note.folderChipPrimaryLabelText()
    }

    private var extraCount: Int {
        note.folderChipAdditionalCount()
    }

    private var accessibilitySummary: String {
        let labels = note.allFolderMembershipLabels()
        if labels.isEmpty { return "No folder" }
        return "Folders: \(labels.joined(separator: ", "))"
    }

    var body: some View {
        Button {
            showPopover = true
        } label: {
            HStack(spacing: 6) {
                FolderSymbol(
                    isContextUpdating: isFolderContextUpdating,
                    folderIconPt: {
                        #if os(macOS)
                        15
                        #else
                        16
                        #endif
                    }()
                )
                if let label = chipMainLabel {
                    HStack(spacing: 4) {
                        Text(label)
                            .font(folderChipLabelFont)
                            .lineLimit(1)
                        if extraCount > 0 {
                            Text("+\(extraCount)")
                                .font(folderChipLabelFont)
                                .foregroundStyle(.secondary)
                        }
                    }
                    #if os(iOS)
                        .minimumScaleFactor(1)
                    #endif
                    .fixedSize(horizontal: true, vertical: false)
                    #if os(iOS)
                    .padding(.trailing, 8)
                    #endif
                    .opacity(showFolderToolbarText ? 1 : 0)
                    .offset(x: showFolderToolbarText ? 0 : -8)
                    .animation(.easeOut(duration: 0.18), value: showFolderToolbarText)
                }
            }
            #if os(macOS)
            .padding(.horizontal, 8)
            #endif
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
                ? "Opens a popover to edit folders"
                : "Opens a popover to add a folder"
        )
        #if os(macOS)
        .popover(isPresented: $showPopover, arrowEdge: .bottom) {
            FolderChipPopover(note: note)
        }
        #else
        .popover(isPresented: $showPopover) {
            FolderChipPopover(note: note)
        }
        #endif
    }
}

/// Share button + ellipsis "more" menu (pin toggle, delete with confirmation).
/// Apple Notes pattern: [share] [⋯ more].
///
/// macOS callers should prefer `MacNoteShareMoreToolbar` — same `ToolbarItemGroup` + `.bordered`
/// pattern as the note-details + account cluster in `ContentView`.
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
            // `Harvous.ShareSquare` ships with a non-square viewBox (576×512). Without an explicit
            // square frame the bordered button hugs the glyph and looks pinched next to the sidebar
            // cluster — match `sidebarHideSidebarToolbarButton`'s `catalogGlyphBoxPt` framing.
            HarvousFAGlyph(
                assetName: "Harvous.ShareSquare",
                edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
            )
            .frame(
                width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                height: HarvousFAIconMetrics.catalogGlyphBoxPt
            )
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
                    Label {
                        Text("Note details")
                    } icon: {
                        HarvousFAGlyph(assetName: "Harvous.LayoutSidebarRight", edgePt: 14)
                    }
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
                Label {
                    Text(note.isPinned ? "Unpin Note" : "Pin Note")
                } icon: {
                    HarvousFAGlyph(
                        assetName: note.isPinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                        edgePt: 14
                    )
                }
            }

            Divider()

            Button(role: .destructive) {
                confirmDelete = true
            } label: {
                Label {
                    Text("Delete Note")
                } icon: {
                    HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 14)
                }
            }
        } label: {
            HarvousFAGlyph(
                assetName: "Harvous.Ellipsis",
                edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
            )
            .frame(
                width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                height: HarvousFAIconMetrics.catalogGlyphBoxPt
            )
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

#if os(macOS)
/// macOS — mirrors the trailing toolbar cluster in `ContentView` (`ToolbarItemGroup` +
/// `.buttonStyle(.bordered)` for each control). That’s what produces the unified “pill” with the
/// system chrome — not a hand-drawn capsule. The profile `Menu` hides the pull-down chevron with
/// `menuIndicator(.hidden)`; we do the same for “More” so it matches.
struct MacNoteShareMoreToolbar: ToolbarContent {
    @Bindable var note: Note
    @Environment(\.modelContext) private var modelContext
    var scriptureTheme: HarvousColors.ThemeVariant
    var onDeleteConfirmed: () -> Void

    @State private var confirmDelete = false

    init(
        note: Note,
        scriptureTheme: HarvousColors.ThemeVariant,
        onDeleteConfirmed: @escaping () -> Void
    ) {
        _note = Bindable(note)
        self.scriptureTheme = scriptureTheme
        self.onDeleteConfirmed = onDeleteConfirmed
    }

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {} label: {
                HarvousFAGlyph(
                    assetName: "Harvous.ShareSquare",
                    edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                .frame(
                    width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                    height: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
            }
            .buttonStyle(.bordered)
            .controlSize(.regular)
            .disabled(true)
            .opacity(0.4)
            .accessibilityLabel("Share")
            .accessibilityHint("Share is not yet available")

            Menu {
                Button {
                    note.isPinned.toggle()
                    note.updatedAt = Date()
                    try? modelContext.saveWithLogging()
                    HarvousNoteSpotlightIndexer.reindex(note: note)
                    HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
                } label: {
                    Label {
                        Text(note.isPinned ? "Unpin Note" : "Pin Note")
                    } icon: {
                        HarvousFAGlyph(
                            assetName: note.isPinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                            edgePt: 14
                        )
                    }
                }

                Divider()

                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label {
                        Text("Delete Note")
                    } icon: {
                        HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 14)
                    }
                }
            } label: {
                HarvousFAGlyph(
                    assetName: "Harvous.Ellipsis",
                    edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                .frame(
                    width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                    height: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
            }
            .menuIndicator(.hidden)
            .buttonStyle(.bordered)
            .controlSize(.regular)
            .accessibilityLabel("More options")
            .confirmationDialog(
                "Delete this note? This cannot be undone.",
                isPresented: $confirmDelete,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) { onDeleteConfirmed() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
#endif

// MARK: - Legacy aliases

/// Toolbar group — folder chip opens its own popover.
struct NoteTopBar: View {
    @Bindable var note: Note
    var isFolderContextUpdating: Bool
    var showFolderToolbarText: Bool
    var scriptureTheme: HarvousColors.ThemeVariant

    var body: some View {
        NoteFolderChip(
            note: note,
            isFolderContextUpdating: isFolderContextUpdating,
            showFolderToolbarText: showFolderToolbarText,
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
