import SwiftUI
import SwiftData

/// Single global sync-status pill, mirroring the web prototype's chip. Surfaces the offline /
/// saving / failed states from `HarvousSyncService`'s observed counts. Hidden when everything
/// is synced and online. Mounted once per platform surface (iOS chrome, iPad/Mac detail chrome).
/// The per-note `syncErrorBanner` in NoteInspectorView remains for detail.
struct HarvousSyncStatusChip: View {
    @Environment(\.modelContext) private var modelContext
    private let service = HarvousSyncService.shared

    /// Periodic refresh so local edits between flush/pull boundaries still update the count.
    private let refreshTimer = Timer.publish(every: 5, on: .main, in: .common).autoconnect()

    @State private var isRetrying = false

    private enum Variant { case offline, syncing, failed }

    private var isSyncing: Bool { service.isFlushing || service.isPulling || service.isIngesting }

    private var variant: Variant? {
        if service.stuckNotes > 0 { return .failed }
        if isSyncing || service.pendingLocalChanges > 0 { return .syncing }
        if service.isOffline { return .offline }
        return nil
    }

    var body: some View {
        Group {
            if let variant {
                chip(for: variant)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: variant)
        .onAppear { service.refreshCounts(context: modelContext) }
        .onReceive(refreshTimer) { _ in service.refreshCounts(context: modelContext) }
    }

    @ViewBuilder
    private func chip(for variant: Variant) -> some View {
        HStack(spacing: 7) {
            icon(for: variant)
            Text(label(for: variant))
                .font(HarvousTypography.caption)
                .foregroundStyle(variant == .failed ? Color.harvousWarning : .secondary)

            if variant == .failed {
                Button {
                    guard !isRetrying else { return }
                    isRetrying = true
                    Task {
                        await service.retryStuckNotes(context: modelContext)
                        service.refreshCounts(context: modelContext)
                        isRetrying = false
                    }
                } label: {
                    HStack(spacing: 5) {
                        HarvousFAGlyph(assetName: "Harvous.ArrowsRotate", edgePt: 11)
                        Text(isRetrying ? "Retrying…" : "Retry")
                            .font(HarvousTypography.caption)
                    }
                    .foregroundStyle(Color.harvousAccent)
                }
                .buttonStyle(.plain)
                .disabled(isRetrying)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            Capsule(style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.12), radius: 8, y: 2)
    }

    @ViewBuilder
    private func icon(for variant: Variant) -> some View {
        switch variant {
        case .offline:
            HarvousFAGlyph(assetName: "Harvous.Globe", edgePt: 12).foregroundStyle(.secondary)
        case .syncing:
            ProgressView().controlSize(.mini)
        case .failed:
            HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 12).foregroundStyle(Color.harvousWarning)
        }
    }

    private func label(for variant: Variant) -> String {
        switch variant {
        case .offline:
            return service.pendingLocalChanges > 0
                ? "You're offline — saved on this device"
                : "You're offline"
        case .syncing:
            return "Saving…"
        case .failed:
            return "Couldn't save to the cloud"
        }
    }
}
