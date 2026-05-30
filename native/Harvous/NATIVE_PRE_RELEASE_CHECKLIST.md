# Native Harvous pre-release checklist

Use this together with automated Xcode tests (shared schemes `Harvous_macOS` / `Harvous_iOS`, test plans `Harvous_macOS.xctestplan` / `Harvous_iOS.xctestplan`). CI runs macOS unit tests and the full iOS plan (unit + UI smoke) when files under `native/Harvous/` change.

## Automated

- From `native/Harvous`: `xcodebuild test -project Harvous.xcodeproj -scheme Harvous_macOS -destination 'platform=macOS,arch=arm64' -only-testing:HarvousTests_macOS` (macOS unit tests; avoids macOS UI runner issues on headless hosts).
- From `native/Harvous`: `xcodebuild test -project Harvous.xcodeproj -scheme Harvous_iOS -destination 'platform=iOS Simulator,name=iPhone 16' -testPlan Harvous_iOS` (adjust simulator name if Xcode does not ship that model).
- After editing `project.yml`, run `xcodegen generate` and commit the updated `Harvous.xcodeproj` / shared schemes.

## TestFlight and manual gates

- Upload a build to **internal** TestFlight first; exercise critical flows on physical devices and OS versions you support before external testers or App Store review.
- **Fresh install** and **upgrade from the previous public build** (data migration, SwiftData store path, vault/import paths).
- **Offline / airplane mode**: launch, read notes, queue actions if applicable.
- **Accessibility**: VoiceOver on one representative flow each platform; Dynamic Type / Larger Text at least one notch on iOS.
- **macOS UI smoke**: run `HarvousUITests_macOS` from Xcode when convenient (`Cmd+U` on scheme `Harvous_macOS`); CI omits these because the XCTest runner often exits early without an interactive session.

## XcodeGen / test plans

- If you delete and regenerate native targets, Xcode may assign new target IDs. If Xcode reports a broken test plan reference, open the `.xctestplan` in Xcode or refresh identifiers from the regenerated `project.pbxproj` (`PBXNativeTarget` entries).
