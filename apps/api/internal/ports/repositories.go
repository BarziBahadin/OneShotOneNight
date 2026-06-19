package ports

import (
	"context"
	"io"
	"time"

	"oneshotonenight/api/internal/domain"
)

type EventRepository interface {
	Create(ctx context.Context, event *domain.Event) error
	GetByID(ctx context.Context, id string) (*domain.Event, error)
	GetBySlug(ctx context.Context, slug string) (*domain.Event, error)
	List(ctx context.Context) ([]domain.Event, error)
	Update(ctx context.Context, event *domain.Event) error
	Delete(ctx context.Context, id string) error
}

type GuestRepository interface {
	Create(ctx context.Context, guest *domain.Guest) error
	GetByID(ctx context.Context, id string) (*domain.Guest, error)
	FindByEventAndDeviceToken(ctx context.Context, eventID string, deviceTokenHash string) (*domain.Guest, error)
	FindOrCreateByEventAndDeviceToken(ctx context.Context, guest *domain.Guest, maxGuests int) (*domain.Guest, error)
	CountByEvent(ctx context.Context, eventID string) (int, error)
	ListByEvent(ctx context.Context, eventID string) ([]domain.Guest, error)
	IncrementUploadCount(ctx context.Context, guestID string, limit int) (int, error)
	Update(ctx context.Context, guest *domain.Guest) error
}

type PhotoRepository interface {
	Create(ctx context.Context, photo *domain.Photo) error
	GetByID(ctx context.Context, id string) (*domain.Photo, error)
	ListByEvent(ctx context.Context, eventID string, filter domain.PhotoFilter) ([]domain.Photo, error)
	UpdateStatus(ctx context.Context, photoID string, status domain.PhotoStatus) error
}

type IdempotencyRepository interface {
	Reserve(ctx context.Context, scope, key string, ttl time.Duration) (bool, error)
}

type UploadIntentRepository interface {
	Create(ctx context.Context, intent *domain.UploadIntent, ttl time.Duration) error
	GetByPhotoID(ctx context.Context, photoID string) (*domain.UploadIntent, error)
	MarkUsed(ctx context.Context, photoID string, tokenHash string) (*domain.UploadIntent, error)
}

type AdminSessionRepository interface {
	Create(ctx context.Context, session *domain.AdminSession, ttl time.Duration) error
	Get(ctx context.Context, id string) (*domain.AdminSession, error)
	Delete(ctx context.Context, id string) error
}

type ObjectInfo struct {
	ContentType string
	SizeBytes   int64
}

type ObjectStorage interface {
	PresignPut(ctx context.Context, objectKey, contentType string, expires time.Duration) (string, error)
	Head(ctx context.Context, objectKey string) (*ObjectInfo, error)
	Open(ctx context.Context, objectKey string) (io.ReadCloser, error)
	PublicURL(ctx context.Context, objectKey string) (string, error)
}
