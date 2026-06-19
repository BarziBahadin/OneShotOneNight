package application

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"oneshotonenight/api/internal/domain"
	"oneshotonenight/api/internal/ports"
)

func TestCreateEventDefaultsToAutoApproval(t *testing.T) {
	repos := newTestRepos()
	service := newTestService(repos)

	out, err := service.CreateEvent(context.Background(), CreateEventInput{Name: "Night"})
	if err != nil {
		t.Fatal(err)
	}
	if !out.Event.AutoApprovePhotos {
		t.Fatal("new events should auto-approve photos by default")
	}
	if !out.Event.AllowGalleryUploads || !out.Event.PreferCameraCapture {
		t.Fatal("new events should default to gallery uploads and camera-first capture")
	}
}

func TestJoinGuestEnforcesScheduleAndPause(t *testing.T) {
	now := time.Now().UTC()
	tests := []struct {
		name   string
		start  time.Time
		end    time.Time
		status domain.EventStatus
		want   error
	}{
		{"not started", now.Add(time.Hour), now.Add(2 * time.Hour), domain.EventOpen, domain.ErrEventNotStarted},
		{"ended", now.Add(-2 * time.Hour), now.Add(-time.Hour), domain.EventOpen, domain.ErrEventEnded},
		{"paused", now.Add(-time.Hour), now.Add(time.Hour), domain.EventLocked, domain.ErrEventPaused},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repos := newTestRepos()
			service := newTestService(repos)
			event := testEvent(tt.start, tt.end)
			event.Status = tt.status
			event.AccessTokenHash = service.HashToken("guest-token")
			repos.events.items[event.ID] = event

			_, _, err := service.JoinGuest(context.Background(), event.Slug, "guest-token", "", "")
			if !errors.Is(err, tt.want) {
				t.Fatalf("got %v, want %v", err, tt.want)
			}
		})
	}
}

func TestRegisterPhotoUsesAutoApprovalSetting(t *testing.T) {
	for _, tt := range []struct {
		name        string
		autoApprove bool
		want        domain.PhotoStatus
	}{
		{"new automatic event", true, domain.PhotoApproved},
		{"legacy manual event", false, domain.PhotoPending},
	} {
		t.Run(tt.name, func(t *testing.T) {
			repos := newTestRepos()
			service := newTestService(repos)
			event := testEvent(time.Now().Add(-time.Hour), time.Now().Add(time.Hour))
			event.AutoApprovePhotos = tt.autoApprove
			event.AccessTokenHash = service.HashToken("guest-token")
			repos.events.items[event.ID] = event

			joined, rawDeviceToken, err := service.JoinGuest(context.Background(), event.Slug, "guest-token", "", "")
			if err != nil {
				t.Fatal(err)
			}
			repos.uploads.items["photo-1"] = &domain.UploadIntent{
				PhotoID: "photo-1", EventID: event.ID, GuestID: joined.Guest.ID,
				ObjectKey: "photo.jpg", ContentType: "image/jpeg", SizeBytes: 10,
				TokenHash: service.HashToken("upload-token"), ExpiresAt: time.Now().Add(time.Hour),
			}

			photo, _, err := service.RegisterPhoto(context.Background(), RegisterPhotoInput{
				PhotoID: "photo-1", EventSlug: event.Slug, AccessToken: "guest-token",
				DeviceToken: rawDeviceToken, ObjectKey: "photo.jpg", ContentType: "image/jpeg",
				SizeBytes: 10, UploadToken: "upload-token",
			})
			if err != nil {
				t.Fatal(err)
			}
			if photo.Status != tt.want {
				t.Fatalf("got %s, want %s", photo.Status, tt.want)
			}
		})
	}
}

func TestGalleryRevealIsIndependentFromApproval(t *testing.T) {
	repos := newTestRepos()
	service := newTestService(repos)
	event := testEvent(time.Now().Add(-time.Hour), time.Now().Add(time.Hour))
	event.AccessTokenHash = service.HashToken("guest-token")
	event.AutoApprovePhotos = true
	event.AllowImmediateGallery = true
	event.RevealAt = time.Now().Add(time.Hour)
	repos.events.items[event.ID] = event
	repos.photos.items["photo-1"] = &domain.Photo{ID: "photo-1", EventID: event.ID, Status: domain.PhotoApproved}

	_, _, err := service.Gallery(context.Background(), event.Slug, "guest-token", false)
	if !errors.Is(err, domain.ErrRevealNotReached) {
		t.Fatalf("got %v, want %v", err, domain.ErrRevealNotReached)
	}

	event.RevealAt = time.Now().Add(-time.Minute)
	_, photos, err := service.Gallery(context.Background(), event.Slug, "guest-token", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(photos) != 1 {
		t.Fatalf("got %d photos, want 1", len(photos))
	}
}

type testRepos struct {
	events  *memoryEvents
	guests  *memoryGuests
	photos  *memoryPhotos
	uploads *memoryUploads
	storage *memoryStorage
}

func newTestRepos() *testRepos {
	return &testRepos{
		events:  &memoryEvents{items: map[string]*domain.Event{}},
		guests:  &memoryGuests{items: map[string]*domain.Guest{}},
		photos:  &memoryPhotos{items: map[string]*domain.Photo{}},
		uploads: &memoryUploads{items: map[string]*domain.UploadIntent{}},
		storage: &memoryStorage{},
	}
}

func newTestService(repos *testRepos) *Service {
	return NewService(NewServiceInput{
		Events: repos.events, Guests: repos.guests, Photos: repos.photos,
		Idempotency: memoryIdempotency{}, Uploads: repos.uploads, Storage: repos.storage,
		Pepper: "test-pepper", WebURL: "http://example.test", MaxBytes: 1024,
	})
}

func testEvent(start, end time.Time) *domain.Event {
	return &domain.Event{
		ID: "event-1", Slug: "night", Name: "Night", Status: domain.EventOpen,
		StartsAt: start, EndsAt: end, RevealAt: end, MaxGuests: 250, MaxPhotosPerGuest: 12,
	}
}

type memoryEvents struct{ items map[string]*domain.Event }

func (m *memoryEvents) Create(_ context.Context, event *domain.Event) error {
	m.items[event.ID] = event
	return nil
}
func (m *memoryEvents) GetByID(_ context.Context, id string) (*domain.Event, error) {
	event, ok := m.items[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return event, nil
}
func (m *memoryEvents) GetBySlug(_ context.Context, slug string) (*domain.Event, error) {
	for _, event := range m.items {
		if event.Slug == slug {
			return event, nil
		}
	}
	return nil, domain.ErrNotFound
}
func (m *memoryEvents) List(context.Context) ([]domain.Event, error) {
	out := make([]domain.Event, 0, len(m.items))
	for _, event := range m.items {
		out = append(out, *event)
	}
	return out, nil
}
func (m *memoryEvents) Update(_ context.Context, event *domain.Event) error {
	m.items[event.ID] = event
	return nil
}
func (m *memoryEvents) Delete(_ context.Context, id string) error { delete(m.items, id); return nil }

type memoryGuests struct{ items map[string]*domain.Guest }

func (m *memoryGuests) Create(_ context.Context, guest *domain.Guest) error {
	m.items[guest.ID] = guest
	return nil
}
func (m *memoryGuests) GetByID(_ context.Context, id string) (*domain.Guest, error) {
	guest, ok := m.items[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return guest, nil
}
func (m *memoryGuests) FindByEventAndDeviceToken(_ context.Context, eventID, hash string) (*domain.Guest, error) {
	for _, guest := range m.items {
		if guest.EventID == eventID && guest.DeviceTokenHash == hash {
			return guest, nil
		}
	}
	return nil, domain.ErrNotFound
}
func (m *memoryGuests) CountByEvent(_ context.Context, eventID string) (int, error) {
	count := 0
	for _, guest := range m.items {
		if guest.EventID == eventID {
			count++
		}
	}
	return count, nil
}
func (m *memoryGuests) ListByEvent(_ context.Context, eventID string) ([]domain.Guest, error) {
	var out []domain.Guest
	for _, guest := range m.items {
		if guest.EventID == eventID {
			out = append(out, *guest)
		}
	}
	return out, nil
}
func (m *memoryGuests) IncrementUploadCount(_ context.Context, id string, limit int) (int, error) {
	guest, ok := m.items[id]
	if !ok {
		return 0, domain.ErrNotFound
	}
	if guest.UploadCount >= limit {
		return 0, domain.ErrUploadLimit
	}
	guest.UploadCount++
	return guest.UploadCount, nil
}
func (m *memoryGuests) Update(_ context.Context, guest *domain.Guest) error {
	m.items[guest.ID] = guest
	return nil
}

type memoryPhotos struct{ items map[string]*domain.Photo }

func (m *memoryPhotos) Create(_ context.Context, photo *domain.Photo) error {
	m.items[photo.ID] = photo
	return nil
}
func (m *memoryPhotos) GetByID(_ context.Context, id string) (*domain.Photo, error) {
	photo, ok := m.items[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return photo, nil
}
func (m *memoryPhotos) ListByEvent(_ context.Context, eventID string, filter domain.PhotoFilter) ([]domain.Photo, error) {
	allowed := map[domain.PhotoStatus]bool{}
	for _, status := range filter.Statuses {
		allowed[status] = true
	}
	var out []domain.Photo
	for _, photo := range m.items {
		if photo.EventID == eventID && (len(allowed) == 0 || allowed[photo.Status]) {
			out = append(out, *photo)
		}
	}
	return out, nil
}
func (m *memoryPhotos) UpdateStatus(_ context.Context, id string, status domain.PhotoStatus) error {
	m.items[id].Status = status
	return nil
}

type memoryUploads struct {
	items map[string]*domain.UploadIntent
}

func (m *memoryUploads) Create(_ context.Context, intent *domain.UploadIntent, _ time.Duration) error {
	m.items[intent.PhotoID] = intent
	return nil
}
func (m *memoryUploads) GetByPhotoID(_ context.Context, id string) (*domain.UploadIntent, error) {
	intent, ok := m.items[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return intent, nil
}
func (m *memoryUploads) MarkUsed(_ context.Context, id string) error {
	m.items[id].Used = true
	return nil
}

type memoryStorage struct{}

func (memoryStorage) PresignPut(context.Context, string, string, time.Duration) (string, error) {
	return "http://upload.test", nil
}
func (memoryStorage) Head(context.Context, string) (*ports.ObjectInfo, error) {
	return &ports.ObjectInfo{ContentType: "image/jpeg", SizeBytes: 10}, nil
}
func (memoryStorage) Open(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader([]byte("photo-data"))), nil
}
func (memoryStorage) PublicURL(context.Context, string) (string, error) {
	return "http://image.test/photo.jpg", nil
}

type memoryIdempotency struct{}

func (memoryIdempotency) Reserve(context.Context, string, string, time.Duration) (bool, error) {
	return true, nil
}
