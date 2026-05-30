#if os(iOS)
import SwiftData
import SwiftUI

/// Home tab: system navigation + searchable feed; space and account in the nav bar.
struct HomeHubView: View {
    @Binding var iosSelectedNoteId: UUID?

    @EnvironmentObject private var appRouter: HarvousAppRouter
    @EnvironmentObject private var spaceStore: SpaceStore
    @Environment(\.modelContext) private var modelContext
    var body: some View {
        NoteListColumn(
            filter: .all,
            selectedNote: .constant(nil),
            externalSearchText: $appRouter.iosInlineSearchText,
            columnStyle: .iOSTabNoteList,
            iosSelectedNoteId: $iosSelectedNoteId,
            onNewNote: {}
        )
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
            }
            if #available(iOS 26, *) {
                ToolbarSpacer(.fixed, placement: .topBarLeading)
            }
            ToolbarItem(placement: .topBarLeading) {
                IOSListSurfaceChip()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appRouter.selectIOSListSurface(.more)
                } label: {
                    homeToolbarProfileButton
                }
                .buttonStyle(.plain)
                .tint(.primary)
                .accessibilityLabel("Account, profile, and settings")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(NotificationCenter.default.publisher(for: HarvousAppRouter.requestComposeNewNotification)) { notification in
            let initial = notification.userInfo?[HarvousAppRouter.composeInitialBodyUserInfoKey] as? String
            composeNewNoteIntoStack(initialBody: initial)
        }
        .onReceive(NotificationCenter.default.publisher(for: .requestDailyNote)) { _ in
            openDailyNoteIntoStack()
        }
        .onReceive(NotificationCenter.default.publisher(for: .requestRandomRevisit)) { _ in
            openRandomNoteIntoStack()
        }
        .onReceive(NotificationCenter.default.publisher(for: .harvousRequestOpenNoteId)) { n in
            guard let raw = n.userInfo?[HarvousOpenNoteIdPayload.idKey] as? String,
                  let id = UUID(uuidString: raw) else { return }
            pushNoteOntoIOSStack(id)
        }
        .onReceive(NotificationCenter.default.publisher(for: .harvousStandaloneNoteNavigateIOS)) { notification in
            guard let raw = notification.userInfo?[HarvousStandaloneNoteNavigateUserInfo.noteIdKey] as? String,
                  let id = UUID(uuidString: raw) else { return }
            // Navigate after nested notification delivery finishes so NavigationStack/path does not mutate
            // during the editor’s SwiftData transaction or an in-flight navigation transition (tap/collapse).
            pushNoteOntoIOSStack(id)
        }
    }

    private func pushNoteOntoIOSStack(_ id: UUID) {
        Task { @MainActor in
            iosSelectedNoteId = id
        }
    }

    private func composeNewNoteIntoStack(initialBody: String? = nil) {
        let note = Note(spaceId: spaceStore.activeSpaceUUID())
        if let initialBody {
            let trimmed = initialBody.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                note.body = trimmed
                note.detectedRefs = ScriptureDetector.uniqueDisplayRefs(in: trimmed)
            }
        }
        modelContext.insert(note)
        NoteSimpleIDAssigner.assignIfMissing(note, in: modelContext)
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
        pushNoteOntoIOSStack(note.id)
    }

    private func openDailyNoteIntoStack() {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone.current
        df.dateFormat = "yyyy-MM-dd"
        let key = df.string(from: Date())
        let sid = spaceStore.activeSpaceUUID()
        let all = (try? modelContext.fetch(FetchDescriptor<Note>())) ?? []
        if let hit = all.first(where: { $0.resolvedSpaceId() == sid && $0.title == key }) {
            pushNoteOntoIOSStack(hit.id)
            return
        }
        let note = Note(title: key, body: "", spaceId: sid)
        modelContext.insert(note)
        NoteSimpleIDAssigner.assignIfMissing(note, in: modelContext)
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
        pushNoteOntoIOSStack(note.id)
    }

    private func openRandomNoteIntoStack() {
        let sid = spaceStore.activeSpaceUUID()
        let all = (try? modelContext.fetch(FetchDescriptor<Note>())) ?? []
        let pool = all.filter { $0.resolvedSpaceId() == sid }
        guard let pick = pool.randomElement() else { return }
        pushNoteOntoIOSStack(pick.id)
    }

    private var homeToolbarProfileButton: some View {
            HarvousFAGlyph(assetName: "Harvous.UserFilled", edgePt: 17)
                .foregroundStyle(.primary)
            .frame(width: 32, height: 32)
            .contentShape(Rectangle())
    }
}

#endif
