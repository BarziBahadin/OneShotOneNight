# App Clip testing

The iOS project is generated with XcodeGen. The App Clip target is named `AppClip`, uses bundle ID `com.oneshotonenight.app.Clip`, and is embedded in `OneShotOneNight`.

## Generate and run

1. Install XcodeGen if needed: `brew install xcodegen`.
2. From `apps/ios`, run `xcodegen generate`.
3. Open `OneShotOneNight.xcodeproj` and select the `AppClip` scheme.
4. In Product → Scheme → Edit Scheme → Run → Arguments → Environment Variables, set:
   - `APP_CLIP_TEST_MODE` = `true`
   - `_XCAppClipURL` = `https://example.com/e/test-event`
5. Run on an iOS 17+ simulator or device. The simulator has no camera, so use **Choose from library**.

Test mode supplies `Test Party`, `Demo Host`, and 25 remaining photos. Uploads are simulated and URL details are printed to the Xcode console. A yellow `TEST` panel appears only in DEBUG builds. Fake slugs work with `/e/{slug}` and `/clip/{slug}`; `eventId`, `event_id`, or `id` query parameters are captured.

## Developer Local Experience

On an iPhone with Developer Mode enabled, open Settings → Developer → Local Experiences → Register Local Experience and enter:

- URL Prefix: `https://example.com/e/`
- Bundle ID: `com.oneshotonenight.app.Clip`
- Title: `Test Party`
- Subtitle: `Capture and share party memories`
- Action: `Open`

Install the development build containing the App Clip before invoking the local experience. Apple changes this settings UI between iOS releases; if Local Experiences is absent, use the Xcode `_XCAppClipURL` launch method.

## QR test

A ready-to-scan QR code is included at `docs/test-event-app-clip-qr.png`. Its plain content is `https://example.com/e/test-event`. Display it on another screen, then scan it with the iPhone Camera app. Before a public advanced App Clip experience exists, QR invocation depends on the registered Local Experience. Opening the URL directly remains useful for universal-link routing checks.

## Associated Domains and production domain

`APP_CLIP_ASSOCIATED_DOMAIN` is the single build setting used by the App Clip. It currently defaults to the placeholder `example.com`. Before release:

1. Replace it with the production HTTPS domain in `apps/ios/project.yml`.
2. Add `appclips:your-domain` and `applinks:your-domain` to the signed entitlements for the correct provisioning profiles. Add the corresponding `appclips:` entry to the main app when required by the selected experience configuration.
3. Host `docs/apple-app-site-association.example.json` as `https://your-domain/.well-known/apple-app-site-association`, without a redirect or filename extension, using `application/json`.
4. Replace all `APPLE_TEAM_ID` and bundle placeholders in the hosted file. Never commit signing credentials.

## TestFlight and App Store Connect

Create the App Clip experience in App Store Connect for `/e/` and optionally `/clip/`, supply the header image and invocation metadata, associate it with the main app version, and upload an archive containing both targets. Verify the production AASA response and associated-domain entitlements on a physical device. TestFlight supports App Clip invocation URLs configured for the build; the main app itself does not need to be publicly released first.

## Before public release

- Set `APP_CLIP_TEST_MODE` to `false` for Release and implement the production event lookup/upload contract in `AppClipService` (the current non-test path intentionally returns a friendly backend-unavailable error).
- Replace `example.com` and the full-app handoff URL with production values.
- Configure App IDs, capabilities, provisioning profiles, App Store Connect experience metadata, and AASA Team ID values.
- Verify camera/photo permissions, offline and failed-upload behavior, invocation URLs, App Clip size, and archive embedding on physical devices.
- Confirm the backend only decrements photo allowance after a successful upload; mock mode does not change server counters.
