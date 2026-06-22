# Security Notes

- QR links contain an event access capability. The browser combines it with a local,
  cryptographically random device token when calling the Edge Function.
- Postgres stores peppered capability and device-token hashes, never plaintext tokens.
- Admin sessions use short-lived bearer tokens whose peppered hashes are stored in Postgres.
- Application tables have RLS enabled with no client policies. Only the Edge Function's
  server-side Supabase key can access them.
- MAC addresses are never read or stored.
- Clearing browser data, using private browsing, or switching devices creates a new guest identity in the MVP.
- Add optional phone OTP or email magic link later for stronger identity.
- Do not use invasive fingerprinting as an identity control.
- Store image binaries only in the private Supabase Storage bucket.
- Browser uploads use short-lived signed PUT URLs bound to the object path and MIME
  type. The bucket and Edge Function enforce the maximum declared file size and MIME type.
- New objects land under an event-specific `pending/` path.
- Login, upload, registration, and gallery limits use atomic PostgreSQL writes so they
  survive API restarts and apply across instances.
