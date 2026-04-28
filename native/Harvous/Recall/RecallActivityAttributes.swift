#if os(iOS)
import ActivityKit

struct RecallSessionAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var currentIndex: Int
        var total: Int
        var subtitle: String
    }

    var sessionTitle: String
}
#endif
