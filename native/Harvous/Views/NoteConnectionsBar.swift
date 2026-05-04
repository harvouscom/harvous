import SwiftData
import SwiftUI

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
                        ConnectionsTrailPill(
                            label: Self.truncated(resolvedIncomingTitle(for: item)),
                            icon: "arrow.left"
                        ) {
                            onOpenLinkedNote(item.parentNoteId)
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.tertiary)
                    }
                    Text(Self.truncated(trimmedTitle))
                        .font(HarvousTypography.caption)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Capsule(style: .continuous).fill(Color.primary.opacity(0.09)))
                    ForEach(snapshot.outgoing, id: \.id) { item in
                        if let linkedId = item.linkedNoteId {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.tertiary)
                            ConnectionsTrailPill(
                                label: Self.truncated(resolvedLinkedTitle(for: item)),
                                icon: "arrow.right"
                            ) {
                                onOpenLinkedNote(linkedId)
                            }
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
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 11, weight: .semibold))
                Text("Connect note")
                    .font(HarvousTypography.caption)
            }
            .lineLimit(1)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule(style: .continuous).fill(Color.primary.opacity(0.05)))
        }
        .buttonStyle(.plain)
    }

    private var addConnectionPill: some View {
        Button {
            showConnectPicker = true
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.primary.opacity(0.85))
                .frame(width: 28, height: 28)
                .background(Capsule(style: .continuous).fill(Color.primary.opacity(0.06)))
        }
        .buttonStyle(.plain)
        .help("Connect another note")
        .accessibilityLabel("Connect note")
    }
}

private struct ConnectionsTrailPill: View {
    let label: String
    let icon: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(label)
                    .lineLimit(1)
            }
            .font(HarvousTypography.caption)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(Capsule(style: .continuous).fill(Color.primary.opacity(0.05)))
        }
        .buttonStyle(.plain)
    }
}
