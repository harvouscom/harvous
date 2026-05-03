import SwiftData
import SwiftUI

struct SpaceSwitcherView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore
    @Query(sort: \Space.name) private var allSpaces: [Space]

    @State private var spaceToManage: Space?

    private var visibleSpaces: [Space] {
        allSpaces.filter { !$0.isArchived }
    }

    private var selectedId: UUID {
        spaceStore.activeSpaceUUID()
    }

    var body: some View {
        Menu {
            Section {
                ForEach(visibleSpaces, id: \.id) { space in
                    Button {
                        spaceStore.setActiveSpace(id: space.id, modelContext: modelContext)
                    } label: {
                        HStack {
                            Label(space.name, systemImage: space.visibility.systemImage)
                            Spacer(minLength: 8)
                            if space.id == selectedId {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }
            Section {
                Button {
                    spaceStore.createSpaceInitialVisibility = .privateShared
                    spaceStore.showCreateSpaceSheet = true
                } label: {
                    Label("New private shared…", systemImage: "lock.fill")
                }
                Button {
                    spaceStore.createSpaceInitialVisibility = .publicShared
                    spaceStore.showCreateSpaceSheet = true
                } label: {
                    Label("New public shared…", systemImage: "link")
                }
                Button {
                    spaceStore.showJoinSpaceSheet = true
                } label: {
                    Label("Join with token…", systemImage: "person.badge.key")
                }
            }
            if let current = visibleSpaces.first(where: { $0.id == selectedId }) {
                Section {
                    Button {
                        spaceToManage = current
                    } label: {
                        Label("Manage current space…", systemImage: "gearshape")
                    }
                }
            }
        } label: {
            #if os(macOS)
            Image(systemName: currentSpaceSymbol)
                .font(.system(size: 15, weight: .regular))
                .symbolRenderingMode(.hierarchical)
                .imageScale(.medium)
                .offset(y: -1)
            #else
            Label {
                Text(currentSpaceName)
                    .lineLimit(1)
            } icon: {
                Image(systemName: currentSpaceSymbol)
                    .symbolRenderingMode(.hierarchical)
            }
            .labelStyle(.titleAndIcon)
            #endif
        }
        #if os(macOS)
        .menuStyle(.automatic)
        .buttonStyle(.bordered)
        .menuIndicator(.hidden)
        #else
        .menuStyle(.borderlessButton)
        #endif
        .accessibilityLabel("Space")
        .accessibilityValue(currentSpaceName)
        .help("Switch the active study space.")
        .onAppear {
            spaceStore.bootstrapIfNeeded(modelContext: modelContext)
            spaceStore.repairSelection(modelContext: modelContext)
        }
        .onChange(of: allSpaces.count) { _, _ in
            spaceStore.repairSelection(modelContext: modelContext)
        }
        .sheet(isPresented: $spaceStore.showCreateSpaceSheet) {
            CreateSpaceSheet()
                .environmentObject(spaceStore)
        }
        .sheet(isPresented: $spaceStore.showJoinSpaceSheet) {
            JoinSpaceSheet()
                .environmentObject(spaceStore)
        }
        .sheet(item: $spaceToManage) { space in
            ManageSpaceSheet(space: space)
                .environmentObject(spaceStore)
        }
    }

    private var currentSpaceName: String {
        visibleSpaces.first { $0.id == selectedId }?.name ?? "My Home"
    }

    private var currentSpaceSymbol: String {
        visibleSpaces.first { $0.id == selectedId }?.visibility.systemImage ?? "rectangle.on.rectangle"
    }
}
