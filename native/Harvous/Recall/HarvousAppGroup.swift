import Foundation

enum HarvousAppGroup {
    static let identifier = "group.com.harvous.app"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}
