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
        .onReceive(NotificationCenter.default.publisher(for: .harvousOpenFolderChipPopover)) { _ in
            showPopover = true
        }
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

/// Small accent dot overlaid on the share glyph to signal an active share link — a subtle
/// indicator instead of fully tinting the icon blue. The background-colored ring separates it
/// from the glyph beneath. Shared by the iPhone and macOS/iPad share buttons.
struct NoteShareStateDot: View {
    var body: some View {
        Circle()
            .fill(Color.accentColor)
            .frame(width: 7, height: 7)
            .overlay(
                Circle().stroke(.background, lineWidth: 1.5)
            )
            .accessibilityHidden(true)
    }
}

#if os(iOS)
/// iPhone trailing toolbar — standalone share orb. Hosted in its own `ToolbarItem` so the
/// system renders a separate glass capsule from the more menu (not one squished pill).
struct NoteShareToolbarButton: View {
    @Bindable var note: Note
    /// Live editor snapshot; when `nil`, uses persisted `note.title` / `note.body` (previews / fallback).
    var shareSnapshot: (() -> NoteShareSnapshot)?

    @State private var showShareLinkPopover = false

    init(note: Note, shareSnapshot: (() -> NoteShareSnapshot)? = nil) {
        _note = Bindable(note)
        self.shareSnapshot = shareSnapshot
    }

    private var resolvedShareText: String {
        let snap = shareSnapshot?() ?? NoteShareSnapshot(title: note.title, body: note.body)
        return HarvousNoteShareBuilder.plainText(snapshot: snap)
    }

    /// Single share entry point — opens a popover that hosts both the token-based share-link
    /// flow (`POST /api/notes/:id/share`) and the system Share Sheet for plain-text export.
    var body: some View {
        Button {
            showShareLinkPopover = true
        } label: {
            HarvousFAGlyph(
                assetName: "Harvous.ShareSquare",
                edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
            )
            // 40pt hit target (glyph stays small) so the button is easy to tap inside the bar capsule.
            .frame(width: 40, height: 40)
            .contentShape(Rectangle())
            // Glyph stays neutral; an active share link is flagged by a subtle accent dot (below)
            // rather than fully tinting the icon. `.tint(.primary)` keeps it from inheriting the nav accent.
            .foregroundStyle(.primary)
            .overlay(alignment: .topTrailing) {
                if note.isPublic {
                    NoteShareStateDot()
                        .padding(.top, 7)
                        .padding(.trailing, 7)
                }
            }
        }
        .buttonStyle(.plain)
        .tint(.primary)
        .accessibilityLabel(note.isPublic ? "Manage share" : "Share")
        .popover(isPresented: $showShareLinkPopover, arrowEdge: .top) {
            NoteSharePopoverView(
                note: note,
                onDismiss: { showShareLinkPopover = false },
                shareText: resolvedShareText
            )
        }
    }
}

/// iPhone trailing toolbar — standalone more-menu orb (note details / connect / pin / delete).
struct NoteMoreToolbarMenu: View {
    @Bindable var note: Note
    @Environment(\.modelContext) private var modelContext
    var onDeleteConfirmed: () -> Void
    /// Opens the full note inspector (tags, highlights, metadata).
    var onOpenNoteDetails: (() -> Void)?
    /// Called after a linked note is connected via the menu.
    var onConnectionsChanged: (() -> Void)?

    @State private var confirmDelete = false
    @State private var showConnectPicker = false

    init(
        note: Note,
        onDeleteConfirmed: @escaping () -> Void,
        onOpenNoteDetails: (() -> Void)? = nil,
        onConnectionsChanged: (() -> Void)? = nil
    ) {
        _note = Bindable(note)
        self.onDeleteConfirmed = onDeleteConfirmed
        self.onOpenNoteDetails = onOpenNoteDetails
        self.onConnectionsChanged = onConnectionsChanged
    }

    var body: some View {
        Menu {
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

            Button {
                showConnectPicker = true
            } label: {
                Label {
                    Text("Connect note")
                } icon: {
                    HarvousFAGlyph(
                        assetName: "Harvous.ArrowRightArrowLeft",
                        edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                    )
                }
            }

            Divider()

            Button {
                toggleNotePin()
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
                    Image(uiImage: (HarvousFAGlyph.rasterTemplateUIImage(
                        named: "Harvous.Trash",
                        edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                    )?.withTintColor(.systemRed, renderingMode: .alwaysOriginal)) ?? UIImage())
                }
            }
        } label: {
            HarvousFAGlyph(assetName: "Harvous.Ellipsis", edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt)
                .foregroundStyle(.primary)
                // Match the share button's 40pt hit target so the cluster reads as one evenly-tappable capsule.
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .menuIndicator(.hidden)
        // `ContentView` uses `NavigationStack.tint(.harvousAccent)`; override so this control matches neutral bar glyphs (cf. SpaceSwitcher note).
        .tint(.primary)
        .accessibilityLabel("More options")
        .confirmationDialog(
            "Delete this note? This cannot be undone.",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) { onDeleteConfirmed() }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showConnectPicker) {
            connectNotePickerSheet
        }
    }

    private var connectNotePickerSheet: some View {
        NavigationStack {
            ConnectNotePicker(
                spaceId: note.resolvedSpaceId(),
                parentNoteId: note.id,
                onPick: { picked in
                    _ = ThreadStore.createUnanchoredConnection(
                        parent: note,
                        linked: picked,
                        modelContext: modelContext
                    )
                    showConnectPicker = false
                    onConnectionsChanged?()
                },
                onCancel: { showConnectPicker = false }
            )
            .navigationTitle("Connect note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showConnectPicker = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func toggleNotePin() {
        note.isPinned.toggle()
        note.markDirtyMetadata()
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
    }
}
#endif

/// Trailing toolbar cluster: Find + Share + More. Used on macOS and iPad.
struct MacNoteShareMoreToolbar: ToolbarContent {
    @Bindable var note: Note
    @Environment(\.modelContext) private var modelContext
    var liveShareSnapshot: NoteShareSnapshot
    var onDeleteConfirmed: () -> Void
    var onConnectionsChanged: (() -> Void)?

    @State private var confirmDelete = false
    @State private var showShareLinkPopover = false
    @State private var showMoreMenu = false
    @State private var showConnectPicker = false

    init(
        note: Note,
        liveShareSnapshot: NoteShareSnapshot,
        onDeleteConfirmed: @escaping () -> Void,
        onConnectionsChanged: (() -> Void)? = nil
    ) {
        _note = Bindable(note)
        self.liveShareSnapshot = liveShareSnapshot
        self.onDeleteConfirmed = onDeleteConfirmed
        self.onConnectionsChanged = onConnectionsChanged
    }

    private var toolbarShareText: String {
        HarvousNoteShareBuilder.plainText(snapshot: liveShareSnapshot)
    }

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            NoteFindToolbarButton(useBorderedToolbarStyle: true)

            // Single share entry — popover hosts both the token-based share-link
            // flow and the system Share Sheet (plaintext export, inside the popover).
            Button {
                showShareLinkPopover = true
            } label: {
                HarvousFAGlyph(
                    assetName: "Harvous.ShareSquare",
                    edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                .frame(
                    width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                    height: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                // Glyph stays neutral; an active share link is flagged by a subtle accent dot.
                .foregroundStyle(.primary)
                .overlay(alignment: .topTrailing) {
                    if note.isPublic {
                        NoteShareStateDot()
                            .offset(x: 3, y: -3)
                    }
                }
            }
            .buttonStyle(.bordered)
            .accessibilityLabel(note.isPublic ? "Manage share" : "Share")
            .popover(isPresented: $showShareLinkPopover, arrowEdge: .bottom) {
                NoteSharePopoverView(
                    note: note,
                    onDismiss: { showShareLinkPopover = false },
                    shareText: toolbarShareText
                )
            }

            Group {
                #if os(macOS)
                macToolbarMoreMenu
                #else
                iosToolbarMoreMenu
                #endif
            }
            .confirmationDialog(
                "Delete this note? This cannot be undone.",
                isPresented: $confirmDelete,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) { onDeleteConfirmed() }
                Button("Cancel", role: .cancel) {}
            }
            #if os(iOS)
            .sheet(isPresented: $showConnectPicker) {
                toolbarConnectNotePickerSheet
            }
            #endif
        }
    }

    #if os(macOS)
    private var macToolbarMoreMenu: some View {
        Button {
            showMoreMenu.toggle()
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
        .buttonStyle(.bordered)
        .accessibilityLabel("More options")
        .popover(isPresented: $showMoreMenu, arrowEdge: .bottom) {
            HarvousPopoverMenuPanel {
                HarvousPopoverMenuRow(
                    title: note.isPinned ? "Unpin Note" : "Pin Note",
                    iconAsset: note.isPinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack"
                ) {
                    showMoreMenu = false
                    toggleToolbarNotePin()
                }
                HarvousPopoverMenuDivider()
                HarvousPopoverMenuRow(
                    title: "Delete Note",
                    iconAsset: "Harvous.Trash",
                    iconTint: .red,
                    titleTint: .red,
                    role: .destructive
                ) {
                    showMoreMenu = false
                    confirmDelete = true
                }
            }
        }
    }

    private func toggleToolbarNotePin() {
        note.isPinned.toggle()
        note.markDirtyMetadata()
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
    }
    #endif

    #if os(iOS)
    private var iosToolbarMoreMenu: some View {
        Menu {
            toolbarConnectNoteMenuButton

            Divider()

            Button {
                toggleToolbarNotePin()
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
    }

    private var toolbarConnectNoteMenuButton: some View {
        Button {
            showConnectPicker = true
        } label: {
            Label {
                Text("Connect note")
            } icon: {
                HarvousFAGlyph(
                    assetName: "Harvous.ArrowRightArrowLeft",
                    edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                )
            }
        }
    }

    private var toolbarConnectNotePickerSheet: some View {
        NavigationStack {
            ConnectNotePicker(
                spaceId: note.resolvedSpaceId(),
                parentNoteId: note.id,
                onPick: { picked in
                    _ = ThreadStore.createUnanchoredConnection(
                        parent: note,
                        linked: picked,
                        modelContext: modelContext
                    )
                    showConnectPicker = false
                    onConnectionsChanged?()
                },
                onCancel: { showConnectPicker = false }
            )
            .navigationTitle("Connect note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showConnectPicker = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func toggleToolbarNotePin() {
        note.isPinned.toggle()
        note.markDirtyMetadata()
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
    }
    #endif
}

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

