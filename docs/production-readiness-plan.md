# Production Readiness Remediation Plan

## Summary

Harden production while preserving local development behavior, existing data, and active QR links. Replace custom admin authentication with invite-only Supabase Auth accounts and required TOTP MFA, exchange guest URL capabilities for HttpOnly sessions, consolidate uploads behind one transactional API, and add deployment-safe migrations and automated security tests.

Infrastructure backups and external monitoring are excluded; the application will expose structured logs and health signals for later integration.

## Implementation Changes

### Authentication and authorization

- Add `host_profiles`, `event_memberships`, `guest_sessions`, and `host_invitations` tables. Backfill existing events to an initial owner supplied by deployment secret/configuration.
- Support event roles `owner` and `collaborator`. Owners can manage membership; both roles can manage event content. Every admin query must filter through membership.
- Replace `/admin/login` and `admin_sessions` with Supabase email/password authentication. Disable public signup and create hosts only through expiring, single-use owner invitations.
- Add login, invitation acceptance, TOTP enrollment, TOTP challenge, session refresh, and logout API routes. Reject every admin operation unless the verified Supabase JWT has `aal2`.
- Store access and refresh sessions only in `Secure`, `HttpOnly`, `SameSite=Lax` cookies. Add strict Origin validation and CSRF tokens to every state-changing browser request.
- Keep the legacy password route temporarily disabled by a production flag, enabled only in local development. Remove its migration-set hash after the initial owner is verified.

### Same-origin sessions and guest capabilities

- Rewrite web `/api/:path*` requests through Vercel to the Supabase Edge Function; stop browser calls directly to `*.supabase.co`.
- Add a guest capability-exchange endpoint. It validates the existing event token once, creates a hashed server-side guest session, sets an HttpOnly cookie, and returns a token-free destination.
- Immediately remove `token`, `t`, and `access_token` from browser URLs with `history.replaceState`. Prevent the service worker from caching any token-bearing request or `/api` response.
- Preserve existing QR links during migration. Web and iOS redeem them through the new exchange endpoint; iOS retains the resulting API-origin cookie in `URLSession`.
- Rotate or revoke guest sessions when an event token is reset, a guest is blocked, or the event is deleted.

### Upload integrity and abuse resistance

- Make the monolithic API the canonical upload interface. Migrate both clients, collect compatibility telemetry through structured logs, then return `410 Gone` from the duplicate session functions before removing them.
- Replace read/check/write quota logic with transactional PostgreSQL RPCs that:
  - lock the guest/event rows;
  - atomically reserve a slot and byte allowance;
  - create one upload intent;
  - consume each intent exactly once;
  - release expired reservations.
- Add atomic rate-limit RPCs for login, capability exchange, session creation, presign, completion, gallery access, and archive creation. Key limits by endpoint plus HMAC-derived IP, account, event, and guest identifiers.
- Persist expected path, MIME type, size, guest, event, and expiry before issuing a signed upload URL. At completion, compare trusted Storage metadata with the intent; never accept client overrides or download the whole object.
- Validate file signatures for supported image/video formats before approval. Quarantine mismatches, delete failed/expired objects, and keep new media pending until validation succeeds.
- Add scheduled cleanup for expired sessions, rate-limit windows, upload intents, abandoned objects, and generated archives.
- Replace in-memory ZIP generation with an asynchronous export job that writes the archive to private Storage and returns job status plus a short-lived download URL.

### Browser and deployment hardening

- Add CSP, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`, Referrer Policy, Permissions Policy, and no-store headers for authenticated/token-bearing routes.
- Restrict CORS to configured development origins; production browser traffic is same-origin. Reject unexpected `Host` and `Origin` values.
- Separate development and production configuration. `./dev` may create local credentials, but deployment must fail if development flags, default credentials, HTTP origins, missing secrets, or unrestricted CORS are detected.
- Add structured, token-redacted security events for authentication failures, throttling, membership changes, token rotation, blocked guests, rejected uploads, and archive requests.
- Add CI for locked dependency installation, typecheck, production build, migration reset, Edge Function tests, secret scanning, dependency audit, and production-configuration validation.

## Public Interfaces and Migration

- Add `/api/v1/auth/*` routes for host login, invitation acceptance, MFA enrollment/challenge, refresh, session inspection, and logout.
- Add `/api/v1/guest/:slug/exchange` and make subsequent guest routes session-cookie based.
- Upload preparation returns an intent ID, signed upload details, reservation expiry, and remaining quota. Completion accepts only the intent ID and upload proof.
- Archive requests become job-based: create job, poll status, then retrieve a signed result.
- Deploy additive schema changes first, dual-read legacy event ownership and guest tokens during transition, migrate clients, verify adoption, disable legacy routes, then remove legacy tables/columns in a later release.

## Test and Acceptance Plan

- Verify unauthenticated, AAL1, expired, revoked, and non-member hosts cannot access events; verify owner/collaborator boundaries and invitation expiry.
- Verify required TOTP enrollment, challenge, refresh, logout, cookie flags, CSRF rejection, and rate limiting.
- Verify old QR links exchange successfully, URLs are scrubbed, tokens never enter Cache Storage, and token reset invalidates sessions.
- Race concurrent presign/completion calls and prove photo/byte quotas cannot be exceeded and one intent cannot complete twice.
- Test oversized files, MIME spoofing, missing objects, altered paths, expired intents, interrupted uploads, cleanup, and blocked guests.
- Load-test login, exchange, gallery, upload, and archive-job creation; define passing thresholds before release from observed staging baselines.
- Run migration tests from the current schema with representative events/media, web build tests, iOS unit/UI tests, and end-to-end staging smoke tests.
- Release through staging, then a production canary with legacy compatibility enabled. Remove compatibility only after logs show supported clients using the canonical routes.

## Assumptions

- Production uses Vercel for the web app and Supabase for Auth, Postgres, Storage, and Edge Functions.
- Host accounts are invite-only; events have one owner and optional collaborators.
- TOTP MFA at AAL2 is mandatory for all host operations.
- Existing data and QR links must remain valid during rollout.
- External backup/PITR, uptime monitoring, paging, and incident-response tooling remain outside this code-focused plan and must be completed separately before declaring the overall service production-ready.
