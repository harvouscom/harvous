import Foundation
import SwiftData

enum HarvousRecallSnapshotWriter {
    private static func dto(from note: Note) -> RecallCardDTO {
        let title = note.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return RecallCardDTO(
            noteId: note.id.uuidString,
            title: title.isEmpty ? note.excerpt : title,
            excerpt: note.excerpt,
            primaryRef: note.primaryRef,
            updatedAt: note.updatedAt.timeIntervalSince1970
        )
    }

    /// Picks a “recall” card: prefer stale notes with scripture; else most recent with refs; else any note.
    static func pickRecallCard(from notes: [Note]) -> RecallCardDTO? {
        guard !notes.isEmpty else { return nil }
        let twoWeeksAgo = Date().addingTimeInterval(-14 * 24 * 60 * 60)
        let withRefs = notes.filter { !$0.detectedRefs.isEmpty }
        if let stale = withRefs.filter({ $0.updatedAt < twoWeeksAgo }).min(by: { $0.updatedAt < $1.updatedAt }) {
            return dto(from: stale)
        }
        if let recentRef = withRefs.max(by: { $0.updatedAt < $1.updatedAt }) {
            return dto(from: recentRef)
        }
        if let any = notes.max(by: { $0.updatedAt < $1.updatedAt }) {
            return dto(from: any)
        }
        return nil
    }

    static func studyStreakDays(notes: [Note]) -> Int {
        guard !notes.isEmpty else { return 0 }
        let cal = Calendar.current
        let daySet = Set(notes.map { cal.startOfDay(for: $0.updatedAt) })
        guard var cursor = daySet.max() else { return 0 }
        var streak = 0
        while daySet.contains(cursor) {
            streak += 1
            guard let prev = cal.date(byAdding: .day, value: -1, to: cursor) else { break }
            cursor = prev
        }
        return streak
    }

    @MainActor
    static func refresh(modelContext: ModelContext) {
        let desc = FetchDescriptor<Note>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        guard let notes = try? modelContext.fetch(desc) else { return }
        let card = pickRecallCard(from: notes)
        let streak = studyStreakDays(notes: notes)
        let total = max(min(notes.count, 7), card == nil ? 0 : 7)
        let snapshot = RecallSnapshotFile(card: card, streakDays: streak, queueTotal: total, queueIndex: 1)
        RecallSnapshotIO.save(snapshot)
    }
}
