#if os(iOS)
import SwiftUI

/// Home tab: system navigation + searchable feed; space and account in the nav bar.
struct HomeHubView: View {
    var onNewNote: () -> Void

    @EnvironmentObject private var appRouter: HarvousAppRouter
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage(HarvousSettingsStorageKeys.avatarColor) private var avatarColorRaw = HarvousAvatarColorToken.blue.rawValue

    var body: some View {
        NoteListColumn(
            filter: .all,
            selectedNote: .constant(nil),
            externalSearchText: $appRouter.iosInlineSearchText,
            columnStyle: .iOSTabNoteList,
            onNewNote: onNewNote
        )
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appRouter.selectIOSListSurface(.more)
                } label: {
                    homeToolbarProfileButton
                }
                .buttonStyle(.plain)
                .accessibilityLabel("More")
            }
        }
    }

    private var homeToolbarProfileButton: some View {
        let token = HarvousAvatarColorToken(rawValue: avatarColorRaw) ?? .blue
        let glyph: Color = {
            switch token {
            case .paper:
                return colorScheme == .dark ? Color.white.opacity(0.55) : Color.primary.opacity(0.55)
            default:
                return Color.threadGlyph(avatarColorRaw) ?? Color.harvousAccent
            }
        }()

        return Image(systemName: "person.fill")
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(glyph)
            .frame(width: 32, height: 32)
            .contentShape(Rectangle())
    }
}

#endif
