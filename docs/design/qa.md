# Design QA

- source visual truth path: `/Users/barzy/code/OneShotOneNight/apps/ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`
- implementation screenshot path: unavailable; in-app browser was not available
- viewport: desktop and mobile header targets
- state: home header, admin header, admin login brand, browser/PWA icon
- full-view comparison evidence: blocked because the rendered local app could not be captured
- focused region comparison evidence: source AppIcon was opened at its original 1024×1024 resolution; rendered header region could not be captured

**Findings**

- [P2] Rendered placement could not be visually verified.
  - Location: home header, admin header, and admin login brand.
  - Evidence: the source asset is available and used directly, but no implementation screenshot could be captured.
  - Impact: crop, apparent sharpness, and spacing cannot receive a visual pass.
  - Fix: capture desktop and mobile headers when the in-app browser is available and compare them with the source asset.

**Implementation Checklist**

- Capture the home header at desktop and mobile widths.
- Capture the admin header and login brand.
- Verify icon crop, corner radius, sharpness, and adjacent text alignment.

**Follow-up Polish**

- None identified without rendered evidence.

final result: blocked

## Responsive Guest Landing Regression

- Reference: user-provided iPhone screenshot showing the horizontally overflowing guest landing screen.
- Implementation screenshot: `/tmp/landing-responsive.png`, iPhone 17 simulator.
- Viewport: compact portrait iPhone.
- Result: the background fills the display; all content is centered within 32-point side margins; the title wraps to two lines; metadata, form, primary action, and gallery action remain within the viewport.
- P0/P1/P2 findings: none remaining for this regression.

final result: passed

## Camera Controls Correction

- Build verification: passed after the counter, centering, gallery presentation, and full-screen background changes.
- Structural verification: shutter and zoom are independently centered; the counter has a single-line 116-point frame; the camera gallery is presented from the camera hierarchy.
- Visual comparison: blocked by the existing CoreSimulator launch-screen issue.

final result: blocked
# Camera Design QA

- Reference: user-provided iPhone camera screenshot, targeting a 430-point-wide viewport.
- Implementation: `PartyCameraView` in `apps/ios/Shared/CameraCaptureView.swift`.
- Build verification: passed (`xcodebuild`, Debug, iPhone Simulator SDK, code signing disabled).
- Layout review: preview uses 15-point side margins, a 3:4 camera frame, 42-point corners, a safe-area-relative header, and two distinct bottom control rows matching the reference hierarchy.
- Interaction review: close, invitation QR, flash, 0.5×/1× zoom, camera flip, shutter, shot counter, and gallery remain wired.
- Visual capture: blocked because CoreSimulator remains on the iOS launch screen on two simulator devices and does not start the installed app process.

final result: blocked
