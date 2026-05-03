import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

struct RecallLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RecallSessionAttributes.self) { context in
            VStack(alignment: .leading, spacing: 6) {
                Text(context.attributes.sessionTitle)
                    .font(.headline)
                Text(context.state.subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                ProgressView(value: Double(context.state.currentIndex), total: Double(max(context.state.total, 1)))
                    .tint(.accentColor)
                Text("\(context.state.currentIndex) of \(context.state.total)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .activityBackgroundTint(Color(uiColor: .secondarySystemBackground))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("Recall")
                        .font(.caption.weight(.semibold))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.currentIndex)/\(context.state.total)")
                        .font(.caption2)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.subtitle)
                        .font(.caption)
                        .lineLimit(2)
                }
            } compactLeading: {
                Image(systemName: "rectangle.stack.fill")
            } compactTrailing: {
                Text("\(context.state.currentIndex)")
            } minimal: {
                Image(systemName: "rectangle.stack.fill")
            }
        }
    }
}
