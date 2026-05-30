import SwiftData
import SwiftUI

/// Faded blurred stroke clipped to capsule; tune together with `ScripturePillInnerStrokeLikeConnectionsCapsule` on raster pills.
private struct HarvousConnectionsCapsuleInnerShadow: View {
    @Environment(\.colorScheme) private var colorScheme

    private var isDarkAppearance: Bool { colorScheme == .dark }

    var body: some View {
        Capsule(style: .continuous)
            .stroke(shadowTint, lineWidth: 5.5)
            .blur(radius: 3)
            .blendMode(isDarkAppearance ? .softLight : .multiply)
            .mask(Capsule(style: .continuous))
            .allowsHitTesting(false)
    }

    private var shadowTint: Color {
        isDarkAppearance ? Color.white.opacity(0.036) : Color.black.opacity(0.042)
    }
}

private extension View {
    /// Capsule backing with faded perimeter stroke (`multiply` light / `softLight` dark), matching scripture pills.
    func harvousConnectionsPillBackdrop(fillOpacity: Double) -> some View {
        background {
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(fillOpacity))
                .overlay {
                    HarvousConnectionsCapsuleInnerShadow()
                }
        }
    }
}

/// Incoming / outgoing linked-note trail plus add-connection affordance (macOS + iOS).
struct NoteConnectionsBar: View {
    let note: Note
    var snapshot: ThreadStore.TrailSnapshot
    var currentNoteTitle: String
    var onOpenLinkedNote: (UUID) -> Void
    var onConnectionsChanged: (() -> Void)?
    /// Horizontal inset applied *inside* the scroll view so leading/trailing pills
    /// are never clipped by the container boundary — mirrors NoteToolbar's layout.
    var horizontalEdgePadding: CGFloat = 20

    @Environment(\.modelContext) private var modelContext
    @State private var showConnectPicker = false

    /// Soft cap for connection pill labels. Longer titles are truncated with an ellipsis
    /// so a row of pills stays scannable on narrow editor widths (both macOS and iOS).
    private static let pillLabelMaxCharacters = 28

    private var trimmedTitle: String {
        let t = currentNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? "Current note" : t
    }

    /// Looks up the live linked-note title so the pill reflects renames after the marker was created.
    /// Falls back to the marker's cached `linkedNoteTitle`, then its `focusTitle`, then "Untitled note".
    private func resolvedLinkedTitle(for marker: StudyThread) -> String {
        if let nid = marker.linkedNoteId,
           let linked = ThreadStore.fetchNote(id: nid, modelContext: modelContext) {
            let live = linked.title.trimmingCharacters(in: .whitespacesAndNewlines)
            if !live.isEmpty { return live }
        }
        let cached = marker.linkedNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cached.isEmpty { return cached }
        let focus = marker.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !focus.isEmpty { return focus }
        return "Untitled note"
    }

    /// Looks up the live title of the *parent* (incoming direction) so the pill never shows stale snapshot text.
    private func resolvedIncomingTitle(for marker: StudyThread) -> String {
        if let parent = ThreadStore.fetchNote(id: marker.parentNoteId, modelContext: modelContext) {
            let live = parent.title.trimmingCharacters(in: .whitespacesAndNewlines)
            if !live.isEmpty { return live }
        }
        let focus = marker.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return focus.isEmpty ? "Untitled note" : focus
    }

    private static func truncated(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > pillLabelMaxCharacters else { return trimmed }
        let cut = String(trimmed.prefix(pillLabelMaxCharacters - 1))
            .trimmingCharacters(in: .whitespaces)
        return cut + "…"
    }

    private var hasTrailLinks: Bool {
        !snapshot.incoming.isEmpty || !snapshot.outgoing.isEmpty
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if !hasTrailLinks {
                    connectPlaceholderPill
                } else {
                    ForEach(snapshot.incoming, id: \.id) { item in
                        RemovableConnectionsTrailPill(
                            label: Self.truncated(resolvedIncomingTitle(for: item)),
                            glyphAssetName: "Harvous.ArrowLeft",
                            onNavigate: { onOpenLinkedNote(item.parentNoteId) },
                            onRemove: {
                                ThreadStore.deleteLinkedNoteMarker(item, modelContext: modelContext)
                                if let parent = ThreadStore.fetchNote(id: item.parentNoteId, modelContext: modelContext) {
                                    HarvousVaultExporter.scheduleWrite(note: parent, modelContext: modelContext)
                                }
                                onConnectionsChanged?()
                            }
                        )
                        HarvousFAGlyph(assetName: "Harvous.ArrowsLeftRight", edgePt: 10)
                            .foregroundStyle(.tertiary)
                    }
                    Text(Self.truncated(trimmedTitle))
                        .font(HarvousTypography.caption)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .harvousConnectionsPillBackdrop(fillOpacity: 0.09)
                    ForEach(snapshot.outgoing, id: \.id) { item in
                        if let linkedId = item.linkedNoteId {
                            HarvousFAGlyph(assetName: "Harvous.ArrowsLeftRight", edgePt: 10)
                                .foregroundStyle(.tertiary)
                            RemovableConnectionsTrailPill(
                                label: Self.truncated(resolvedLinkedTitle(for: item)),
                                glyphAssetName: "Harvous.ArrowRight",
                                onNavigate: { onOpenLinkedNote(linkedId) },
                                onRemove: {
                                    ThreadStore.deleteLinkedNoteMarker(item, modelContext: modelContext)
                                    HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
                                    onConnectionsChanged?()
                                }
                            )
                        }
                    }
                    addConnectionPill
                }
            }
            .padding(.horizontal, horizontalEdgePadding)
        }
        .frame(height: 44)
        #if os(macOS)
        .popover(isPresented: $showConnectPicker, arrowEdge: .bottom) {
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
        }
        #else
        .sheet(isPresented: $showConnectPicker) {
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
        #endif
    }

    private var connectPlaceholderPill: some View {
        Button {
            showConnectPicker = true
        } label: {
            HStack(spacing: 6) {
                HarvousFAGlyph(assetName: "Harvous.ArrowRightArrowLeft", edgePt: 11)
                    .foregroundStyle(.secondary)
                Text("Connect note")
                    .font(HarvousTypography.caption)
            }
            .lineLimit(1)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .harvousConnectionsPillBackdrop(fillOpacity: 0.05)
        }
        .buttonStyle(.plain)
    }

    private var addConnectionPill: some View {
        Button {
            showConnectPicker = true
        } label: {
            HarvousFAGlyph(assetName: "Harvous.Plus", edgePt: 12)
                .foregroundStyle(.primary.opacity(0.85))
                .frame(width: 28, height: 28)
                .harvousConnectionsPillBackdrop(fillOpacity: 0.06)
        }
        .buttonStyle(.plain)
        .help("Connect another note")
        .accessibilityLabel("Connect note")
    }
}

private struct RemovableConnectionsTrailPill: View {
    let label: String
    let glyphAssetName: String
    let onNavigate: () -> Void
    let onRemove: () -> Void

    /// Pointer hover (Mac / iPad mouse): reveals inline remove. Touch devices rely on context menu + accessibility.
    @State private var hoverRemoval = false

    var body: some View {
        HStack(spacing: 5) {
            Button(action: onNavigate) {
                HStack(spacing: 5) {
                    HarvousFAGlyph(assetName: glyphAssetName, edgePt: 10)
                    Text(label)
                        .font(HarvousTypography.caption)
                        .lineLimit(1)
                        .foregroundStyle(.primary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            #if os(macOS)
            .help("Open linked note")
            #endif

            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark")
                    .font(HarvousFonts.font(size: 9, weight: .bold, design: .default))
                    .symbolRenderingMode(.monochrome)
                    .foregroundStyle(Color.secondary.opacity(0.9))
                    .frame(width: 16, height: 16)
            }
            .buttonStyle(.plain)
            #if os(macOS)
            .help("Remove connection")
            #endif
            .accessibilityLabel("Remove connection to \(label)")
            .opacity(hoverRemoval ? 1 : 0)
            .frame(width: hoverRemoval ? 22 : 0)
            .clipped()
            .allowsHitTesting(hoverRemoval)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .harvousConnectionsPillBackdrop(fillOpacity: 0.05)
        .animation(.easeInOut(duration: 0.18), value: hoverRemoval)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.18)) {
                hoverRemoval = hovering
            }
        }
        .contextMenu {
            Button("Remove connection", role: .destructive) {
                onRemove()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Connected note, \(label)")
        .accessibilityHint(hoverRemoval ? "Close icon visible; activate to remove this connection" : "Opens the linked note. Use the context menu or accessibility actions to remove the connection.")
        .accessibilityActions {
            Button("Open note") {
                onNavigate()
            }
            Button("Remove connection", role: .destructive) {
                onRemove()
            }
        }
    }
}
