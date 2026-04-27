import SwiftUI

// MARK: - Rail panel identifiers (cross-platform enum, no platform-specific APIs)

enum RailPanel: Equatable {
    case home
    case search
    case library

    var icon: String {
        switch self {
        case .home:    return "house"
        case .search:  return "magnifyingglass"
        case .library: return "books.vertical"
        }
    }

    var activeIcon: String {
        switch self {
        case .home:    return "house.fill"
        case .search:  return "magnifyingglass"
        case .library: return "books.vertical.fill"
        }
    }

    var label: String {
        switch self {
        case .home:    return "Home"
        case .search:  return "Search"
        case .library: return "Library"
        }
    }
}

#if os(macOS)

// MARK: - Icon-only left rail

struct RailView: View {
    @Binding var activePanel: RailPanel?
    var onNewNote: () -> Void

    var body: some View {
        VStack(spacing: 2) {
            Spacer().frame(height: 12)

            railButton(.home)
            railButton(.search)

            Spacer()

            writeButton
            railButton(.library)

            Spacer().frame(height: 12)
        }
        .frame(width: 52)
    }

    // MARK: - Toggle panel button

    private func railButton(_ panel: RailPanel) -> some View {
        Button {
            withAnimation(HarvousAnimation.spring) {
                activePanel = activePanel == panel ? nil : panel
            }
        } label: {
            Image(systemName: activePanel == panel ? panel.activeIcon : panel.icon)
                .railIconStyle(active: activePanel == panel)
        }
        .buttonStyle(.plain)
        .help(panel.label)
    }

    // MARK: - Write action (not a panel)

    private var writeButton: some View {
        Button(action: onNewNote) {
            Image(systemName: "square.and.pencil")
                .railIconStyle(active: false)
        }
        .buttonStyle(.plain)
        .help("New Note (⌘N)")
    }
}

// MARK: - Icon style helper

private extension Image {
    func railIconStyle(active: Bool) -> some View {
        self
            .font(.system(size: 17, weight: .regular))
            .frame(width: 44, height: 44)
            .foregroundStyle(active ? Color.accentColor : Color.secondary)
            .contentShape(Rectangle())
    }
}

#Preview {
    RailView(activePanel: .constant(.home), onNewNote: {})
        .frame(height: 500)
}

#endif
