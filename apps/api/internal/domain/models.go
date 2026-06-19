package domain

import "time"

type EventMode string

const (
	ModeStandardUpload   EventMode = "standard_upload"
	ModeDisposableCamera EventMode = "disposable_camera"
	ModeLiveGallery      EventMode = "live_gallery"
	ModeDelayedReveal    EventMode = "delayed_reveal"
)

type EventStatus string

const (
	EventOpen    EventStatus = "open"
	EventLocked  EventStatus = "locked"
	EventDeleted EventStatus = "deleted"
)

type PhotoStatus string

const (
	PhotoPending  PhotoStatus = "pending"
	PhotoApproved PhotoStatus = "approved"
	PhotoHidden   PhotoStatus = "hidden"
	PhotoDeleted  PhotoStatus = "deleted"
)

type GuestStatus string

const (
	GuestActive  GuestStatus = "active"
	GuestBlocked GuestStatus = "blocked"
)

type Event struct {
	ID                    string      `json:"id"`
	Slug                  string      `json:"slug"`
	Name                  string      `json:"name"`
	Description           string      `json:"description"`
	GuestURL              string      `json:"-"`
	AccessTokenHash       string      `json:"-"`
	OrganizerTokenHash    string      `json:"-"`
	Mode                  EventMode   `json:"mode"`
	Status                EventStatus `json:"status"`
	StartsAt              time.Time   `json:"starts_at"`
	EndsAt                time.Time   `json:"ends_at"`
	RevealAt              time.Time   `json:"reveal_at"`
	MaxGuests             int         `json:"max_guests"`
	MaxPhotosPerGuest     int         `json:"max_photos_per_guest"`
	AllowGalleryUploads   bool        `json:"allow_gallery_uploads"`
	PreferCameraCapture   bool        `json:"prefer_camera_capture"`
	AllowImmediateGallery bool        `json:"allow_immediate_gallery"`
	AutoApprovePhotos     bool        `json:"auto_approve_photos"`
	CreatedAt             time.Time   `json:"created_at"`
	UpdatedAt             time.Time   `json:"updated_at"`
}

type Guest struct {
	ID              string      `json:"id"`
	EventID         string      `json:"event_id"`
	DeviceTokenHash string      `json:"-"`
	DisplayName     string      `json:"display_name,omitempty"`
	UploadCount     int         `json:"upload_count"`
	MessageCount    int         `json:"message_count"`
	CreatedAt       time.Time   `json:"created_at"`
	LastSeenAt      time.Time   `json:"last_seen_at"`
	Status          GuestStatus `json:"status"`
}

type Photo struct {
	ID          string      `json:"id"`
	EventID     string      `json:"event_id"`
	GuestID     string      `json:"guest_id"`
	ObjectKey   string      `json:"object_key"`
	PublicURL   string      `json:"public_url,omitempty"`
	ContentType string      `json:"content_type"`
	SizeBytes   int64       `json:"size_bytes"`
	Message     string      `json:"message,omitempty"`
	Status      PhotoStatus `json:"status"`
	IsDeveloped bool        `json:"is_developed"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

type PhotoFilter struct {
	Statuses       []PhotoStatus
	IncludeDeleted bool
}

type UploadIntent struct {
	PhotoID     string    `json:"photo_id"`
	EventID     string    `json:"event_id"`
	GuestID     string    `json:"guest_id"`
	ObjectKey   string    `json:"object_key"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	TokenHash   string    `json:"token_hash"`
	ExpiresAt   time.Time `json:"expires_at"`
	Used        bool      `json:"used"`
}

type AdminSession struct {
	ID        string    `json:"id"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}
