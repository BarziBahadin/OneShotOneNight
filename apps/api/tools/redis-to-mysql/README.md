# Redis to MySQL Migration Utility

Planned command:

```bash
go run ./tools/redis-to-mysql \
  -redis "$REDIS_ADDR" \
  -mysql "$MYSQL_DSN" \
  -dry-run=false
```

Migration order:

1. Scan `oson:event:*` documents and insert `events`.
2. Scan `oson:guest:*` documents and insert `guests`.
3. Scan `oson:photo:*` documents and insert `photos`.
4. Compare Redis set membership counts with MySQL counts per event.
5. Enable `DATA_BACKEND=dual` for a verification window.
6. Switch reads to MySQL when counts and random spot checks match.
