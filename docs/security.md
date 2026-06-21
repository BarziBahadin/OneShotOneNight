# Security Notes

- QR links contain an event access capability. After the first successful request,
  the browser exchanges it for an HttpOnly guest cookie and removes it from the
  address bar.
- Event capabilities are derived from the server pepper plus a non-secret rotation
  version. Redis stores the rotation version and peppered hash, never the plaintext
  capability or capability URL.
- Startup rotates legacy plaintext links and automatically reconciles event hashes
  after a pepper rotation. Existing printed links must be replaced after either migration.
- Guest identity uses a cryptographically random 256-bit token in an HttpOnly SameSite=Lax cookie.
- MAC addresses are never read or stored.
- Clearing browser data, using private browsing, or switching devices creates a new guest identity in the MVP.
- Add optional phone OTP or email magic link later for stronger identity.
- Do not use invasive fingerprinting as an identity control.
- Store image binaries only in S3-compatible object storage.
- Browser uploads use signed POST policies that enforce the exact MIME type and a
  content-length range before object storage accepts the file.
- New objects land under `pending/`, are copied to their final key only after
  verification, and are removed by a one-day lifecycle rule if registration is abandoned.
- Login, upload, registration, and gallery limits use atomic Redis counters so they
  survive API restarts and apply across instances.
