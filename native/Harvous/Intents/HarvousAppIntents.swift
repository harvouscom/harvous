import AppIntents
import Foundation

@available(iOS 16.0, macOS 13.0, *)
struct AddHarvousNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Harvous Note"
    static let description = IntentDescription("Opens the compose sheet in Harvous.")
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        HarvousPendingRoute.set("compose")
        return .result()
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct StartRecallSessionIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Harvous Recall"
    static let description = IntentDescription("Opens Harvous and starts a recall session.")
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        HarvousPendingRoute.set("recall")
        #if os(iOS)
        HarvousLiveActivityController.startIfPossible()
        #endif
        return .result()
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct GetTodaysRecallCardIntent: AppIntent {
    static let title: LocalizedStringResource = "Today’s Harvous Recall Card"
    static let description = IntentDescription("Reads the current recall card from your on-device notes.")

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        guard let snap = RecallSnapshotIO.load(), let card = snap.card else {
            return .result(value: "No notes to review yet. Add a note in Harvous.")
        }
        let snippet = card.primaryRef.map { "\($0) — \(card.excerpt)" } ?? card.excerpt
        let trimmed = snippet.count > 400 ? String(snippet.prefix(400)) + "…" : snippet
        return .result(value: trimmed)
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct ShowRelatedNotesIntent: AppIntent {
    static let title: LocalizedStringResource = "Find Notes in Harvous"
    static let description = IntentDescription("Opens Harvous search for a topic.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Topic", default: "")
    var topic: String

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        HarvousPendingRoute.set("search")
        let t = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        return .result(value: t.isEmpty ? "Opening Harvous search." : "Opening Harvous to search for \(t).")
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct GetStudyStreakIntent: AppIntent {
    static let title: LocalizedStringResource = "Harvous Study Streak"
    static let description = IntentDescription("Returns your on-device study streak from note activity.")

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Int> {
        let streak = RecallSnapshotIO.load()?.streakDays ?? 0
        return .result(value: streak)
    }
}
