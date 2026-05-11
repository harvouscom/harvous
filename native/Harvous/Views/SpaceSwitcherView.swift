import SwiftData
import SwiftUI

/// Preview / DMG builds: set to `false` to hide sharing, join, and manage-space entries in the space menu.
private let showSpaceSharingAndManageMenu = false

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
                            Label {
                                Text(space.name)
                            } icon: {
                                HarvousFAGlyph(assetName: space.visibility.harvousCatalogAssetName, edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                            }
                            Spacer(minLength: 8)
                            if space.id == selectedId {
                                HarvousFAGlyph(assetName: "Harvous.Check", edgePt: HarvousFAIconMetrics.menuRowCheckGlyphPt)
                            }
                        }
                    }
                }
            }
            if showSpaceSharingAndManageMenu {
                Section {
                    Button {
                        spaceStore.createSpaceInitialVisibility = .privateShared
                        spaceStore.showCreateSpaceSheet = true
                    } label: {
                        Label {
                            Text("New private shared…")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Lock", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                        }
                    }
                    Button {
                        spaceStore.createSpaceInitialVisibility = .publicShared
                        spaceStore.showCreateSpaceSheet = true
                    } label: {
                        Label {
                            Text("New public shared…")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Link", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                        }
                    }
                    Button {
                        spaceStore.showJoinSpaceSheet = true
                    } label: {
                        Label {
                            Text("Join with token…")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Key", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                        }
                    }
                }
                if let current = visibleSpaces.first(where: { $0.id == selectedId }) {
                    Section {
                        Button {
                            spaceToManage = current
                        } label: {
                            Label {
                                Text("Manage current space…")
                            } icon: {
                                HarvousFAGlyph(assetName: "Harvous.Gear", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                            }
                        }
                    }
                }
            }
        } label: {
            #if os(macOS)
            HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 15)
                .offset(y: -1)
            #else
            Label {
                Text(currentSpaceName)
                    .lineLimit(1)
                    .foregroundStyle(.primary)
            } icon: {
                HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 16)
                    .foregroundStyle(.primary)
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
        // Home / folders toolbars sit under `NavigationStack.tint(.harvousAccent)`; keep space control neutral like `NoteFolderChip`.
        .tint(.primary)
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

    private var currentCatalogAssetName: String {
        visibleSpaces.first { $0.id == selectedId }?.visibility.harvousCatalogAssetName ?? "Harvous.Home"
    }
}
