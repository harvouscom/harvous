import SwiftData
import SwiftUI

/// Preview / DMG builds: set to `false` to hide sharing, join, and manage-space entries in the space menu.
private let showSpaceSharingAndManageMenu = false

struct SpaceSwitcherView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout
    @EnvironmentObject private var spaceStore: SpaceStore
    @Query(sort: \Space.name) private var allSpaces: [Space]

    @State private var spaceToManage: Space?

    private var visibleSpaces: [Space] {
        allSpaces.filter { !$0.isArchived && $0.visibility == .personal }
    }

    private var selectedId: UUID {
        spaceStore.activeSpaceUUID()
    }

    var body: some View {
        Group {
            if hasMultipleOptions {
                spacePickerMenu
            } else {
                spaceLabel
            }
        }
        .accessibilityLabel("Space")
        .accessibilityValue(currentSpaceName)
        .help("Study space.")
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

    /// Shared menu rows — identical on every platform/layout.
    @ViewBuilder
    private var spaceMenuItems: some View {
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
    }

    /// Space picker — appearance branches per platform and layout to avoid type-ternary issues.
    @ViewBuilder
    private var spacePickerMenu: some View {
#if os(macOS)
        // macOS: glyph-only trigger, bordered orb style
        Menu { spaceMenuItems } label: {
            HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 15)
                .offset(y: -1)
        }
        .menuStyle(.automatic)
        .buttonStyle(.bordered)
        .menuIndicator(.hidden)
#else
        if isIPadSplitLayout {
            // iPad split layout: match Mac — icon only, bordered orb, hidden indicator.
            // foregroundStyle on the glyph sets icon color without darkening the button background
            // (avoid .tint(.primary) which tints the pill dark on iOS).
            Menu { spaceMenuItems } label: {
                HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 15)
                    .foregroundStyle(.primary)
                    .offset(y: -1)
            }
            .menuStyle(.automatic)
            .buttonStyle(.bordered)
            .menuIndicator(.hidden)
        } else {
            // iPhone: space name + icon, borderless
            Menu { spaceMenuItems } label: {
                Label {
                    Text(currentSpaceName)
                        .lineLimit(1)
                        .foregroundStyle(.primary)
                } icon: {
                    HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 16)
                        .foregroundStyle(.primary)
                }
                .labelStyle(.titleAndIcon)
            }
            .menuStyle(.borderlessButton)
            .tint(.primary)
        }
#endif
    }

    private var currentSpaceName: String {
        visibleSpaces.first { $0.id == selectedId }?.name ?? "My Home"
    }

    private var currentCatalogAssetName: String {
        visibleSpaces.first { $0.id == selectedId }?.visibility.harvousCatalogAssetName ?? "Harvous.Home"
    }

    private var hasMultipleOptions: Bool {
        visibleSpaces.count > 1 || showSpaceSharingAndManageMenu
    }

    @ViewBuilder
    private var spaceLabel: some View {
#if os(macOS)
        Button(action: {}) {
            HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 15)
                .offset(y: -1)
        }
        .buttonStyle(.bordered)
#else
        if isIPadSplitLayout {
            // iPad split layout: icon-only bordered orb, matching Mac. No .tint so background stays light.
            Button(action: {}) {
                HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 15)
                    .foregroundStyle(.primary)
                    .offset(y: -1)
            }
            .buttonStyle(.bordered)
        } else {
            HarvousFAGlyph(assetName: currentCatalogAssetName, edgePt: 16)
                .foregroundStyle(.primary)
        }
#endif
    }
}
