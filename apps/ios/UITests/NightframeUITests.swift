import XCTest

@MainActor
final class NightframeUITests: XCTestCase {
    func testScanLandingScreenLaunches() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Scan event QR"].waitForExistence(timeout: 5))
    }
}
