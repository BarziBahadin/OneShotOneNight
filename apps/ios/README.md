# Nightframe iOS

Native SwiftUI iPhone app with QR scanning.

## Generate and open

```bash
cd apps/ios
xcodegen generate
open Nightframe.xcodeproj
```

Select your Apple Developer team before device testing. Camera capture and QR scanning require a physical iPhone for meaningful verification.

## Configuration

Production API and web URLs are build settings in `project.yml`. Regenerate the project after changing configuration or adding source files.

Universal Links require the included AASA file to be deployed from `apps/web/public/.well-known/apple-app-site-association`. Follow `RELEASE_CHECKLIST.md` before TestFlight distribution.
