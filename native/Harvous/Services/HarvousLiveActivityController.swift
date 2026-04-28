#if os(iOS)
import ActivityKit
import Foundation

@MainActor
enum HarvousLiveActivityController {
    static func startIfPossible() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let snap = RecallSnapshotIO.load()
        let total = max(snap?.queueTotal ?? 7, 1)
        let idx = min(max(snap?.queueIndex ?? 1, 1), total)
        let subtitle = snap?.card?.primaryRef ?? snap?.card?.title ?? "Review your notes"

        let attributes = RecallSessionAttributes(sessionTitle: "Harvous recall")
        let state = RecallSessionAttributes.ContentState(currentIndex: idx, total: total, subtitle: subtitle)
        let content = ActivityContent(state: state, staleDate: nil)

        Task { @MainActor in
            for activity in Activity<RecallSessionAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            do {
                _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
            } catch {}
        }
    }

    static func endAll() {
        Task { @MainActor in
            for activity in Activity<RecallSessionAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
#endif
