# Security Notes

- QR links contain an event access token; the API stores only peppered token hashes.
- Guest identity uses a cryptographically random 256-bit token in an HttpOnly SameSite=Lax cookie.
- MAC addresses are never read or stored.
- Clearing browser data, using private browsing, or switching devices creates a new guest identity in the MVP.
- Add optional phone OTP or email magic link later for stronger identity.
- Do not use invasive fingerprinting as an identity control.
- Store image binaries only in S3-compatible object storage.
