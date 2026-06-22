# OneShotOneNight

A QR-based private event camera and reveal gallery for weddings, parties, trips, graduations, and company events.

Guests scan a static event QR code, open a private web guest page, take or choose photos, and upload them into the event. Hosts create events, share guest links, manage photos and guests, and download all event photos as a ZIP.

## Stack

- `apps/web`: Vite, React, React Router, TypeScript, Tailwind CSS, PWA metadata, service worker.
- `supabase/functions/api`: Supabase Edge Function containing the application API and business logic.
- `supabase`: Postgres schema, RLS, server configuration, and private Storage bucket.

## Local Setup

Prerequisites:

- Node
- Web dependencies installed in `apps/web`
- A Supabase project with Database and Storage enabled

First-time setup:

```bash
cp .env.example .env
cd apps/web
npm install
cd ../..
```

Set `VITE_API_BASE_URL` to `https://<project-ref>.supabase.co/functions/v1/api`.

Apply the schema:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy api --no-verify-jwt
```

Start the app:

```bash
./dev
```

Restart a running dev server:

```bash
./dev restart
```

`./dev` starts Vite on port `3000`. All API, database, authentication-session, and Storage operations run on Supabase.

If Vite is already running, `./dev` prints the current local and network URLs instead of crashing.

## URLs

- Admin: `http://localhost:3000/admin`
- API health check: `https://<project-ref>.supabase.co/functions/v1/api/api/v1/health`
- Phone/LAN URL: printed by Vite as `Network: http://<your-ip>:3000/`

`./dev` generates persistent random development credentials in the ignored,
mode-`0600` `.dev-secrets` file and prints the current development admin
password when it starts. Delete `.dev-secrets` to rotate all local credentials.

Guest links and QR codes use the machine’s current LAN IP, for example:

```text
https://one-shot-one-night.vercel.app/guest/event-slug?t=token
```

The IP can change when Wi-Fi/router changes. Restart Vite if the printed network address changes.

Production guest QR codes should point to:

```text
https://your-domain.com/guest/event-slug?t=token
```

Set these frontend environment variables in production:

```bash
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1/api
VITE_PUBLIC_WEB_URL=https://your-domain.com
```

## Host Flow

1. Open `/admin`.
2. Sign in with the admin password.
3. Create an event with name, schedule, and gallery reveal timing.
4. Share the QR code or guest link.
5. Manage one event workspace:
   - QR and guest link
   - Schedule and activity
   - Photos
   - Guests
   - Settings
6. Use **Download all** in the photos area to download every non-deleted event photo as a ZIP.

## Guest Flow

1. Scan the QR code.
2. Join the private guest page.
3. Take a photo or choose one from the device gallery.
4. Add an optional message.
5. Upload the photo.
6. Open the gallery when the reveal rules allow it.

Guests do not enter tokens manually when using a valid QR link. The QR link is static for the event, and each browser gets its own server-side guest session through a generated device/session ID.

The web `/guest/...` page supports browser uploads through presigned object-storage URLs. Hosts can configure the grace window for late uploads after the event ends.

## Phone Testing

Use the Vite network URL printed in the terminal, not `localhost`.

Example:

```text
http://192.168.6.92:3000/healthz
```

If the phone cannot open it:

- Make sure the phone and Mac are on the same non-guest Wi-Fi.
- Use `http://`, not `https://`.
- Disable phone VPN, Private Relay, and mobile data while testing.
- Check iPhone Local Network permission for Safari/Chrome.
- Router guest mode or client isolation can block the phone from reaching the Mac.

## Verification

Frontend:

```bash
cd apps/web
npm run typecheck
npm run build
```

Manual smoke test:

```bash
curl https://<project-ref>.supabase.co/functions/v1/api/api/v1/health
```

Expected:

```json
{"ok":"true"}
```

## Architecture Notes

The Supabase Edge Function is the only supported data-access path. Application tables use RLS with no client policies, and the function accesses them with Supabase's server key. Photos live in a private Supabase Storage bucket and are served through short-lived signed URLs.

Image binaries upload directly to object storage through presigned URLs. The API stores metadata and object keys, and streams ZIP downloads from object storage for hosts.

Guest identity never uses MAC addresses or invasive fingerprinting. Guests receive a cryptographically random token in an HttpOnly cookie; the server stores only a peppered hash. Invitation capabilities are exchanged for that cookie and removed from the browser address bar. Postgres stores a non-secret rotation version instead of the plaintext invitation token.
# OneShotOneNight
