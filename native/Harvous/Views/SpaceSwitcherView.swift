import SwiftUI

struct SpaceOption: Identifiable, Hashable {
    let id: String
    let name: String
    let systemImage: String

    /// Outline “three cards” (two stacked + one) — the spaces / areas metaphor from the system pickers.
    static let myHome = SpaceOption(id: "my-home", name: "My Home", systemImage: "rectangle.on.rectangle")

    /// Catalog for the title-bar space switcher; add entries when spaces are backed by data or sync.
    static let all: [SpaceOption] = [.myHome]
}

struct SpaceSwitcherView: View {
    @AppStorage("selectedSpaceId") private var selectedSpaceId: String = SpaceOption.myHome.id

    private var selected: SpaceOption {
        SpaceOption.all.first { $0.id == selectedSpaceId } ?? .myHome
    }

    var body: some View {
        Menu {
            Section {
                ForEach(SpaceOption.all) { option in
                    Button {
                        selectedSpaceId = option.id
                    } label: {
                        HStack {
                            Label(option.name, systemImage: option.systemImage)
                            Spacer(minLength: 8)
                            if option.id == selectedSpaceId {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }
        } label: {
            #if os(macOS)
            // Match `MacRootView`’s “New Note” control: same bordered square toolbar look; space list icon.
            Image(systemName: "rectangle.on.rectangle")
                .font(.system(size: 15, weight: .regular))
                .symbolRenderingMode(.hierarchical)
                .imageScale(.medium)
                .offset(y: -1)
            #else
            HStack(spacing: 6) {
                Image(systemName: selected.systemImage)
                    .symbolRenderingMode(.hierarchical)
                Text(selected.name)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.up.chevron.down")
                    .imageScale(.small)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minWidth: 168)
            .background {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(.quinary)
            }
            #endif
        }
        #if os(macOS)
        .menuStyle(.automatic)
        .buttonStyle(.bordered)
        .menuIndicator(.hidden)
        #else
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        #endif
        .accessibilityLabel("Space")
        .accessibilityValue(selected.name)
        .help("Switch the active study space.")
        .onAppear {
            if !SpaceOption.all.map(\.id).contains(selectedSpaceId) {
                selectedSpaceId = SpaceOption.myHome.id
            }
        }
    }
}

#Preview {
    SpaceSwitcherView()
        .padding()
}
