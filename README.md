# OneShotOneNight

A QR-based private event camera and reveal gallery for weddings, parties, trips, graduations, and company events.

Guests scan a static event QR code, open a private web guest page, take or choose photos, and upload them into the event. Hosts create events, share guest links, manage photos and guests, and download all event photos as a ZIP.

## Stack

- `apps/web`: Vite, React, React Router, TypeScript, Tailwind CSS, PWA metadata, service worker.
- `apps/api`: Go, `net/http`, `go-chi/chi`, Redis-backed repositories, S3-compatible object storage.
- `deployments`: local Redis and MinIO via Docker Compose.
- `apps/api/migrations/mysql`: planned durable MySQL schema. The current runtime still uses Redis repositories; do not treat MySQL mode as production-ready until repository support is implemented.

## Local Setup

Prerequisites:

- Docker Desktop
- Go
- Node
- Web dependencies installed in `apps/web`

First-time setup:

```bash
cp .env.example .env
cd apps/web
npm install
cd ../..
```

Start the app:

```bash
./dev
```

Restart a running dev server:

```bash
./dev restart
```

`./dev` starts Vite on port `3000`. Vite starts Redis/MinIO with Docker Compose and launches the Go API on port `8080` when needed. Browser API requests go through Vite, so frontend code calls `/api/...` and Vite proxies to Go.

If Vite is already running, `./dev` prints the current local and network URLs instead of crashing.

## URLs

- Admin: `http://localhost:3000/admin`
- Local health check: `http://localhost:3000/healthz`
- Phone/LAN URL: printed by Vite as `Network: http://<your-ip>:3000/`

Default development admin password:

```text
admin
```

Guest links and QR codes use the machine’s current LAN IP, for example:

```text
http://192.168.6.92:3000/guest/event-slug?t=token
```

The IP can change when Wi-Fi/router changes. Restart Vite if the printed network address changes.

Production guest QR codes should point to:

```text
https://your-domain.com/guest/event-slug?t=token
```

Set these environment variables in production:

```bash
PUBLIC_WEB_URL=https://your-domain.com
CORS_ORIGINS=https://your-domain.com
COOKIE_SECURE=true
ADMIN_PASSWORD_HASH=$2b$...
TOKEN_PEPPER=<long-random-secret>
S3_ACCESS_KEY=<production-access-key>
S3_SECRET_KEY=<production-secret-key>
```

If the API runs behind a reverse proxy, set `TRUSTED_PROXIES` to the proxy IP or CIDR before relying on `X-Forwarded-For` for rate limiting.

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

Backend:

```bash
cd apps/api
go test ./...
```

Manual smoke test:

```bash
curl http://localhost:3000/healthz
```

Expected:

```json
{"ok":"true"}
```

## Architecture Notes

The API keeps domain logic independent of Redis and S3-compatible storage. Redis is the current MVP data backend; MySQL migrations exist for planned durable storage, but MySQL and dual-write runtime modes are not implemented yet.

Image binaries upload directly to object storage through presigned URLs. The API stores metadata and object keys, and streams ZIP downloads from object storage for hosts.

Guest identity never uses MAC addresses or invasive fingerprinting. Guests receive a cryptographically random token in an HttpOnly cookie; the server stores only a peppered hash.
# OneShotOneNight
