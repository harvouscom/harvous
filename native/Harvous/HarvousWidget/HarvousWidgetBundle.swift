import SwiftUI
import WidgetKit

@main
struct HarvousWidgetBundle: WidgetBundle {
    var body: some Widget {
        RecallCardWidget()
        RecallLiveActivityWidget()
    }
}
