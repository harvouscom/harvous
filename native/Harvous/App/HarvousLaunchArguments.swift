import Foundation

enum HarvousLaunchArguments {
    /// Passed by UI tests so the app can skip side effects (e.g. network warm-up).
    static let uiTestingFlag = "-harvousUITesting"

    static var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains(Self.uiTestingFlag)
    }
}
