import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Token-based share popover. Mirrors the prototype web popover at
/// `spa/src/pages/prototype/PrototypeSharePopover.tsx`:
///   * Private → primary button to enable sharing.
///   * Public → read-only URL field with copy + refresh + stop sharing.
///   * Inline loading / error states.
///
/// Talks to `POST /api/notes/:serverId/share` via `HarvousAPIClient.shareNote`.
/// On every success, the local `Note` is updated with the new `isPublic` /
/// `shareToken` so the sibling button styling reflects share-state at a glance,
/// and `markDirty()` queues the row for upload — but the canonical write has
/// already happened server-side via the share endpoint.
struct NoteSharePopoverView: View {
    @Bindable var note: Note
    @Environment(\.modelContext) private var modelContext
    /// Allows the caller to dismiss the popover after "Stop sharing".
    var onDismiss: () -> Void
    /// Plain-text rendering of the note (title + body) for the system share
    /// sheet. Lives in the popover so we don't need a separate toolbar button.
    var shareText: String = ""

    @State private var isBusy = false
    @State private var errorMessage: String?
    @State private var copied = false

    // The server returns a full `shareUrl`, but we also reconstruct it
    // client-side from `note.shareToken` so the field paints instantly when
    // the popover opens for an already-shared note.
    private var shareURL: String? {
        guard note.isPublic, let token = note.shareToken, !token.isEmpty else { return nil }
        return "https://app.harvous.com/shared/note/\(token)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Share note")
                    .font(HarvousTypography.sharePopoverTitle)
                Text(note.isPublic
                     ? "Anyone with the link can view this note."
                     : "Only you can see this note. Enable sharing to get a link.")
                .font(HarvousTypography.sharePopoverBody)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }

            if !note.isPublic {
                Button(action: { Task { await runShare(.enable) } }) {
                    HStack(spacing: 6) {
                        if isBusy { ProgressView().controlSize(.small) }
                        Text(isBusy ? "Creating link…" : "Create share link")
                    }
                    .font(HarvousTypography.sharePopoverPrimaryButton)
                    .frame(maxWidth: .infinity)
                }
                .controlSize(.large)
                .buttonStyle(.borderedProminent)
                .disabled(isBusy || !canShare)
                if !canShare {
                    Text("Sync this note to the cloud before sharing.")
                        .font(HarvousTypography.sharePopoverBody)
                        .foregroundStyle(.secondary)
                }
            } else {
                HStack(spacing: 6) {
                    Text(shareURL ?? "")
                        .font(HarvousTypography.popoverURL)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color.secondary.opacity(0.08))
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .textSelection(.enabled)

                    Button(action: copyURL) {
                        HStack(spacing: 4) {
                            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 12, weight: .semibold))
                            Text(copied ? "Copied" : "Copy")
                        }
                        .font(HarvousTypography.sharePopoverAction)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .fixedSize(horizontal: true, vertical: false)
                    .disabled(shareURL == nil)
                }
                .frame(maxWidth: .infinity)

                HStack {
                    Button("Get a new link") { Task { await runShare(.refresh) } }
                        .disabled(isBusy)
                    Spacer()
                    Button("Stop sharing", role: .destructive) { Task { await runShare(.disable) } }
                        .disabled(isBusy)
                }
                .font(HarvousTypography.sharePopoverAction)
            }

            if let msg = errorMessage {
                Text(msg)
                    .font(HarvousTypography.sharePopoverBody)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // System share sheet — plain-text export (Messages, Mail, etc.).
            // Hidden when there's nothing to share (empty draft) to mirror the
            // disabled state of the old standalone Share button.
            if !shareText.isEmpty {
                Divider()
                ShareLink(item: shareText) {
                    HStack(spacing: 8) {
                        HarvousFAGlyph(
                            assetName: "Harvous.ShareSquare",
                            edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                        )
                        Text("Share as text…")
                    }
                    .font(HarvousTypography.sharePopoverAction)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary)
            }
        }
        .harvousListMenuTypography()
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(minWidth: 300, idealWidth: 340, maxWidth: 380)
        #if os(iOS)
        // Present as a compact anchored popover (a tidy card by the button) instead of the
        // default large sheet — the content is small, mirroring the folder chip's clean popover.
        .presentationCompactAdaptation(.popover)
        #endif
    }

    /// Sharing requires the note to exist on the server. Brand-new local notes
    /// won't have a `serverId` until the first upload pass.
    private var canShare: Bool { note.serverId != nil }

    private func runShare(_ action: HarvousAPIClient.ShareAction) async {
        guard let serverId = note.serverId else { return }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }
        do {
            let resp = try await HarvousAPIClient.shared.shareNote(
                serverNoteId: serverId,
                action: action
            )
            note.isPublic = resp.isPublic
            note.shareToken = resp.shareToken
            note.updatedAt = Date()
            // Server is authoritative for share state, but we also flag for
            // sync so other surfaces (lists, badges) pick the change up.
            note.needsSync = true
            try? modelContext.saveWithLogging()
            if action == .disable {
                onDismiss()
            }
        } catch HarvousAPIError.unauthorized {
            errorMessage = "Your session expired. Sign in again."
        } catch let err as HarvousAPIError {
            errorMessage = err.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func copyURL() {
        guard let url = shareURL else { return }
        #if os(iOS)
        UIPasteboard.general.string = url
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
        #endif
        copied = true
        Task {
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            await MainActor.run { copied = false }
        }
    }
}
