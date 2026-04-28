import Foundation
import SwiftData
import UserNotifications

#if os(iOS)
import BackgroundTasks
import UIKit
#endif

enum HarvousRecallNotifications {
    static let recallCategoryId = "harvous.recall"
    static let markReviewedActionId = "harvous.recall.mark_reviewed"
    static let skipActionId = "harvous.recall.skip"

    private static let bgTaskId = "com.harvous.app.recall-refresh"

    static func registerCategories() {
        let mark = UNNotificationAction(identifier: markReviewedActionId, title: "Keep it", options: [])
        let skip = UNNotificationAction(identifier: skipActionId, title: "Not now", options: [])
        let cat = UNNotificationCategory(identifier: recallCategoryId, actions: [mark, skip], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([cat])
    }

    @MainActor
    static func requestAuthorizationIfNeeded() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        }
    }

    /// Schedules one recall notification with specific copy (no generic “Time to review!”).
    @MainActor
    static func scheduleNextRecallIfNeeded(modelContext: ModelContext) {
        let desc = FetchDescriptor<Note>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        guard let notes = try? modelContext.fetch(desc), let card = HarvousRecallSnapshotWriter.pickRecallCard(from: notes) else {
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["harvous.recall.next"])
            return
        }

        let body: String = {
            if let r = card.primaryRef {
                return "You haven’t revisited \(r) in your notes — open Harvous for a quick recall."
            }
            return "Revisit: \(card.title.prefix(80))\(card.title.count > 80 ? "…" : "")"
        }()

        var date = Calendar.current.date(byAdding: .hour, value: 20, to: Date()) ?? Date().addingTimeInterval(20 * 3600)
        if date < Date().addingTimeInterval(3600) {
            date = Date().addingTimeInterval(3600)
        }

        let content = UNMutableNotificationContent()
        content.title = "Harvous recall"
        content.body = body
        content.categoryIdentifier = recallCategoryId
        if #available(iOS 15.0, macOS 12.0, *) {
            content.interruptionLevel = .timeSensitive
        }

        let trigger = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date), repeats: false)
        let req = UNNotificationRequest(identifier: "harvous.recall.next", content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: { _ in })
    }

    #if os(iOS)
    static func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: bgTaskId, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handleRefreshTask(task: refresh)
        }
    }

    static func scheduleBackgroundRefresh() {
        let req = BGAppRefreshTaskRequest(identifier: bgTaskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    private static func handleRefreshTask(task: BGAppRefreshTask) {
        scheduleBackgroundRefresh()
        task.expirationHandler = { task.setTaskCompleted(success: false) }
        task.setTaskCompleted(success: true)
    }
    #endif
}
