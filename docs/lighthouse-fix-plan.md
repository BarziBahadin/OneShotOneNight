# Lighthouse remediation plan

Date: 2026-06-22

## Scope and baseline

This plan is based on the five supplied Lighthouse 13.2.0 JSON reports. They represent three unique routes and four unique runs:

| Route | Performance | Accessibility | Best practices | SEO | Report quality |
| --- | ---: | ---: | ---: | ---: | --- |
| `/` | — | — | — | — | Invalid: Lighthouse stopped with `NO_FCP`; stored IndexedDB data may also have affected the run. |
| `/admin` | 93 | 100 | 100 | 91 | Valid, but contaminated by several Chrome extensions. |
| `/admin/events/9A3…` | 93 | 95 | 100 | 92 | Valid, but contaminated by several Chrome extensions. Supplied twice with the same timestamp and results. |
| `/admin/events/E8…` | 90 | 95 | 100 | 92 | Valid, image-heavy event. This is the most useful report for media findings. |

The reports do not show dozens of independent application defects. They show four meaningful application concerns:

1. Full-resolution event photos are downloaded into small grid cells.
2. A global `.bg-white` override breaks contrast on the QR share button.
3. Admin data loading is delayed by an authentication/API waterfall.
4. SEO/static delivery setup is incomplete: invalid `robots.txt`, blocking remote fonts, and no route-level metadata.

Several large warnings are measurement noise:

- Most of the reported unused JavaScript belongs to browser extensions. The application bundle accounts for about 48 KiB of the reported 317 KiB savings.
- Every item in the 61 KiB “unminified JavaScript” warning is from a browser extension, not this application.
- The back/forward cache warning says `CacheFlushed` and is explicitly marked “Not actionable.”
- About 23 KiB of the cache warning comes from Vercel's live feedback script rather than application code.
- The landing-page report has no scores because Lighthouse recorded no paint. It must be rerun before drawing conclusions.

## Execution order

### 1. Establish clean, repeatable measurements

Priority: P0. Do this before judging later work.

1. Run Lighthouse in a clean Chrome guest profile or Incognito with extensions explicitly disabled.
2. Disable the Vercel toolbar/live feedback injection for the test session.
3. Clear site data, unregister the service worker, and close other tabs before each cold-load run.
4. Capture both desktop and mobile runs for `/`, `/admin`, and one image-heavy event-detail route.
5. Run each route three times and use the median result; keep the raw JSON files under a dated local audit folder.
6. Record Core Web Vitals separately from diagnostic audits so a single failed audit does not get described as a broad application failure.

Acceptance criteria:

- The landing page produces real FCP/LCP values instead of `NO_FCP`.
- No audit item begins with `chrome-extension://`.
- No audit item comes from `vercel.live`.
- The same deployed commit and test profile are used for all baseline and comparison runs.

### 2. Fix the event-photo delivery path

Priority: P0. Largest confirmed payload reduction: about 1.37 MiB for only three visible photos.

Evidence:

- Images rendered around 260 pixels wide were downloaded at 2,400–5,525 pixels wide.
- Individual grid images transferred roughly 456–495 KiB while Lighthouse estimated 98–99% of those bytes were unnecessary.
- The event-detail grid at `apps/web/components/admin-event-detail.tsx` renders `photo.public_url` directly and does not provide lazy loading, decoding hints, or intrinsic dimensions.
- `signedPhotos()` in `supabase/functions/api/index.ts` currently signs the original object for every grid image.

Steps:

1. Preserve the original signed URL for full-screen viewing and ZIP downloads.
2. Add a separate thumbnail URL to the API response, for example `thumbnail_url`, rather than changing the meaning of `public_url` silently.
3. On Supabase Pro or above, create the private signed thumbnail URL with an image transform around 640–768 pixels wide, quality 70–80, and `resize: "contain"`. Supabase embeds transformation options into signed URLs and automatically serves WebP when supported.
4. If image transformations are unavailable on the current plan, generate a derivative thumbnail during upload and store it beside the original. Do not reduce the only stored original.
5. Add `width_px` and `height_px` metadata to photo registration. Populate it from the decoded client image and persist it with the photo record.
6. Return the dimensions with `PhotoRecord`; use them as `<img width height>` values so masonry cards reserve the correct aspect ratio before download.
7. Render grid images with `src={photo.thumbnail_url}`, `loading="lazy"`, and `decoding="async"`. The first above-the-fold image may use eager loading only if a clean trace proves it is the LCP element.
8. Keep `object_key` and original download behavior unchanged so moderation and archives retain full quality.
9. Paginate photos instead of signing and returning every event photo in one response. Start with 24–48 thumbnails and load subsequent pages on demand.
10. Set an appropriate Storage `cacheControl` value when uploading immutable photo objects. Signed URLs can still benefit from Supabase CDN caching; Smart CDN is available on Pro and above.

Relevant documentation:

- [Supabase Storage image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn)

Acceptance criteria:

- No event-grid thumbnail exceeds twice its maximum rendered width at the tested breakpoint.
- Initial visible event photos transfer less than 250 KiB total for three ordinary JPEG photos.
- Lighthouse no longer reports `image-delivery-insight` or `unsized-images` for event-grid images.
- Original-resolution archive downloads remain unchanged.

### 3. Repair the QR share-button contrast bug

Priority: P0. Confirmed WCAG 2 AA failure.

Root cause:

- `apps/web/app/globals.css` globally redefines Tailwind's `.bg-white` class to the dark card color.
- The QR share button requests `bg-white text-black`, but its computed background becomes approximately `#131315`, leaving black text on a dark background at a reported contrast ratio of 1.13:1.

Steps:

1. Remove the global `.bg-white { background-color: ... }` override.
2. Replace places that used `bg-white` to mean “dark card” with an explicit semantic class such as `surface`, `bg-card`, or a new design token utility.
3. Keep true white surfaces explicit for the QR image backing and primary Share button.
4. Search all `bg-white`, `text-black`, `text-white/*`, and translucent text combinations after the change; do not assume the one Lighthouse node is the only affected element.
5. Verify normal, hover, focus, active, and disabled states against WCAG AA.

Acceptance criteria:

- Normal text is at least 4.5:1; large text and non-text UI boundaries are at least 3:1.
- The Share button remains visibly white with dark text.
- Cards that are intended to remain dark do not turn white after removing the override.
- The event-detail accessibility score returns to 100 in a clean run.

### 4. Remove the admin authentication and data waterfall

Priority: P1. The report's longest request chain reached roughly 4.1 seconds.

Current sequence:

1. JavaScript loads.
2. `AdminGuard` calls `/admin/me`.
3. Only after that succeeds does the child route mount.
4. The dashboard or detail component then requests its data.
5. Event detail returns all guests, all photos, and a newly generated signed URL for every photo.

Steps:

1. Instrument Edge Function route duration and sub-operations before changing behavior. Log database query duration, signed-URL duration, row counts, and total response duration without logging tokens.
2. Avoid blocking all admin rendering on a separate `/admin/me` request. Let the protected data request validate the bearer token and redirect on `401`, or cache one session check in a shared admin-session provider.
3. Start route data loading as soon as the route is known; do not wait for an unrelated component effect where authentication can be validated by the same request.
4. Split event detail into a summary response plus paginated photo and guest endpoints. Do not fetch and sign the full event history for the first paint.
5. Return stable summary counts directly instead of calculating them from full photo and guest arrays in the browser.
6. Keep independent database queries parallel, but measure whether per-photo signed URL generation dominates after pagination.
7. Add visible error states with a retry action for session validation and event-data failures; do not treat every non-401 network failure as authenticated.

Acceptance criteria:

- An authenticated admin route performs one blocking API round trip before useful route content renders.
- Event detail initially returns a bounded number of guests/photos.
- Median warm Edge Function response time is below 500 ms and cold response time is recorded separately.
- No token, signed URL, password, or guest capability appears in logs.

### 5. Add a real `robots.txt` and route indexing policy

Priority: P1. Confirmed on every valid report.

Root cause:

- `/robots.txt` is caught by the Vercel SPA rewrite and returns `index.html`, producing 19 syntax errors.

Steps:

1. Add `apps/web/public/robots.txt` so Vite copies a real plain-text file to the deployment root.
2. Allow the public landing page and disallow private application routes such as `/admin/`, `/guest/`, and `/gallery/`.
3. Add route-specific `noindex, nofollow` metadata or `X-Robots-Tag` headers for admin, guest, and private gallery routes. Treat this as indexing hygiene, not access control.
4. Give the landing route a canonical URL, descriptive title, and public description.
5. Configure Vercel so static files such as `/robots.txt` are served before the catch-all SPA rewrite.
6. Verify `/robots.txt` returns `200`, `text/plain`, and never contains HTML.

Acceptance criteria:

- Lighthouse reports a valid `robots.txt`.
- Private routes declare `noindex` and remain protected by application authentication/capability checks.
- The public landing page remains indexable.

### 6. Self-host and preload the fonts

Priority: P1. Confirmed render-blocking chain: Google Fonts CSS added about 339 ms in the supplied admin run.

Steps:

1. Download only the WOFF2 subsets and weights actually used for Inter and Playfair Display, ensuring the font licenses are retained.
2. Store them under `apps/web/public/fonts/` with immutable filenames.
3. Replace the CSS `@import` in `apps/web/app/globals.css` with local `@font-face` rules and `font-display: swap`.
4. Preload only the font files required above the fold. Do not preload every weight.
5. Keep a system-font fallback with similar metrics to reduce layout movement while the webfont loads.

Acceptance criteria:

- No request is made to `fonts.googleapis.com` or `fonts.gstatic.com`.
- Lighthouse no longer identifies Google Fonts as render blocking.
- Text remains readable immediately with fonts disabled or on a slow connection.

### 7. Split JavaScript by route

Priority: P2. Real but substantially smaller than the extension-contaminated report suggests.

Root cause:

- `apps/web/router.tsx` statically imports every public, guest, gallery, login, dashboard, event editor, and event-detail screen.
- The QR-code library is therefore eligible to enter the initial application graph even on routes that never display a QR code.

Steps:

1. Convert route components to `React.lazy()` imports and add a route-level `Suspense` fallback.
2. Keep the landing-page chunk independent of admin, camera, gallery, and QR-generation code.
3. Dynamically import `qrcode` only when an event QR or gallery QR is actually needed.
4. Inspect the Vite bundle output after splitting; set a small, explicit chunk-size budget for the landing and admin entry paths.
5. Do not spend time “minifying” the Chrome-extension files from the old report; Vite already emits a production-minified application bundle.

Acceptance criteria:

- Loading `/` does not download admin, guest-camera, gallery, or QR-generation modules.
- Loading `/admin` does not download event-detail QR code until that route is opened.
- Clean Lighthouse reports only first-party application JavaScript.

### 8. Optimize bundled landing-page images

Priority: P2, pending a valid landing-page Lighthouse run. Repository inspection already shows several 450–942 KiB JPEGs used on `/`.

Steps:

1. Generate correctly sized AVIF/WebP variants for each landing-page placement while keeping a JPEG fallback where required.
2. Use `<picture>` and `srcset`/`sizes` for responsive delivery.
3. Add intrinsic width and height to every content image.
4. Give only the actual hero/LCP image high fetch priority; lazy-load below-the-fold photography with asynchronous decoding.
5. Avoid loading the same large source image multiple times at sizes far below its intrinsic resolution.
6. Re-run the landing-page audit before assigning a final byte or LCP budget because the supplied run is invalid.

Acceptance criteria:

- The landing page has a valid Lighthouse run with no `NO_FCP`.
- Below-the-fold photos are lazy-loaded.
- No delivered source is materially larger than its rendered slot requires.
- Mobile LCP is at most 2.5 seconds at Lighthouse's default mobile throttling.

### 9. Verify service-worker behavior separately

Priority: P2. The invalid landing report warned that stored IndexedDB data may have affected the run; production also registers a service worker.

Steps:

1. Run one test with the service worker disabled to measure the network baseline and one repeat-navigation test with it enabled.
2. Confirm a deployment changes the service-worker cache version and does not leave old HTML pointing to deleted hashed assets.
3. Confirm navigation caching never stores authenticated API responses or private Supabase signed media.
4. Add an offline fallback state that clearly distinguishes unavailable network data from an invalid invitation or expired admin session.
5. Test upgrade behavior from the currently deployed cache version, not only a fresh installation.

Acceptance criteria:

- A new deployment becomes usable without manually clearing browser storage.
- Private API responses and signed Storage URLs are absent from Cache Storage.
- Offline and expired-session states show different, actionable messages.

## Final verification matrix

After implementation, run:

1. `npm run typecheck` in `apps/web`.
2. `npm run build` in `apps/web` and inspect the emitted chunk sizes.
3. Clean Lighthouse desktop and mobile runs for `/`, `/admin`, and an image-heavy event detail.
4. Keyboard-only navigation through login, event list, event detail tabs, QR sharing, photo moderation, and settings.
5. Automated accessibility checks plus manual focus, zoom, contrast, and screen-reader checks. Lighthouse 100 alone is not an accessibility-compliance claim.
6. Slow-network tests for first load, returning load, expired admin session, expired invitation, and event detail with 0, 30, and 500 photos.
7. Supabase Edge Function timing checks for warm and cold requests, with and without event photos.

Target gates:

| Gate | Target |
| --- | --- |
| Accessibility | 100 Lighthouse on tested routes; zero known WCAG AA contrast failures |
| Best practices | 100 |
| SEO | At least 100 on the public route; private routes intentionally `noindex` |
| Desktop performance | At least 95 on all tested routes |
| Mobile performance | At least 90 on public and guest routes |
| LCP | At most 2.5 seconds on the default mobile profile |
| CLS | At most 0.1 |
| Initial event photos | Bounded page size and responsive thumbnails; originals loaded only on demand |

## Recommended delivery batches

1. Batch A: clean measurements, contrast, and `robots.txt`.
2. Batch B: transformed/persisted thumbnails, intrinsic dimensions, lazy loading, and photo pagination.
3. Batch C: admin auth/data waterfall and Edge Function timing.
4. Batch D: local fonts, route splitting, and landing-image variants.
5. Batch E: service-worker upgrade tests and full verification matrix.

Each batch should deploy independently and be followed by the same clean Lighthouse profile. Do not combine all work into one release; otherwise regressions cannot be attributed to a specific change.
