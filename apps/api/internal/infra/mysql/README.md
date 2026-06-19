# MySQL Backend Plan

`DATA_BACKEND=mysql` and `DATA_BACKEND=dual` are reserved for the permanent system of record.

Implementation steps:

1. Add MySQL repository structs that satisfy the interfaces in `internal/ports`.
2. Run `migrations/mysql/001_initial.sql`.
3. In `dual` mode, write to MySQL first, then Redis for cache/session/rate-limit data.
4. Keep object storage unchanged; photo binaries remain outside the database.
5. Use Redis for guest sessions, idempotency, and rate limit counters even after MySQL is primary.

Redis keys intentionally mirror domain aggregate IDs so `tools/redis-to-mysql` can scan and migrate JSON documents without translating business rules.
