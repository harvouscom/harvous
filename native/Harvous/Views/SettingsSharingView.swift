import SwiftUI

/// Settings → Sharing: list shared notes and stop sharing (mirrors web `PrototypeSharingPage`).
struct SettingsSharingView: View {
    @State private var notes: [APIMySharingNote] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var disablingNoteId: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Notes you have shared. Stop sharing to make them private again.")
                    .font(HarvousTypography.footnote)
                    .foregroundStyle(.secondary)

                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 24)
                } else if let errorMessage {
                    Text(errorMessage)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.red)
                } else if notes.isEmpty {
                    Text("Nothing shared yet. Use Share on a note to create a public link.")
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(notes) { note in
                        sharingNoteRow(note)
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: 480, alignment: .leading)
        }
        .task { await loadSharing() }
        .refreshable { await loadSharing() }
    }

    @ViewBuilder
    private func sharingNoteRow(_ note: APIMySharingNote) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(note.title)
                .font(HarvousTypography.body)
            HStack(spacing: 12) {
                Button("Copy link") {
                    copyToClipboard(note.shareUrl)
                }
                .buttonStyle(.bordered)
                Button("Stop sharing") {
                    Task { await disableNote(note) }
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .disabled(disablingNoteId == note.id)
            }
            .font(HarvousTypography.caption)
        }
        .padding(.vertical, 6)
    }

    @MainActor
    private func loadSharing() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let sharing = try await HarvousAPIClient.shared.getMySharing()
            notes = sharing.notes
        } catch {
            errorMessage = error.localizedDescription
            notes = []
        }
    }

    @MainActor
    private func disableNote(_ note: APIMySharingNote) async {
        disablingNoteId = note.id
        defer { disablingNoteId = nil }
        do {
            _ = try await HarvousAPIClient.shared.shareNote(serverNoteId: note.id, action: .disable)
            notes.removeAll { $0.id == note.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func copyToClipboard(_ text: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
    }
}

#if os(macOS)
import AppKit
#else
import UIKit
#endif
