package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"oneshotonenight/api/internal/domain"
)

type Store struct{ pool *pgxpool.Pool }

type EventRepo struct{ store *Store }
type GuestRepo struct{ store *Store }
type PhotoRepo struct{ store *Store }
type IdempotencyRepo struct{ store *Store }
type UploadIntentRepo struct{ store *Store }
type AdminSessionRepo struct{ store *Store }
type RateLimitRepo struct{ store *Store }

func NewPool(ctx context.Context, databaseURL string, maxConnections int32) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = maxConnections
	cfg.MinConns = 1
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.MaxConnLifetime = 30 * time.Minute
	// Supavisor transaction mode cannot safely retain named prepared statements.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to Supabase Postgres: %w", err)
	}
	return pool, nil
}

func NewStore(pool *pgxpool.Pool) *Store          { return &Store{pool: pool} }
func (s *Store) Events() *EventRepo               { return &EventRepo{s} }
func (s *Store) Guests() *GuestRepo               { return &GuestRepo{s} }
func (s *Store) Photos() *PhotoRepo               { return &PhotoRepo{s} }
func (s *Store) Idempotency() *IdempotencyRepo    { return &IdempotencyRepo{s} }
func (s *Store) Uploads() *UploadIntentRepo       { return &UploadIntentRepo{s} }
func (s *Store) AdminSessions() *AdminSessionRepo { return &AdminSessionRepo{s} }
func (s *Store) RateLimits() *RateLimitRepo       { return &RateLimitRepo{s} }

const eventColumns = `id, slug, name, description, guest_url, access_token_hash, access_token_version,
organizer_token_hash, mode, status, starts_at, ends_at, reveal_at, max_guests, max_photos_per_guest,
allow_gallery_uploads, prefer_camera_capture, allow_immediate_gallery, auto_approve_photos,
offline_upload_grace_hours, created_at, updated_at`

type rowScanner interface{ Scan(...any) error }

func scanEvent(row rowScanner) (*domain.Event, error) {
	var e domain.Event
	err := row.Scan(&e.ID, &e.Slug, &e.Name, &e.Description, &e.GuestURL, &e.AccessTokenHash, &e.AccessTokenVersion,
		&e.OrganizerTokenHash, &e.Mode, &e.Status, &e.StartsAt, &e.EndsAt, &e.RevealAt, &e.MaxGuests,
		&e.MaxPhotosPerGuest, &e.AllowGalleryUploads, &e.PreferCameraCapture, &e.AllowImmediateGallery,
		&e.AutoApprovePhotos, &e.OfflineUploadGraceHours, &e.CreatedAt, &e.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &e, err
}

func (r *EventRepo) Create(ctx context.Context, e *domain.Event) error {
	_, err := r.store.pool.Exec(ctx, `insert into private.events (`+eventColumns+`) values
	($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
		e.ID, e.Slug, e.Name, e.Description, e.GuestURL, e.AccessTokenHash, e.AccessTokenVersion, e.OrganizerTokenHash,
		e.Mode, e.Status, e.StartsAt, e.EndsAt, e.RevealAt, e.MaxGuests, e.MaxPhotosPerGuest, e.AllowGalleryUploads,
		e.PreferCameraCapture, e.AllowImmediateGallery, e.AutoApprovePhotos, e.OfflineUploadGraceHours, e.CreatedAt, e.UpdatedAt)
	return err
}
func (r *EventRepo) GetByID(ctx context.Context, id string) (*domain.Event, error) {
	return scanEvent(r.store.pool.QueryRow(ctx, `select `+eventColumns+` from private.events where id=$1`, id))
}
func (r *EventRepo) GetBySlug(ctx context.Context, slug string) (*domain.Event, error) {
	return scanEvent(r.store.pool.QueryRow(ctx, `select `+eventColumns+` from private.events where slug=$1`, slug))
}
func (r *EventRepo) List(ctx context.Context) ([]domain.Event, error) {
	rows, err := r.store.pool.Query(ctx, `select `+eventColumns+` from private.events order by created_at desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Event{}
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}
func (r *EventRepo) Update(ctx context.Context, e *domain.Event) error {
	e.UpdatedAt = time.Now().UTC()
	cmd, err := r.store.pool.Exec(ctx, `update private.events set slug=$2,name=$3,description=$4,guest_url=$5,
	access_token_hash=$6,access_token_version=$7,organizer_token_hash=$8,mode=$9,status=$10,starts_at=$11,
	ends_at=$12,reveal_at=$13,max_guests=$14,max_photos_per_guest=$15,allow_gallery_uploads=$16,
	prefer_camera_capture=$17,allow_immediate_gallery=$18,auto_approve_photos=$19,
	offline_upload_grace_hours=$20,updated_at=$21 where id=$1`, e.ID, e.Slug, e.Name, e.Description, e.GuestURL,
		e.AccessTokenHash, e.AccessTokenVersion, e.OrganizerTokenHash, e.Mode, e.Status, e.StartsAt, e.EndsAt, e.RevealAt,
		e.MaxGuests, e.MaxPhotosPerGuest, e.AllowGalleryUploads, e.PreferCameraCapture, e.AllowImmediateGallery,
		e.AutoApprovePhotos, e.OfflineUploadGraceHours, e.UpdatedAt)
	if err == nil && cmd.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return err
}
func (r *EventRepo) Delete(ctx context.Context, id string) error {
	cmd, err := r.store.pool.Exec(ctx, `delete from private.events where id=$1`, id)
	if err == nil && cmd.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return err
}

const guestColumns = `id,event_id,device_token_hash,display_name,upload_count,message_count,created_at,last_seen_at,status`

func scanGuest(row rowScanner) (*domain.Guest, error) {
	var g domain.Guest
	err := row.Scan(&g.ID, &g.EventID, &g.DeviceTokenHash, &g.DisplayName, &g.UploadCount, &g.MessageCount, &g.CreatedAt, &g.LastSeenAt, &g.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &g, err
}
func (r *GuestRepo) Create(ctx context.Context, g *domain.Guest) error {
	_, err := r.store.pool.Exec(ctx, `insert into private.guests (`+guestColumns+`) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		g.ID, g.EventID, g.DeviceTokenHash, g.DisplayName, g.UploadCount, g.MessageCount, g.CreatedAt, g.LastSeenAt, g.Status)
	return err
}
func (r *GuestRepo) GetByID(ctx context.Context, id string) (*domain.Guest, error) {
	return scanGuest(r.store.pool.QueryRow(ctx, `select `+guestColumns+` from private.guests where id=$1`, id))
}
func (r *GuestRepo) FindByEventAndDeviceToken(ctx context.Context, eventID, tokenHash string) (*domain.Guest, error) {
	return scanGuest(r.store.pool.QueryRow(ctx, `select `+guestColumns+` from private.guests where event_id=$1 and device_token_hash=$2`, eventID, tokenHash))
}
func (r *GuestRepo) FindOrCreateByEventAndDeviceToken(ctx context.Context, g *domain.Guest, maxGuests int) (*domain.Guest, error) {
	tx, err := r.store.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var lockedEventID string
	if err = tx.QueryRow(ctx, `select id from private.events where id=$1 for update`, g.EventID).Scan(&lockedEventID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	existing, err := scanGuest(tx.QueryRow(ctx, `select `+guestColumns+` from private.guests where event_id=$1 and device_token_hash=$2`, g.EventID, g.DeviceTokenHash))
	if err == nil {
		name := existing.DisplayName
		if g.DisplayName != "" {
			name = g.DisplayName
		}
		existing.DisplayName, existing.LastSeenAt = name, time.Now().UTC()
		_, err = tx.Exec(ctx, `update private.guests set display_name=$2,last_seen_at=$3 where id=$1`, existing.ID, name, existing.LastSeenAt)
		if err != nil {
			return nil, err
		}
		if err = tx.Commit(ctx); err != nil {
			return nil, err
		}
		return existing, nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	var count int
	if err = tx.QueryRow(ctx, `select count(*) from private.guests where event_id=$1`, g.EventID).Scan(&count); err != nil {
		return nil, err
	}
	if count >= maxGuests {
		return nil, domain.ErrGuestLimit
	}
	_, err = tx.Exec(ctx, `insert into private.guests (`+guestColumns+`) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, g.ID, g.EventID, g.DeviceTokenHash, g.DisplayName, g.UploadCount, g.MessageCount, g.CreatedAt, g.LastSeenAt, g.Status)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return g, nil
}
func (r *GuestRepo) CountByEvent(ctx context.Context, eventID string) (int, error) {
	var n int
	err := r.store.pool.QueryRow(ctx, `select count(*) from private.guests where event_id=$1`, eventID).Scan(&n)
	return n, err
}
func (r *GuestRepo) ListByEvent(ctx context.Context, eventID string) ([]domain.Guest, error) {
	rows, err := r.store.pool.Query(ctx, `select `+guestColumns+` from private.guests where event_id=$1 order by created_at`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Guest{}
	for rows.Next() {
		g, err := scanGuest(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *g)
	}
	return out, rows.Err()
}
func (r *GuestRepo) IncrementUploadCount(ctx context.Context, id string, limit int) (int, error) {
	var count int
	err := r.store.pool.QueryRow(ctx, `update private.guests set upload_count=upload_count+1,last_seen_at=now() where id=$1 and upload_count<$2 returning upload_count`, id, limit).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		if e := r.store.pool.QueryRow(ctx, `select exists(select 1 from private.guests where id=$1)`, id).Scan(&exists); e != nil {
			return 0, e
		}
		if !exists {
			return 0, domain.ErrNotFound
		}
		return 0, domain.ErrUploadLimit
	}
	return count, err
}
func (r *GuestRepo) Update(ctx context.Context, g *domain.Guest) error {
	cmd, err := r.store.pool.Exec(ctx, `update private.guests set display_name=$2,upload_count=$3,message_count=$4,last_seen_at=$5,status=$6 where id=$1`, g.ID, g.DisplayName, g.UploadCount, g.MessageCount, g.LastSeenAt, g.Status)
	if err == nil && cmd.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return err
}

const photoColumns = `id,event_id,guest_id,object_key,content_type,size_bytes,message,status,is_developed,created_at,updated_at`

func scanPhoto(row rowScanner) (*domain.Photo, error) {
	var p domain.Photo
	err := row.Scan(&p.ID, &p.EventID, &p.GuestID, &p.ObjectKey, &p.ContentType, &p.SizeBytes, &p.Message, &p.Status, &p.IsDeveloped, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &p, err
}
func (r *PhotoRepo) Create(ctx context.Context, p *domain.Photo) error {
	_, err := r.store.pool.Exec(ctx, `insert into private.photos (`+photoColumns+`) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, p.ID, p.EventID, p.GuestID, p.ObjectKey, p.ContentType, p.SizeBytes, p.Message, p.Status, p.IsDeveloped, p.CreatedAt, p.UpdatedAt)
	return err
}
func (r *PhotoRepo) GetByID(ctx context.Context, id string) (*domain.Photo, error) {
	return scanPhoto(r.store.pool.QueryRow(ctx, `select `+photoColumns+` from private.photos where id=$1`, id))
}
func (r *PhotoRepo) ListByEvent(ctx context.Context, eventID string, filter domain.PhotoFilter) ([]domain.Photo, error) {
	query := `select ` + photoColumns + ` from private.photos where event_id=$1`
	args := []any{eventID}
	if !filter.IncludeDeleted {
		query += ` and status <> 'deleted'`
	}
	if len(filter.Statuses) > 0 {
		query += ` and status = any($2)`
		statuses := make([]string, len(filter.Statuses))
		for i, s := range filter.Statuses {
			statuses[i] = string(s)
		}
		args = append(args, statuses)
	}
	query += ` order by created_at desc`
	rows, err := r.store.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Photo{}
	for rows.Next() {
		p, err := scanPhoto(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}
func (r *PhotoRepo) UpdateStatus(ctx context.Context, id string, status domain.PhotoStatus) error {
	cmd, err := r.store.pool.Exec(ctx, `update private.photos set status=$2,updated_at=now() where id=$1`, id, status)
	if err == nil && cmd.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return err
}

func (r *IdempotencyRepo) Reserve(ctx context.Context, scope, key string, ttl time.Duration) (bool, error) {
	var reserved bool
	err := r.store.pool.QueryRow(ctx, `insert into private.idempotency_keys(scope,idempotency_key,expires_at) values($1,$2,$3) on conflict(scope,idempotency_key) do update set expires_at=excluded.expires_at where private.idempotency_keys.expires_at<=now() returning true`, scope, key, time.Now().UTC().Add(ttl)).Scan(&reserved)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return reserved, err
}
func (r *UploadIntentRepo) Create(ctx context.Context, i *domain.UploadIntent, ttl time.Duration) error {
	_, err := r.store.pool.Exec(ctx, `insert into private.upload_intents(photo_id,event_id,guest_id,object_key,content_type,size_bytes,token_hash,expires_at,used) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, i.PhotoID, i.EventID, i.GuestID, i.ObjectKey, i.ContentType, i.SizeBytes, i.TokenHash, i.ExpiresAt, i.Used)
	return err
}
func scanIntent(row rowScanner) (*domain.UploadIntent, error) {
	var i domain.UploadIntent
	err := row.Scan(&i.PhotoID, &i.EventID, &i.GuestID, &i.ObjectKey, &i.ContentType, &i.SizeBytes, &i.TokenHash, &i.ExpiresAt, &i.Used)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return &i, err
}
func (r *UploadIntentRepo) GetByPhotoID(ctx context.Context, id string) (*domain.UploadIntent, error) {
	return scanIntent(r.store.pool.QueryRow(ctx, `select photo_id,event_id,guest_id,object_key,content_type,size_bytes,token_hash,expires_at,used from private.upload_intents where photo_id=$1 and expires_at>now()`, id))
}
func (r *UploadIntentRepo) MarkUsed(ctx context.Context, id, tokenHash string) (*domain.UploadIntent, error) {
	i, err := scanIntent(r.store.pool.QueryRow(ctx, `update private.upload_intents set used=true where photo_id=$1 and token_hash=$2 and used=false and expires_at>now() returning photo_id,event_id,guest_id,object_key,content_type,size_bytes,token_hash,expires_at,used`, id, tokenHash))
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.ErrForbidden
	}
	return i, err
}

func (r *AdminSessionRepo) Create(ctx context.Context, s *domain.AdminSession, ttl time.Duration) error {
	_, err := r.store.pool.Exec(ctx, `insert into private.admin_sessions(id,expires_at,created_at) values($1,$2,$3)`, s.ID, s.ExpiresAt, s.CreatedAt)
	return err
}
func (r *AdminSessionRepo) Get(ctx context.Context, id string) (*domain.AdminSession, error) {
	var s domain.AdminSession
	err := r.store.pool.QueryRow(ctx, `select id,expires_at,created_at from private.admin_sessions where id=$1 and expires_at>now()`, id).Scan(&s.ID, &s.ExpiresAt, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		_, _ = r.store.pool.Exec(ctx, `delete from private.admin_sessions where id=$1`, id)
		return nil, domain.ErrUnauthorized
	}
	return &s, err
}
func (r *AdminSessionRepo) Delete(ctx context.Context, id string) error {
	_, err := r.store.pool.Exec(ctx, `delete from private.admin_sessions where id=$1`, id)
	return err
}

func (r *RateLimitRepo) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	now := time.Now().UTC()
	bucket := now.Truncate(window)
	expires := bucket.Add(window)
	var count int
	err := r.store.pool.QueryRow(ctx, `insert into private.rate_limits(rate_key,window_start,count,expires_at) values($1,$2,1,$3) on conflict(rate_key,window_start) do update set count=private.rate_limits.count+1 returning count`, key, bucket, expires).Scan(&count)
	return count <= limit, err
}
