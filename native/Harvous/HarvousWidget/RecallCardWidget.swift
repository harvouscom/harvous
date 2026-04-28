import AppIntents
import SwiftUI
import UIKit
import WidgetKit

struct RecallEntry: TimelineEntry {
    let date: Date
    let card: RecallCardDTO?
    let streak: Int
    let queueIndex: Int
    let queueTotal: Int
}

struct RecallProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecallEntry {
        RecallEntry(
            date: Date(),
            card: RecallCardDTO(
                noteId: UUID().uuidString,
                title: "Sample",
                excerpt: "Your recall card will appear here.",
                primaryRef: "John 3:16",
                updatedAt: Date().timeIntervalSince1970
            ),
            streak: 3,
            queueIndex: 1,
            queueTotal: 7
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (RecallEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecallEntry>) -> Void) {
        let entry = loadEntry()
        let next = Calendar.current.date(byAdding: .hour, value: 4, to: Date()) ?? Date().addingTimeInterval(4 * 3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadEntry() -> RecallEntry {
        let snap = RecallSnapshotIO.load()
        return RecallEntry(
            date: Date(),
            card: snap?.card,
            streak: snap?.streakDays ?? 0,
            queueIndex: snap?.queueIndex ?? 1,
            queueTotal: max(snap?.queueTotal ?? 7, 1)
        )
    }
}

struct RecallCardWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RecallCardWidget", provider: RecallProvider()) { entry in
            RecallWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Harvous recall")
        .description("A scripture or note to revisit.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct RecallWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: RecallEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Harvous")
                    .font(.caption.weight(.semibold))
                Spacer()
                if entry.streak > 0 {
                    Text("Streak \(entry.streak)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            if let card = entry.card {
                if let r = card.primaryRef {
                    Text(r)
                        .font(.headline)
                        .widgetURL(URL(string: "harvous://recall"))
                }
                Text(card.excerpt)
                    .font(.caption)
                    .lineLimit(family == .systemSmall ? 4 : 6)
                    .foregroundStyle(.secondary)
            } else {
                Text("Add a note to start recall.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if family == .systemMedium {
                HStack {
                    if #available(iOS 17.0, *) {
                        Button(intent: MarkRecallReviewedIntent()) {
                            Label("Reviewed", systemImage: "checkmark.circle")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        Spacer()
                        Button(intent: SkipRecallIntent()) {
                            Label("Later", systemImage: "forward.end")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding()
        .containerBackground(for: .widget) {
            Color(uiColor: .secondarySystemBackground)
        }
    }
}
