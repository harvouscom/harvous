import SwiftData
import SwiftUI

/// Incoming / outgoing linked-note trail plus add-connection affordance (macOS + iOS).
struct NoteConnectionsBar: View {
    let note: Note
    var snapshot: ThreadStore.TrailSnapshot
    var currentNoteTitle: String
    var onOpenLinkedNote: (UUID) -> Void
    var onConnectionsChanged: (() -> Void)?

    @Environment(\.modelContext) private var modelContext
    @State private var showConnectPicker = false

    private var trimmedTitle: String {
        let t = currentNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? "Current note" : t
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
                        ConnectionsTrailPill(label: item.focusTitle.isEmpty ? "Previous" : item.focusTitle, icon: "arrow.left") {
                            onOpenLinkedNote(item.parentNoteId)
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.tertiary)
                    }
                    Text(trimmedTitle)
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
                                label: item.linkedNoteTitle.isEmpty ? item.focusTitle : item.linkedNoteTitle,
                                icon: "arrow.right"
                            ) {
                                onOpenLinkedNote(linkedId)
                            }
                        }
                    }
                    addConnectionPill
                }
            }
        }
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
