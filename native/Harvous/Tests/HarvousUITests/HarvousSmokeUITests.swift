import XCTest

/// Smoke UI coverage: launch + root chrome. Uses `-harvousUITesting` so the app skips network warm-up.
final class HarvousSmokeUITests: XCTestCase {
  func testLaunchShowsRoot() {
    let app = XCUIApplication()
    app.launchArguments = ["-harvousUITesting"]
    app.launch()
    let root = app.descendants(matching: .any)[HarvousSmokeUITests.rootIdentifier]
    XCTAssertTrue(root.firstMatch.waitForExistence(timeout: 25), "Expected root accessibility element \(HarvousSmokeUITests.rootIdentifier)")
  }

  private static let rootIdentifier = "harvous.root"
}
