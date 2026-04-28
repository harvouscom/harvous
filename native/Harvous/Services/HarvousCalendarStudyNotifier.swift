@preconcurrency import EventKit
import Foundation
import SwiftData
import UserNotifications

/// Surfaces a contextual nudge before calendar events that look like Bible study (keyword heuristic).
enum HarvousCalendarStudyNotifier {
    private static let keywords = ["bible", "study", "sermon", "scripture", "small group", "cell group", "sunday school", "worship", "prayer"]

    /// `ModelContext` is not `Sendable`; the box is only read on the main actor after permission callbacks.
    private final class ModelContextBox: @unchecked Sendable {
        let context: ModelContext
        init(_ context: ModelContext) {
            self.context = context
        }
    }

    static func requestAccessAndPrewarm(modelContext: ModelContext) {
        let box = ModelContextBox(modelContext)
        let store = EKEventStore()
        // Deployment targets are iOS 17+ / macOS 14+; full event access API is always available.
        store.requestFullAccessToEvents { granted, _ in
            guard granted else { return }
            Task { @MainActor in
                scheduleDigestIfNeeded(modelContext: box.context)
            }
        }
    }

    @MainActor
    private static func scheduleDigestIfNeeded(modelContext: ModelContext) {
        let store = EKEventStore()
        let start = Date()
        guard let end = Calendar.current.date(byAdding: .day, value: 7, to: start) else { return }
        let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        let events = store.events(matching: pred)
        let next = events
            .filter { ev in
                let t = ev.title.lowercased()
                return keywords.contains { t.contains($0) }
            }
            .sorted { $0.startDate < $1.startDate }
            .first
        guard let next else {
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["harvous.calendar.study"])
            return
        }

        let fire = next.startDate.addingTimeInterval(-30 * 60)
        guard fire > Date() else { return }

        let noteCount = (try? modelContext.fetch(FetchDescriptor<Note>()))?.count ?? 0
        let content = UNMutableNotificationContent()
        content.title = next.title.isEmpty ? "Study soon" : next.title
        content.body = noteCount > 0
            ? "You have \(noteCount) Harvous notes — open the app for highlights before you meet."
            : "Open Harvous to capture insights before your study."

        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let req = UNNotificationRequest(identifier: "harvous.calendar.study", content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: { _ in })
    }
}
