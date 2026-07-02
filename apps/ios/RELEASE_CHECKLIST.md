# iOS Release Checklist

## Configuration

- Confirm `API_BASE_URL` and `PUBLIC_WEB_URL` in `project.yml` point to production.
- Serve `.well-known/apple-app-site-association` as `application/json` without redirects from every associated domain.
- Confirm App Store bundle ID and Apple team match the AASA `appIDs` entry.
- Increment `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION`.

## Automated verification

```bash
cd apps/ios
xcodegen generate
xcodebuild -project OneShotOneNight.xcodeproj -scheme OneShotOneNight \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
xcodebuild -project OneShotOneNight.xcodeproj -scheme OneShotOneNight \
  -configuration Release -destination 'generic/platform=iOS' archive
```

## Physical-device matrix

- Scan, paste, cold-start, and warm-start an invitation link.
- Deny and restore camera/photo permissions.
- Capture with front/rear camera, flash, and 1×/2× zoom.
- Upload on Wi-Fi, cellular, poor connectivity, and after force-quitting.
- Verify pending-upload retry does not consume more than the event allowance.
- Verify upcoming, open, locked, grace-period, and revealed events.
- Verify gallery pagination, refresh, fullscreen view, and sharing.
- Run VoiceOver and largest Dynamic Type size through the guest flow.

## App Store Connect

- Add support and privacy-policy URLs.
- Complete privacy answers: guest name, user-provided photos, and optional messages.
- Upload iPhone screenshots and review camera/photo permission copy.
- Distribute to internal TestFlight testers before external testing.
- Review crashes, upload failures, and API error codes before submission.
