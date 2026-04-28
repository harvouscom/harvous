import AppIntents
import Foundation
import WidgetKit

@available(iOS 17.0, *)
struct MarkRecallReviewedIntent: AppIntent {
    static let title: LocalizedStringResource = "Mark reviewed"

    func perform() async throws -> some IntentResult {
        var snap = RecallSnapshotIO.load() ?? RecallSnapshotFile(card: nil, streakDays: 0, queueTotal: 7, queueIndex: 1)
        snap.queueIndex = min(snap.queueIndex + 1, max(snap.queueTotal, 1))
        RecallSnapshotIO.save(snap)
        WidgetCenter.shared.reloadTimelines(ofKind: "RecallCardWidget")
        return .result()
    }
}

@available(iOS 17.0, *)
struct SkipRecallIntent: AppIntent {
    static let title: LocalizedStringResource = "Skip recall"

    func perform() async throws -> some IntentResult {
        WidgetCenter.shared.reloadTimelines(ofKind: "RecallCardWidget")
        return .result()
    }
}
