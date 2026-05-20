import SwiftData
import SwiftUI
#if os(iOS)
import UIKit
#endif

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
        HarvousFonts.font(size: 16, weight: 500, design: .default)
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
        #if os(macOS)
        if chipMainLabel != nil {
            buttonCore
                .buttonStyle(.bordered)
                .controlSize(.regular)
                .tint(HarvousColors.themeAccent(scriptureTheme))
        } else {
            buttonCore
        }
        #else
        buttonCore
            .buttonStyle(.plain)
        #endif
    }

    private var buttonCore: some View {
        Button {
            showPopover = true
        } label: {
            if let label = chipMainLabel {
                HStack(spacing: 6) {
                    FolderSymbol(
                        isContextUpdating: isFolderContextUpdating,
                        folderIconPt: HarvousFAIconMetrics.catalogGlyphBoxPt
                    )
                    .frame(
                        width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                        height: HarvousFAIconMetrics.catalogGlyphBoxPt
                    )
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
                .padding(.horizontal, 8)
                .frame(minHeight: 24)
            } else {
                FolderSymbol(
                    isContextUpdating: isFolderContextUpdating,
                    folderIconPt: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                #if os(iOS)
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                #endif
            }
        }
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
/// iOS: `[share]` + `[⋯]` in the navigation bar (system supplies the glass orb).
/// macOS: `[share]` + `[⋯]` in the toolbar (`MacNoteShareMoreToolbar`).
struct NoteShareMoreBar: View {
    @Bindable var note: Note
    @Environment(\.modelContext) private var modelContext
    var onDeleteConfirmed: () -> Void
    /// iOS only: opens full note inspector (tags, highlights, metadata).
    var onOpenNoteDetails: (() -> Void)?
    /// Live editor snapshot; when `nil`, uses persisted `note.title` / `note.body` (previews / fallback).
    var shareSnapshot: (() -> NoteShareSnapshot)?

    @State private var confirmDelete = false

    init(
        note: Note,
        onDeleteConfirmed: @escaping () -> Void,
        onOpenNoteDetails: (() -> Void)? = nil,
        shareSnapshot: (() -> NoteShareSnapshot)? = nil
    ) {
        _note = Bindable(note)
        self.onDeleteConfirmed = onDeleteConfirmed
        self.onOpenNoteDetails = onOpenNoteDetails
        self.shareSnapshot = shareSnapshot
    }

    private var resolvedShareText: String {
        let snap = shareSnapshot?() ?? NoteShareSnapshot(title: note.title, body: note.body)
        return HarvousNoteShareBuilder.plainText(snapshot: snap)
    }

    var body: some View {
        HStack(spacing: 8) {
            HarvousSystemShareLink(shareText: resolvedShareText)
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
                        HarvousFAGlyph(assetName: "Harvous.CircleInfo", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
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
                        edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
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
                    #if os(iOS)
                    // UIKit's UIAction bridge can only extract a UIImage from a *direct* Image view —
                    // custom view structs (HarvousFAGlyph) are not bridged, so the icon renders
                    // without colour. Pre-tinting here and returning Image(uiImage:) directly is the
                    // only reliable way to get a red icon in a UIMenu item.
                    Image(uiImage: (HarvousFAGlyph.rasterTemplateUIImage(
                        named: "Harvous.Trash",
                        edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                    )?.withTintColor(.systemRed, renderingMode: .alwaysOriginal)) ?? UIImage())
                    #else
                    HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                        .foregroundStyle(.red)
                    #endif
                }
            }

        } label: {
            #if os(iOS)
            HarvousFAGlyph(assetName: "Harvous.Ellipsis", edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt)
                .foregroundStyle(.primary)
            #else
            HarvousFAGlyph(
                assetName: "Harvous.Ellipsis",
                edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
            )
            .frame(
                width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                height: HarvousFAIconMetrics.catalogGlyphBoxPt
            )
            #endif
        }
#if os(iOS)
        .menuIndicator(.hidden)
        // `ContentView` uses `NavigationStack.tint(.harvousAccent)`; override so this control matches neutral bar glyphs (cf. SpaceSwitcher note).
        .tint(.primary)
#else
        .buttonStyle(.bordered)
        .menuIndicator(.hidden)
#endif
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
    var liveShareSnapshot: NoteShareSnapshot
    var onDeleteConfirmed: () -> Void

    @State private var confirmDelete = false

    init(
        note: Note,
        liveShareSnapshot: NoteShareSnapshot,
        onDeleteConfirmed: @escaping () -> Void
    ) {
        _note = Bindable(note)
        self.liveShareSnapshot = liveShareSnapshot
        self.onDeleteConfirmed = onDeleteConfirmed
    }

    private var toolbarShareText: String {
        HarvousNoteShareBuilder.plainText(snapshot: liveShareSnapshot)
    }

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            HarvousSystemShareLink(shareText: toolbarShareText)

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
                            edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
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
                        HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                            .foregroundStyle(.red)
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

/// Share + delete as a separate toolbar group.
/// Kept as a façade so call sites that still reference this name compile.
struct NoteShareDeleteBar: View {
    var note: Note
    var onDeleteConfirmed: () -> Void
    var onOpenNoteDetails: (() -> Void)?
    var shareSnapshot: (() -> NoteShareSnapshot)?

    init(
        note: Note,
        onDeleteConfirmed: @escaping () -> Void,
        onOpenNoteDetails: (() -> Void)? = nil,
        shareSnapshot: (() -> NoteShareSnapshot)? = nil
    ) {
        self.note = note
        self.onDeleteConfirmed = onDeleteConfirmed
        self.onOpenNoteDetails = onOpenNoteDetails
        self.shareSnapshot = shareSnapshot
    }

    var body: some View {
        NoteShareMoreBar(
            note: note,
            onDeleteConfirmed: onDeleteConfirmed,
            onOpenNoteDetails: onOpenNoteDetails,
            shareSnapshot: shareSnapshot
        )
    }
}
