import AppIntents

@available(iOS 16.0, macOS 13.0, *)
struct HarvousAppShortcuts: AppShortcutsProvider {
    nonisolated(unsafe) static let appShortcuts: [AppShortcut] = {
        let add = AppShortcut(
            intent: AddHarvousNoteIntent(),
            phrases: ["Add a note in Harvous", "Write in Harvous"],
            shortTitle: "Add note",
            systemImageName: "square.and.pencil"
        )
        let recall = AppShortcut(
            intent: StartRecallSessionIntent(),
            phrases: ["Start recall in Harvous", "Review in Harvous"],
            shortTitle: "Start recall",
            systemImageName: "rectangle.stack"
        )
        let card = AppShortcut(
            intent: GetTodaysRecallCardIntent(),
            phrases: ["Recall card from Harvous"],
            shortTitle: "Today’s card",
            systemImageName: "text.quote"
        )
        return [add, recall, card]
    }()
}
