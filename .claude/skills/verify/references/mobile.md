# Mobile app

Pick the end-to-end tool by how the app is built.

| App | Fast checks | End-to-end |
|---|---|---|
| Native iOS (Swift) | SwiftLint if the project uses it, plus XCTest or Swift Testing unit tests | XCUITest |
| React Native | ESLint, `tsc --noEmit` and Jest | Detox |
| Flutter, or one test set for iOS and Android | the framework's analyzer and unit tests (`flutter analyze`, `flutter test`) | Maestro (YAML flows) |

## Native iOS
- **Fast checks:** unit tests for models, view models and logic in a unit-test target. They run without launching the UI.
- **End-to-end:** XCUITest in a UI-test target, one test class per user flow, named after the flow (`CheckoutFlowTests`).
- **Commands:**
  - find a simulator: `xcrun simctl list devices available`
  - unit tests: `xcodebuild test -quiet -scheme <scheme> -destination 'platform=iOS Simulator,name=<device>' -only-testing:<UnitTestTarget>`
  - one flow: the same with `-only-testing:<UITestTarget>/<FlowTests>`
  Building for the simulator is slow. If the unit tests take over a minute, make the one check command a faster check that needs no simulator (for example the Swift package's `swift test`), and run the `xcodebuild` unit tests at a feature's end, with its flows; name that command in the Checks entry, next to the end-to-end spec.
- **Stable tests:** find elements by accessibility identifier (set `accessibilityIdentifier` in the app), wait with `waitForExistence(timeout:)`, never `sleep`, and reset app state with launch arguments in `setUp`.
- **Screenshot tests (opt-in):** snapshot testing needs a package such as swift-snapshot-testing. Record baselines on one simulator model and OS version, and name both in the test.

## Detox and Maestro
- One test file per user flow, named after it, as for every stack.
- Find elements by test ID (`testID` in React Native, semantics labels in Flutter), never by on-screen position.
- Use the tool's own waiting (`waitFor(...).toBeVisible()` in Detox; Maestro waits by itself); never fixed sleeps.

## CI
CI runs only the fast checks; end-to-end flows run locally at a feature's end. A native iOS app's fast checks that build with `xcodebuild` need macOS runners; a Swift package's `swift test` and the fast checks of a React Native or Flutter app also run on Linux.
