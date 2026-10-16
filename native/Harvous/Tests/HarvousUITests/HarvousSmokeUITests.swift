import XCTest

/// Smoke UI coverage: launch + root chrome. Uses `-harvousUITesting` so the app skips network warm-up.
/// A fresh simulator (CI) is signed out, so `SignInGate` shows the sign-in screen in place of the root;
/// either one means the app launched and rendered.
final class HarvousSmokeUITests: XCTestCase {
  func testLaunchShowsRoot() {
    let app = XCUIApplication()
    app.launchArguments = ["-harvousUITesting"]
    app.launch()
    let root = app.descendants(matching: .any)[HarvousSmokeUITests.rootIdentifier].firstMatch
    let signIn = app.descendants(matching: .any)[HarvousSmokeUITests.signInIdentifier].firstMatch
    let either = XCTNSPredicateExpectation(
      predicate: NSPredicate { _, _ in root.exists || signIn.exists },
      object: nil
    )
    XCTAssertEqual(
      XCTWaiter().wait(for: [either], timeout: 40),
      .completed,
      "Expected root (\(HarvousSmokeUITests.rootIdentifier)) or sign-in (\(HarvousSmokeUITests.signInIdentifier)) accessibility element"
    )
  }

  private static let rootIdentifier = "harvous.root"
  private static let signInIdentifier = "harvous.signIn"
}
