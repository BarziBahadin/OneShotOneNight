package redis

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"oneshotonenight/api/internal/domain"
)

type Store struct {
	client *goredis.Client
}

type EventRepo struct{ store *Store }
type GuestRepo struct{ store *Store }
type PhotoRepo struct{ store *Store }
type IdempotencyRepo struct{ store *Store }
type UploadIntentRepo struct{ store *Store }
type AdminSessionRepo struct{ store *Store }

type storedEvent struct {
	ID                      string             `json:"id"`
	Slug                    string             `json:"slug"`
	Name                    string             `json:"name"`
	Description             string             `json:"description"`
	GuestURL                string             `json:"guest_url"`
	AccessTokenHash         string             `json:"access_token_hash"`
	OrganizerTokenHash      string             `json:"organizer_token_hash"`
	Mode                    domain.EventMode   `json:"mode"`
	Status                  domain.EventStatus `json:"status"`
	StartsAt                time.Time          `json:"starts_at"`
	EndsAt                  time.Time          `json:"ends_at"`
	RevealAt                time.Time          `json:"reveal_at"`
	MaxGuests               int                `json:"max_guests"`
	MaxPhotosPerGuest       int                `json:"max_photos_per_guest"`
	AllowGalleryUploads     bool               `json:"allow_gallery_uploads"`
	PreferCameraCapture     bool               `json:"prefer_camera_capture"`
	AllowImmediateGallery   bool               `json:"allow_immediate_gallery"`
	AutoApprovePhotos       bool               `json:"auto_approve_photos"`
	OfflineUploadGraceHours int                `json:"offline_upload_grace_hours"`
	CreatedAt               time.Time          `json:"created_at"`
	UpdatedAt               time.Time          `json:"updated_at"`
}

func NewClient(addr, password string, db int) *goredis.Client {
	return goredis.NewClient(&goredis.Options{Addr: addr, Password: password, DB: db})
}

func NewStore(client *goredis.Client) *Store { return &Store{client: client} }
func (s *Store) Events() *EventRepo          { return &EventRepo{store: s} }
func (s *Store) Guests() *GuestRepo          { return &GuestRepo{store: s} }
func (s *Store) Photos() *PhotoRepo          { return &PhotoRepo{store: s} }
func (s *Store) Idempotency() *IdempotencyRepo {
	return &IdempotencyRepo{store: s}
}
func (s *Store) Uploads() *UploadIntentRepo       { return &UploadIntentRepo{store: s} }
func (s *Store) AdminSessions() *AdminSessionRepo { return &AdminSessionRepo{store: s} }

func (r *EventRepo) Create(ctx context.Context, event *domain.Event) error {
	b, _ := json.Marshal(storedEventFromDomain(event))
	pipe := r.store.client.TxPipeline()
	pipe.Set(ctx, key("event", event.ID), b, 0)
	pipe.Set(ctx, key("event_slug", event.Slug), event.ID, 0)
	pipe.ZAdd(ctx, key("events"), goredis.Z{Score: float64(event.CreatedAt.Unix()), Member: event.ID})
	_, err := pipe.Exec(ctx)
	return err
}

func (r *EventRepo) GetByID(ctx context.Context, id string) (*domain.Event, error) {
	var event storedEvent
	if err := getJSON(ctx, r.store.client, key("event", id), &event); err != nil {
		return nil, err
	}
	return event.toDomain(), nil
}

func (r *EventRepo) GetBySlug(ctx context.Context, slug string) (*domain.Event, error) {
	id, err := r.store.client.Get(ctx, key("event_slug", slug)).Result()
	if errors.Is(err, goredis.Nil) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, id)
}

func (r *EventRepo) List(ctx context.Context) ([]domain.Event, error) {
	ids, err := r.store.client.ZRevRange(ctx, key("events"), 0, -1).Result()
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	events := make([]domain.Event, 0, len(ids))
	for _, id := range ids {
		seen[id] = true
		event, err := r.GetByID(ctx, id)
		if errors.Is(err, domain.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		events = append(events, *event)
	}
	var cursor uint64
	for {
		keys, next, err := r.store.client.Scan(ctx, cursor, key("event", "*"), 100).Result()
		if err != nil {
			return nil, err
		}
		for _, k := range keys {
			var stored storedEvent
			if err := getJSON(ctx, r.store.client, k, &stored); err != nil {
				continue
			}
			if seen[stored.ID] {
				continue
			}
			seen[stored.ID] = true
			event := stored.toDomain()
			events = append(events, *event)
			r.store.client.ZAdd(ctx, key("events"), goredis.Z{Score: float64(event.CreatedAt.Unix()), Member: event.ID})
		}
		if next == 0 {
			break
		}
		cursor = next
	}
	return events, nil
}

func (r *EventRepo) Update(ctx context.Context, event *domain.Event) error {
	event.UpdatedAt = time.Now().UTC()
	b, _ := json.Marshal(storedEventFromDomain(event))
	return r.store.client.Set(ctx, key("event", event.ID), b, 0).Err()
}

func (r *EventRepo) Delete(ctx context.Context, id string) error {
	event, err := r.GetByID(ctx, id)
	if err != nil {
		return err
	}
	pipe := r.store.client.TxPipeline()
	pipe.Del(ctx, key("event", id))
	pipe.Del(ctx, key("event_slug", event.Slug))
	pipe.ZRem(ctx, key("events"), id)
	_, err = pipe.Exec(ctx)
	return err
}

func storedEventFromDomain(event *domain.Event) storedEvent {
	return storedEvent{
		ID: event.ID, Slug: event.Slug, Name: event.Name, Description: event.Description, GuestURL: event.GuestURL,
		AccessTokenHash: event.AccessTokenHash, OrganizerTokenHash: event.OrganizerTokenHash,
		Mode: event.Mode, Status: event.Status, StartsAt: event.StartsAt, EndsAt: event.EndsAt,
		RevealAt: event.RevealAt, MaxGuests: event.MaxGuests, MaxPhotosPerGuest: event.MaxPhotosPerGuest,
		AllowGalleryUploads: event.AllowGalleryUploads, PreferCameraCapture: event.PreferCameraCapture,
		AllowImmediateGallery: event.AllowImmediateGallery, AutoApprovePhotos: event.AutoApprovePhotos, OfflineUploadGraceHours: event.OfflineUploadGraceHours, CreatedAt: event.CreatedAt, UpdatedAt: event.UpdatedAt,
	}
}

func (event storedEvent) toDomain() *domain.Event {
	return &domain.Event{
		ID: event.ID, Slug: event.Slug, Name: event.Name, Description: event.Description, GuestURL: event.GuestURL,
		AccessTokenHash: event.AccessTokenHash, OrganizerTokenHash: event.OrganizerTokenHash,
		Mode: event.Mode, Status: event.Status, StartsAt: event.StartsAt, EndsAt: event.EndsAt,
		RevealAt: event.RevealAt, MaxGuests: event.MaxGuests, MaxPhotosPerGuest: event.MaxPhotosPerGuest,
		AllowGalleryUploads: event.AllowGalleryUploads, PreferCameraCapture: event.PreferCameraCapture,
		AllowImmediateGallery: event.AllowImmediateGallery, AutoApprovePhotos: event.AutoApprovePhotos, OfflineUploadGraceHours: event.OfflineUploadGraceHours, CreatedAt: event.CreatedAt, UpdatedAt: event.UpdatedAt,
	}
}

func (r *GuestRepo) Create(ctx context.Context, guest *domain.Guest) error {
	b, _ := json.Marshal(guest)
	pipe := r.store.client.TxPipeline()
	pipe.Set(ctx, key("guest", guest.ID), b, 0)
	pipe.Set(ctx, key("guest_lookup", guest.EventID, guest.DeviceTokenHash), guest.ID, 0)
	pipe.SAdd(ctx, key("event_guests", guest.EventID), guest.ID)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *GuestRepo) GetByID(ctx context.Context, id string) (*domain.Guest, error) {
	var guest domain.Guest
	if err := getJSON(ctx, r.store.client, key("guest", id), &guest); err != nil {
		return nil, err
	}
	return &guest, nil
}

func (r *GuestRepo) FindByEventAndDeviceToken(ctx context.Context, eventID string, deviceTokenHash string) (*domain.Guest, error) {
	id, err := r.store.client.Get(ctx, key("guest_lookup", eventID, deviceTokenHash)).Result()
	if errors.Is(err, goredis.Nil) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, id)
}

func (r *GuestRepo) FindOrCreateByEventAndDeviceToken(ctx context.Context, guest *domain.Guest, maxGuests int) (*domain.Guest, error) {
	lookupKey := key("guest_lookup", guest.EventID, guest.DeviceTokenHash)
	guestsKey := key("event_guests", guest.EventID)
	var out *domain.Guest
	err := r.store.client.Watch(ctx, func(tx *goredis.Tx) error {
		if id, err := tx.Get(ctx, lookupKey).Result(); err == nil {
			existing, err := r.getByIDWithClient(ctx, tx, id)
			if err != nil {
				return err
			}
			existing.LastSeenAt = time.Now().UTC()
			if guest.DisplayName != "" {
				existing.DisplayName = guest.DisplayName
			}
			b, _ := json.Marshal(existing)
			_, err = tx.TxPipelined(ctx, func(pipe goredis.Pipeliner) error {
				pipe.Set(ctx, key("guest", existing.ID), b, 0)
				return nil
			})
			out = existing
			return err
		} else if !errors.Is(err, goredis.Nil) {
			return err
		}

		count, err := tx.SCard(ctx, guestsKey).Result()
		if err != nil {
			return err
		}
		if int(count) >= maxGuests {
			return domain.ErrGuestLimit
		}
		b, _ := json.Marshal(guest)
		_, err = tx.TxPipelined(ctx, func(pipe goredis.Pipeliner) error {
			pipe.Set(ctx, key("guest", guest.ID), b, 0)
			pipe.Set(ctx, lookupKey, guest.ID, 0)
			pipe.SAdd(ctx, guestsKey, guest.ID)
			return nil
		})
		out = guest
		return err
	}, lookupKey, guestsKey)
	if errors.Is(err, goredis.TxFailedErr) {
		return r.FindOrCreateByEventAndDeviceToken(ctx, guest, maxGuests)
	}
	return out, err
}

func (r *GuestRepo) CountByEvent(ctx context.Context, eventID string) (int, error) {
	count, err := r.store.client.SCard(ctx, key("event_guests", eventID)).Result()
	return int(count), err
}

func (r *GuestRepo) ListByEvent(ctx context.Context, eventID string) ([]domain.Guest, error) {
	ids, err := r.store.client.SMembers(ctx, key("event_guests", eventID)).Result()
	if err != nil {
		return nil, err
	}
	guests := make([]domain.Guest, 0, len(ids))
	for _, id := range ids {
		guest, err := r.GetByID(ctx, id)
		if errors.Is(err, domain.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		guests = append(guests, *guest)
	}
	return guests, nil
}

func (r *GuestRepo) IncrementUploadCount(ctx context.Context, guestID string, limit int) (int, error) {
	var count int
	err := r.store.client.Watch(ctx, func(tx *goredis.Tx) error {
		guest, err := r.getByIDWithClient(ctx, tx, guestID)
		if err != nil {
			return err
		}
		if guest.UploadCount >= limit {
			return domain.ErrUploadLimit
		}
		guest.UploadCount++
		guest.LastSeenAt = time.Now().UTC()
		b, _ := json.Marshal(guest)
		_, err = tx.TxPipelined(ctx, func(pipe goredis.Pipeliner) error {
			pipe.Set(ctx, key("guest", guest.ID), b, 0)
			return nil
		})
		count = guest.UploadCount
		return err
	}, key("guest", guestID))
	if errors.Is(err, goredis.TxFailedErr) {
		return r.IncrementUploadCount(ctx, guestID, limit)
	}
	return count, err
}

func (r *GuestRepo) Update(ctx context.Context, guest *domain.Guest) error {
	b, _ := json.Marshal(guest)
	return r.store.client.Set(ctx, key("guest", guest.ID), b, 0).Err()
}

func (r *GuestRepo) getByIDWithClient(ctx context.Context, client goredis.Cmdable, id string) (*domain.Guest, error) {
	var guest domain.Guest
	if err := getJSON(ctx, client, key("guest", id), &guest); err != nil {
		return nil, err
	}
	return &guest, nil
}

func (r *PhotoRepo) Create(ctx context.Context, photo *domain.Photo) error {
	b, _ := json.Marshal(photo)
	pipe := r.store.client.TxPipeline()
	pipe.Set(ctx, key("photo", photo.ID), b, 0)
	pipe.SAdd(ctx, key("event_photos", photo.EventID), photo.ID)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *PhotoRepo) GetByID(ctx context.Context, id string) (*domain.Photo, error) {
	var photo domain.Photo
	if err := getJSON(ctx, r.store.client, key("photo", id), &photo); err != nil {
		return nil, err
	}
	return &photo, nil
}

func (r *PhotoRepo) ListByEvent(ctx context.Context, eventID string, filter domain.PhotoFilter) ([]domain.Photo, error) {
	ids, err := r.store.client.SMembers(ctx, key("event_photos", eventID)).Result()
	if err != nil {
		return nil, err
	}
	allowed := map[domain.PhotoStatus]bool{}
	for _, status := range filter.Statuses {
		allowed[status] = true
	}
	photos := make([]domain.Photo, 0, len(ids))
	for _, id := range ids {
		photo, err := r.GetByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if photo.Status == domain.PhotoDeleted && !filter.IncludeDeleted {
			continue
		}
		if len(allowed) == 0 || allowed[photo.Status] {
			photos = append(photos, *photo)
		}
	}
	return photos, nil
}

func (r *PhotoRepo) UpdateStatus(ctx context.Context, photoID string, status domain.PhotoStatus) error {
	photo, err := r.GetByID(ctx, photoID)
	if err != nil {
		return err
	}
	photo.Status = status
	photo.UpdatedAt = time.Now().UTC()
	b, _ := json.Marshal(photo)
	return r.store.client.Set(ctx, key("photo", photo.ID), b, 0).Err()
}

func (r *IdempotencyRepo) Reserve(ctx context.Context, scope, id string, ttl time.Duration) (bool, error) {
	return r.store.client.SetNX(ctx, key("idempotency", scope, id), "1", ttl).Result()
}

func (r *UploadIntentRepo) Create(ctx context.Context, intent *domain.UploadIntent, ttl time.Duration) error {
	b, _ := json.Marshal(intent)
	return r.store.client.Set(ctx, key("upload_intent", intent.PhotoID), b, ttl).Err()
}

func (r *UploadIntentRepo) GetByPhotoID(ctx context.Context, photoID string) (*domain.UploadIntent, error) {
	var intent domain.UploadIntent
	if err := getJSON(ctx, r.store.client, key("upload_intent", photoID), &intent); err != nil {
		return nil, err
	}
	return &intent, nil
}

func (r *UploadIntentRepo) MarkUsed(ctx context.Context, photoID string, tokenHash string) (*domain.UploadIntent, error) {
	intentKey := key("upload_intent", photoID)
	var out *domain.UploadIntent
	err := r.store.client.Watch(ctx, func(tx *goredis.Tx) error {
		var intent domain.UploadIntent
		if err := getJSON(ctx, tx, intentKey, &intent); err != nil {
			return err
		}
		if intent.Used || intent.TokenHash != tokenHash || time.Now().UTC().After(intent.ExpiresAt) {
			return domain.ErrForbidden
		}
		intent.Used = true
		b, _ := json.Marshal(intent)
		ttl := time.Until(intent.ExpiresAt)
		if ttl <= 0 {
			return domain.ErrForbidden
		}
		_, err := tx.TxPipelined(ctx, func(pipe goredis.Pipeliner) error {
			pipe.Set(ctx, intentKey, b, ttl)
			return nil
		})
		out = &intent
		return err
	}, intentKey)
	if errors.Is(err, goredis.TxFailedErr) {
		return r.MarkUsed(ctx, photoID, tokenHash)
	}
	return out, err
}

func (r *AdminSessionRepo) Create(ctx context.Context, session *domain.AdminSession, ttl time.Duration) error {
	b, _ := json.Marshal(session)
	return r.store.client.Set(ctx, key("admin_session", session.ID), b, ttl).Err()
}

func (r *AdminSessionRepo) Get(ctx context.Context, id string) (*domain.AdminSession, error) {
	var session domain.AdminSession
	if err := getJSON(ctx, r.store.client, key("admin_session", id), &session); err != nil {
		return nil, err
	}
	if time.Now().UTC().After(session.ExpiresAt) {
		_ = r.Delete(ctx, id)
		return nil, domain.ErrUnauthorized
	}
	return &session, nil
}

func (r *AdminSessionRepo) Delete(ctx context.Context, id string) error {
	return r.store.client.Del(ctx, key("admin_session", id)).Err()
}

func getJSON(ctx context.Context, client goredis.Cmdable, k string, v any) error {
	raw, err := client.Get(ctx, k).Bytes()
	if errors.Is(err, goredis.Nil) {
		return domain.ErrNotFound
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, v)
}

func key(parts ...string) string {
	out := "oson"
	for _, part := range parts {
		out += ":" + part
	}
	return out
}
