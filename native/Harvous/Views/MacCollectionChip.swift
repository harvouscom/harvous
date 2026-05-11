#if os(macOS)
import SwiftUI

/// Legacy macOS toolbar chip (prefer `NoteFolderChip` — folder editor popover + inspector elsewhere).
/// Same behavior as `MacFolderChip`; kept only if older UI references the type name.
/// Folder icon + optional folder label (`primaryFolder`).
struct MacCollectionChip: View {
    /// Watching `Note` directly so SwiftData edits to `primaryFolder` flow through without a parent rerender.
    let note: Note?
    var onTap: () -> Void

    @Environment(\.harvousScriptureTheme) private var scriptureTheme

    private var trimmedLabel: String? {
        note?.folderChipPrimaryLabelText()
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                FolderSymbol(isContextUpdating: false, folderIconPt: 14)
                if let trimmedLabel {
                    Text(trimmedLabel)
                        .font(HarvousFonts.font(size: 14, weight: 500, design: .default))
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
        .accessibilityLabel(trimmedLabel.map { "Folder: \($0)" } ?? "No folder")
        .accessibilityHint(trimmedLabel != nil ? "Edit folder" : "Add a folder")
        .help(trimmedLabel ?? "No folder")
    }
}
#endif
