#if os(macOS)
import SwiftUI

/// Legacy macOS toolbar chip (prefer `NoteCollectionChip` — collection editor popover + inspector elsewhere).
/// Folder icon + optional collection label.
struct MacCollectionChip: View {
    /// Watching `Note` directly so SwiftData edits to `primaryCollection` flow through without a parent rerender.
    let note: Note?
    var onTap: () -> Void

    @Environment(\.harvousScriptureTheme) private var scriptureTheme

    private var trimmedLabel: String? {
        let raw = note?.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return raw.isEmpty ? nil : raw
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                CollectionSymbol(
                    isContextUpdating: false,
                    font: .system(size: 13, weight: .regular)
                )
                if let trimmedLabel {
                    Text(trimmedLabel)
                        .font(HarvousFonts.font(size: 13, weight: 500, design: .default))
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .padding(.trailing, 8)
                }
            }
            .frame(minHeight: 24)
        }
        .buttonStyle(.bordered)
        .tint(
            trimmedLabel != nil
                ? HarvousColors.themeAccent(scriptureTheme)
                : Color.secondary
        )
        .disabled(note == nil)
        .accessibilityLabel(trimmedLabel.map { "Collection: \($0)" } ?? "No collection")
        .accessibilityHint(trimmedLabel != nil ? "Edit collection" : "Add a collection")
        .help(trimmedLabel ?? "No collection")
    }
}
#endif
