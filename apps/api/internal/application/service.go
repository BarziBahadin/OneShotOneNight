package application

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"golang.org/x/crypto/bcrypt"

	"oneshotonenight/api/internal/domain"
	"oneshotonenight/api/internal/ports"
)

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

const (
	maxArchivePhotos = 1000
	maxArchiveBytes  = int64(2 << 30)
)

type Service struct {
	events             ports.EventRepository
	guests             ports.GuestRepository
	photos             ports.PhotoRepository
	idempotency        ports.IdempotencyRepository
	uploads            ports.UploadIntentRepository
	adminSessions      ports.AdminSessionRepository
	storage            ports.ObjectStorage
	pepper             string
	webURL             string
	guestURLBase       string
	maxBytes           int64
	disableGuestTokens bool
	adminPassword      string
	adminPasswordHash  string
	adminSessionTTL    time.Duration
}

type NewServiceInput struct {
	Events             ports.EventRepository
	Guests             ports.GuestRepository
	Photos             ports.PhotoRepository
	Idempotency        ports.IdempotencyRepository
	Uploads            ports.UploadIntentRepository
	AdminSessions      ports.AdminSessionRepository
	Storage            ports.ObjectStorage
	Pepper             string
	WebURL             string
	GuestURLBase       string
	MaxBytes           int64
	DisableGuestTokens bool
	AdminPassword      string
	AdminPasswordHash  string
	AdminSessionTTL    time.Duration
}

func NewService(in NewServiceInput) *Service {
	return &Service{
		events: in.Events, guests: in.Guests, photos: in.Photos, idempotency: in.Idempotency, uploads: in.Uploads,
		adminSessions: in.AdminSessions, storage: in.Storage, pepper: in.Pepper, webURL: strings.TrimRight(in.WebURL, "/"), maxBytes: in.MaxBytes,
		disableGuestTokens: in.DisableGuestTokens,
		adminPassword:      in.AdminPassword, adminPasswordHash: in.AdminPasswordHash, adminSessionTTL: in.AdminSessionTTL,
		guestURLBase: strings.TrimRight(firstNonEmpty(in.GuestURLBase, in.WebURL), "/"),
	}
}

type AdminOverview struct {
	Events         int   `json:"events"`
	OpenEvents     int   `json:"open_events"`
	UpcomingEvents int   `json:"upcoming_events"`
	Guests         int   `json:"guests"`
	Photos         int   `json:"photos"`
	PendingPhotos  int   `json:"pending_photos"`
	StorageBytes   int64 `json:"storage_bytes"`
}

type AdminEventSummary struct {
	Event         domain.Event `json:"event"`
	GuestCount    int          `json:"guest_count"`
	PhotoCount    int          `json:"photo_count"`
	PendingPhotos int          `json:"pending_photos"`
	StorageBytes  int64        `json:"storage_bytes"`
}

type AdminEventDetail struct {
	Event    *domain.Event  `json:"event"`
	GuestURL string         `json:"guest_url"`
	Guests   []domain.Guest `json:"guests"`
	Photos   []domain.Photo `json:"photos"`
	Stats    AdminOverview  `json:"stats"`
}

type UpdateEventInput struct {
	Name                    *string             `json:"name"`
	Description             *string             `json:"description"`
	Mode                    *domain.EventMode   `json:"mode"`
	Status                  *domain.EventStatus `json:"status"`
	StartsAt                *time.Time          `json:"starts_at"`
	EndsAt                  *time.Time          `json:"ends_at"`
	RevealAt                *time.Time          `json:"reveal_at"`
	MaxGuests               *int                `json:"max_guests"`
	MaxPhotosPerGuest       *int                `json:"max_photos_per_guest"`
	AllowGalleryUploads     *bool               `json:"allow_gallery_uploads"`
	PreferCameraCapture     *bool               `json:"prefer_camera_capture"`
	AllowImmediateGallery   *bool               `json:"allow_immediate_gallery"`
	AutoApprovePhotos       *bool               `json:"auto_approve_photos"`
	OfflineUploadGraceHours *int                `json:"offline_upload_grace_hours"`
}

type CreateEventInput struct {
	Name                    string           `json:"name"`
	Description             string           `json:"description"`
	Mode                    domain.EventMode `json:"mode"`
	StartsAt                time.Time        `json:"starts_at"`
	EndsAt                  time.Time        `json:"ends_at"`
	RevealAt                time.Time        `json:"reveal_at"`
	MaxGuests               int              `json:"max_guests"`
	MaxPhotosPerGuest       int              `json:"max_photos_per_guest"`
	AllowGalleryUploads     *bool            `json:"allow_gallery_uploads"`
	PreferCameraCapture     *bool            `json:"prefer_camera_capture"`
	AllowImmediateGallery   bool             `json:"allow_immediate_gallery"`
	AutoApprovePhotos       *bool            `json:"auto_approve_photos"`
	OfflineUploadGraceHours int              `json:"offline_upload_grace_hours"`
}

type CreateEventOutput struct {
	Event       *domain.Event `json:"event"`
	GuestURL    string        `json:"guest_url"`
	AccessToken string        `json:"access_token"`
}

type RotateEventTokensOutput struct {
	Event       *domain.Event `json:"event"`
	GuestURL    string        `json:"guest_url"`
	AccessToken string        `json:"access_token"`
}

func (s *Service) CreateEvent(ctx context.Context, in CreateEventInput) (*CreateEventOutput, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, fmt.Errorf("%w: event name is required", domain.ErrValidation)
	}
	if in.MaxPhotosPerGuest <= 0 {
		in.MaxPhotosPerGuest = 12
	}
	if in.MaxGuests <= 0 {
		in.MaxGuests = 250
	}
	if in.Mode == "" {
		in.Mode = domain.ModeDelayedReveal
	}
	if in.OfflineUploadGraceHours <= 0 {
		in.OfflineUploadGraceHours = 24
	}
	now := time.Now().UTC()
	if in.StartsAt.IsZero() {
		in.StartsAt = now
	}
	if in.EndsAt.IsZero() {
		in.EndsAt = in.StartsAt.Add(12 * time.Hour)
	}
	if in.RevealAt.IsZero() {
		in.RevealAt = in.EndsAt
	}
	if !in.EndsAt.After(in.StartsAt) {
		return nil, fmt.Errorf("%w: event end must be after its start", domain.ErrValidation)
	}
	if in.RevealAt.Before(in.StartsAt) {
		return nil, fmt.Errorf("%w: reveal time cannot be before the event starts", domain.ErrValidation)
	}
	autoApprove := true
	if in.AutoApprovePhotos != nil {
		autoApprove = *in.AutoApprovePhotos
	}
	allowGalleryUploads := true
	if in.AllowGalleryUploads != nil {
		allowGalleryUploads = *in.AllowGalleryUploads
	}
	preferCameraCapture := true
	if in.PreferCameraCapture != nil {
		preferCameraCapture = *in.PreferCameraCapture
	}
	accessToken, err := randomToken()
	if err != nil {
		return nil, err
	}
	id := ulid.Make().String()
	slug := slugify(in.Name) + "-" + strings.ToLower(id[len(id)-6:])
	guestURL := fmt.Sprintf("%s/guest/%s?t=%s", s.guestURLBase, slug, accessToken)
	event := &domain.Event{
		ID: id, Slug: slug, Name: strings.TrimSpace(in.Name),
		GuestURL:    guestURL,
		Description: strings.TrimSpace(in.Description), AccessTokenHash: s.HashToken(accessToken),
		OrganizerTokenHash: "", Mode: in.Mode, Status: domain.EventOpen,
		StartsAt: in.StartsAt.UTC(), EndsAt: in.EndsAt.UTC(), RevealAt: in.RevealAt.UTC(),
		MaxGuests: in.MaxGuests, MaxPhotosPerGuest: in.MaxPhotosPerGuest,
		AllowGalleryUploads: allowGalleryUploads, PreferCameraCapture: preferCameraCapture,
		AllowImmediateGallery: in.AllowImmediateGallery, AutoApprovePhotos: autoApprove, OfflineUploadGraceHours: in.OfflineUploadGraceHours, CreatedAt: now, UpdatedAt: now,
	}
	if err := s.events.Create(ctx, event); err != nil {
		return nil, err
	}
	return &CreateEventOutput{
		Event: event, AccessToken: accessToken,
		GuestURL: event.GuestURL,
	}, nil
}

func (s *Service) AdminLogin(ctx context.Context, password string) (string, time.Time, error) {
	if strings.TrimSpace(password) == "" {
		return "", time.Time{}, domain.ErrUnauthorized
	}
	if !s.adminPasswordMatches(password) {
		return "", time.Time{}, domain.ErrUnauthorized
	}
	if s.adminSessionTTL <= 0 {
		s.adminSessionTTL = 12 * time.Hour
	}
	raw, err := randomToken()
	if err != nil {
		return "", time.Time{}, err
	}
	now := time.Now().UTC()
	session := &domain.AdminSession{ID: s.HashToken(raw), CreatedAt: now, ExpiresAt: now.Add(s.adminSessionTTL)}
	if err := s.adminSessions.Create(ctx, session, s.adminSessionTTL); err != nil {
		return "", time.Time{}, err
	}
	return raw, session.ExpiresAt, nil
}

func (s *Service) adminPasswordMatches(password string) bool {
	expected := s.adminPasswordHash
	if expected != "" && strings.HasPrefix(expected, "$2") {
		return bcrypt.CompareHashAndPassword([]byte(expected), []byte(password)) == nil
	}
	if expected == "" && s.adminPassword != "" {
		expected = s.HashToken(s.adminPassword)
	}
	if expected == "" {
		return false
	}
	return hmac.Equal([]byte(s.HashToken(password)), []byte(expected))
}

func (s *Service) AdminSession(ctx context.Context, raw string) (*domain.AdminSession, error) {
	if raw == "" {
		return nil, domain.ErrUnauthorized
	}
	return s.adminSessions.Get(ctx, s.HashToken(raw))
}

func (s *Service) AdminLogout(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	return s.adminSessions.Delete(ctx, s.HashToken(raw))
}

func (s *Service) AdminOverview(ctx context.Context) (*AdminOverview, error) {
	events, err := s.events.List(ctx)
	if err != nil {
		return nil, err
	}
	overview := &AdminOverview{Events: len(events)}
	for _, event := range events {
		if event.Status == domain.EventDeleted {
			continue
		}
		if event.Status == domain.EventOpen {
			overview.OpenEvents++
		}
		if time.Now().UTC().Before(event.StartsAt) {
			overview.UpcomingEvents++
		}
		guests, err := s.guests.ListByEvent(ctx, event.ID)
		if err != nil {
			return nil, err
		}
		photos, err := s.photos.ListByEvent(ctx, event.ID, domain.PhotoFilter{IncludeDeleted: true})
		if err != nil {
			return nil, err
		}
		overview.Guests += len(guests)
		overview.Photos += len(photos)
		for _, photo := range photos {
			if photo.Status == domain.PhotoPending {
				overview.PendingPhotos++
			}
			if photo.Status != domain.PhotoDeleted {
				overview.StorageBytes += photo.SizeBytes
			}
		}
	}
	return overview, nil
}

func (s *Service) AdminEvents(ctx context.Context, query, status string) ([]AdminEventSummary, error) {
	events, err := s.events.List(ctx)
	if err != nil {
		return nil, err
	}
	query = strings.ToLower(strings.TrimSpace(query))
	out := make([]AdminEventSummary, 0, len(events))
	for _, event := range events {
		if query != "" && !strings.Contains(strings.ToLower(event.Name+" "+event.Slug), query) {
			continue
		}
		if status == "upcoming" {
			if !time.Now().UTC().Before(event.StartsAt) || event.Status == domain.EventDeleted {
				continue
			}
		} else if status != "" && string(event.Status) != status {
			continue
		}
		guests, err := s.guests.ListByEvent(ctx, event.ID)
		if err != nil {
			return nil, err
		}
		photos, err := s.photos.ListByEvent(ctx, event.ID, domain.PhotoFilter{IncludeDeleted: true})
		if err != nil {
			return nil, err
		}
		summary := AdminEventSummary{Event: event, GuestCount: len(guests), PhotoCount: len(photos)}
		for _, photo := range photos {
			if photo.Status == domain.PhotoPending {
				summary.PendingPhotos++
			}
			if photo.Status != domain.PhotoDeleted {
				summary.StorageBytes += photo.SizeBytes
			}
		}
		out = append(out, summary)
	}
	return out, nil
}

func (s *Service) AdminEvent(ctx context.Context, eventID string) (*AdminEventDetail, error) {
	event, err := s.events.GetByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	guests, err := s.guests.ListByEvent(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	photos, err := s.photos.ListByEvent(ctx, event.ID, domain.PhotoFilter{IncludeDeleted: true})
	if err != nil {
		return nil, err
	}
	photos, err = s.preparePhotoResponses(ctx, event, photos, true)
	if err != nil {
		return nil, err
	}
	stats := AdminOverview{Events: 1, Guests: len(guests), Photos: len(photos)}
	if event.Status == domain.EventOpen {
		stats.OpenEvents = 1
	}
	if time.Now().UTC().Before(event.StartsAt) {
		stats.UpcomingEvents = 1
	}
	for _, photo := range photos {
		if photo.Status == domain.PhotoPending {
			stats.PendingPhotos++
		}
		if photo.Status != domain.PhotoDeleted {
			stats.StorageBytes += photo.SizeBytes
		}
	}
	eventResponse := *event
	eventResponse.GuestURL = s.publicWebURL(event.GuestURL)
	return &AdminEventDetail{Event: &eventResponse, GuestURL: eventResponse.GuestURL, Guests: guests, Photos: photos, Stats: stats}, nil
}

func (s *Service) publicWebURL(raw string) string {
	base := strings.TrimRight(s.webURL, "/")
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Path == "" {
		return raw
	}
	if parsed.Path != "" && strings.HasPrefix(parsed.Path, "/guest/") {
		base = strings.TrimRight(s.guestURLBase, "/")
	}
	out := base + parsed.EscapedPath()
	if parsed.RawQuery != "" {
		out += "?" + parsed.RawQuery
	}
	if parsed.Fragment != "" {
		out += "#" + parsed.Fragment
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func (s *Service) AdminPhotoArchive(ctx context.Context, eventID string, dst io.Writer) (int, error) {
	event, err := s.events.GetByID(ctx, eventID)
	if err != nil {
		return 0, err
	}
	photos, err := s.photos.ListByEvent(ctx, event.ID, domain.PhotoFilter{
		Statuses: []domain.PhotoStatus{domain.PhotoPending, domain.PhotoApproved, domain.PhotoHidden},
	})
	if err != nil {
		return 0, err
	}
	if len(photos) > maxArchivePhotos {
		return 0, fmt.Errorf("%w: archive contains too many photos", domain.ErrValidation)
	}
	var totalBytes int64
	for _, photo := range photos {
		if photo.SizeBytes < 0 {
			return 0, fmt.Errorf("%w: invalid photo size", domain.ErrValidation)
		}
		totalBytes += photo.SizeBytes
		if totalBytes > maxArchiveBytes {
			return 0, fmt.Errorf("%w: archive is too large", domain.ErrValidation)
		}
	}

	archive := zip.NewWriter(dst)
	for index, photo := range photos {
		reader, err := s.storage.Open(ctx, photo.ObjectKey)
		if err != nil {
			_ = archive.Close()
			return index, err
		}
		extension := path.Ext(photo.ObjectKey)
		if extension == "" {
			extension = extensionForContentType(photo.ContentType)
		}
		entry, err := archive.Create(fmt.Sprintf("photo-%04d-%s%s", index+1, photo.Status, extension))
		if err == nil {
			_, err = io.Copy(entry, reader)
		}
		closeErr := reader.Close()
		if err != nil {
			_ = archive.Close()
			return index, err
		}
		if closeErr != nil {
			_ = archive.Close()
			return index, closeErr
		}
	}
	if err := archive.Close(); err != nil {
		return len(photos), err
	}
	return len(photos), nil
}

func extensionForContentType(contentType string) string {
	switch contentType {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/heic", "image/heif":
		return ".heic"
	default:
		return ".jpg"
	}
}

func (s *Service) AdminUpdateEvent(ctx context.Context, eventID string, in UpdateEventInput) (*domain.Event, error) {
	event, err := s.events.GetByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: event name is required", domain.ErrValidation)
		}
		event.Name = name
	}
	if in.Description != nil {
		event.Description = strings.TrimSpace(*in.Description)
	}
	if in.Mode != nil {
		event.Mode = *in.Mode
	}
	if in.Status != nil {
		if *in.Status != domain.EventOpen && *in.Status != domain.EventLocked && *in.Status != domain.EventDeleted {
			return nil, domain.ErrValidation
		}
		event.Status = *in.Status
	}
	if in.StartsAt != nil {
		event.StartsAt = in.StartsAt.UTC()
	}
	if in.EndsAt != nil {
		event.EndsAt = in.EndsAt.UTC()
	}
	if in.RevealAt != nil {
		event.RevealAt = in.RevealAt.UTC()
	}
	if in.MaxGuests != nil {
		if *in.MaxGuests <= 0 {
			return nil, domain.ErrValidation
		}
		event.MaxGuests = *in.MaxGuests
	}
	if in.MaxPhotosPerGuest != nil {
		if *in.MaxPhotosPerGuest <= 0 {
			return nil, domain.ErrValidation
		}
		event.MaxPhotosPerGuest = *in.MaxPhotosPerGuest
	}
	if in.AllowGalleryUploads != nil {
		event.AllowGalleryUploads = *in.AllowGalleryUploads
	}
	if in.PreferCameraCapture != nil {
		event.PreferCameraCapture = *in.PreferCameraCapture
	}
	if in.AllowImmediateGallery != nil {
		event.AllowImmediateGallery = *in.AllowImmediateGallery
	}
	if in.AutoApprovePhotos != nil {
		event.AutoApprovePhotos = *in.AutoApprovePhotos
	}
	if in.OfflineUploadGraceHours != nil {
		if *in.OfflineUploadGraceHours <= 0 || *in.OfflineUploadGraceHours > 168 {
			return nil, domain.ErrValidation
		}
		event.OfflineUploadGraceHours = *in.OfflineUploadGraceHours
	}
	if !event.EndsAt.After(event.StartsAt) {
		return nil, fmt.Errorf("%w: event end must be after its start", domain.ErrValidation)
	}
	if event.RevealAt.Before(event.StartsAt) {
		return nil, fmt.Errorf("%w: reveal time cannot be before the event starts", domain.ErrValidation)
	}
	if err := s.events.Update(ctx, event); err != nil {
		return nil, err
	}
	return event, nil
}

func (s *Service) AdminSetEventStatus(ctx context.Context, eventID string, status domain.EventStatus) (*domain.Event, error) {
	return s.AdminUpdateEvent(ctx, eventID, UpdateEventInput{Status: &status})
}

func (s *Service) AdminRotateEventTokens(ctx context.Context, eventID string) (*RotateEventTokensOutput, error) {
	event, err := s.events.GetByID(ctx, eventID)
	if err != nil {
		return nil, err
	}
	accessToken, err := randomToken()
	if err != nil {
		return nil, err
	}
	event.AccessTokenHash = s.HashToken(accessToken)
	event.UpdatedAt = time.Now().UTC()
	if err := s.events.Update(ctx, event); err != nil {
		return nil, err
	}
	eventResponse := *event
	eventResponse.GuestURL = fmt.Sprintf("%s/guest/%s?t=%s", s.guestURLBase, event.Slug, accessToken)
	return &RotateEventTokensOutput{Event: &eventResponse, GuestURL: eventResponse.GuestURL, AccessToken: accessToken}, nil
}

func (s *Service) AdminModeratePhoto(ctx context.Context, eventID, photoID string, status domain.PhotoStatus) error {
	photo, err := s.photos.GetByID(ctx, photoID)
	if err != nil {
		return err
	}
	if photo.EventID != eventID {
		return domain.ErrForbidden
	}
	if status != domain.PhotoApproved && status != domain.PhotoHidden && status != domain.PhotoDeleted && status != domain.PhotoPending {
		return domain.ErrUnsupportedStatus
	}
	return s.photos.UpdateStatus(ctx, photoID, status)
}

func (s *Service) AdminUpdateGuestStatus(ctx context.Context, eventID, guestID string, status domain.GuestStatus) (*domain.Guest, error) {
	if status != domain.GuestActive && status != domain.GuestBlocked {
		return nil, domain.ErrValidation
	}
	guest, err := s.guests.GetByID(ctx, guestID)
	if err != nil {
		return nil, err
	}
	if guest.EventID != eventID {
		return nil, domain.ErrForbidden
	}
	guest.Status = status
	if err := s.guests.Update(ctx, guest); err != nil {
		return nil, err
	}
	return guest, nil
}

type JoinOutput struct {
	Event            *domain.Event `json:"event"`
	Guest            *domain.Guest `json:"guest"`
	RemainingShots   int           `json:"remaining_shots"`
	GalleryAvailable bool          `json:"gallery_available"`
}

func (s *Service) JoinGuest(ctx context.Context, slug, accessToken, rawDeviceToken, displayName string) (*JoinOutput, string, error) {
	return s.joinGuest(ctx, slug, accessToken, rawDeviceToken, displayName, false)
}

func (s *Service) joinGuest(ctx context.Context, slug, accessToken, rawDeviceToken, displayName string, allowOfflineGrace bool) (*JoinOutput, string, error) {
	event, err := s.events.GetBySlug(ctx, slug)
	if err != nil {
		return nil, "", err
	}
	if !s.disableGuestTokens && !s.tokenMatches(accessToken, event.AccessTokenHash) {
		return nil, "", domain.ErrUnauthorized
	}
	if event.Status != domain.EventOpen {
		return nil, "", domain.ErrEventPaused
	}
	now := time.Now().UTC()
	if now.Before(event.StartsAt) {
		return nil, "", domain.ErrEventNotStarted
	}
	if !now.Before(event.EndsAt) {
		if !allowOfflineGrace || now.After(offlineUploadDeadline(event)) {
			return nil, "", domain.ErrEventEnded
		}
	}
	if rawDeviceToken == "" {
		var err error
		rawDeviceToken, err = randomToken()
		if err != nil {
			return nil, "", err
		}
	}
	hash := s.HashToken(rawDeviceToken)
	createdAt := time.Now().UTC()
	guest := &domain.Guest{ID: ulid.Make().String(), EventID: event.ID, DeviceTokenHash: hash, DisplayName: strings.TrimSpace(displayName), Status: domain.GuestActive, CreatedAt: createdAt, LastSeenAt: createdAt}
	guest, err = s.guests.FindOrCreateByEventAndDeviceToken(ctx, guest, event.MaxGuests)
	if err != nil {
		return nil, "", err
	}
	return &JoinOutput{Event: event, Guest: guest, RemainingShots: remaining(event, guest), GalleryAvailable: galleryAvailable(event)}, rawDeviceToken, nil
}

type PresignInput struct {
	EventSlug      string `json:"-"`
	AccessToken    string `json:"access_token"`
	DeviceToken    string `json:"-"`
	FileName       string `json:"file_name"`
	ContentType    string `json:"content_type"`
	SizeBytes      int64  `json:"size_bytes"`
	IdempotencyKey string `json:"-"`
}

type PresignOutput struct {
	PhotoID        string `json:"photo_id"`
	ObjectKey      string `json:"object_key"`
	UploadURL      string `json:"upload_url"`
	UploadToken    string `json:"upload_token"`
	RemainingShots int    `json:"remaining_shots"`
}

func (s *Service) PresignUpload(ctx context.Context, in PresignInput) (*PresignOutput, error) {
	if in.SizeBytes <= 0 || in.SizeBytes > s.maxBytes {
		return nil, fmt.Errorf("%w: file is too large", domain.ErrValidation)
	}
	if !allowedImageType(in.ContentType) {
		return nil, fmt.Errorf("%w: unsupported image type", domain.ErrValidation)
	}
	if in.IdempotencyKey != "" {
		ok, err := s.idempotency.Reserve(ctx, "presign:"+in.EventSlug, in.IdempotencyKey, 15*time.Minute)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, domain.ErrDuplicateRequest
		}
	}
	joined, _, err := s.joinGuest(ctx, in.EventSlug, in.AccessToken, in.DeviceToken, "", true)
	if err != nil {
		return nil, err
	}
	if joined.Guest.Status != domain.GuestActive {
		return nil, domain.ErrForbidden
	}
	if remaining(joined.Event, joined.Guest) <= 0 {
		return nil, domain.ErrUploadLimit
	}
	photoID := ulid.Make().String()
	objectKey := fmt.Sprintf("events/%s/photos/%s/%s", joined.Event.ID, joined.Guest.ID, photoID)
	url, err := s.storage.PresignPut(ctx, objectKey, in.ContentType, 10*time.Minute)
	if err != nil {
		return nil, err
	}
	uploadToken, err := randomToken()
	if err != nil {
		return nil, err
	}
	if err := s.uploads.Create(ctx, &domain.UploadIntent{
		PhotoID: photoID, EventID: joined.Event.ID, GuestID: joined.Guest.ID, ObjectKey: objectKey,
		ContentType: in.ContentType, SizeBytes: in.SizeBytes, TokenHash: s.HashToken(uploadToken),
		ExpiresAt: time.Now().UTC().Add(15 * time.Minute),
	}, 15*time.Minute); err != nil {
		return nil, err
	}
	return &PresignOutput{PhotoID: photoID, ObjectKey: objectKey, UploadURL: url, UploadToken: uploadToken, RemainingShots: remaining(joined.Event, joined.Guest)}, nil
}

type RegisterPhotoInput struct {
	PhotoID     string `json:"photo_id"`
	EventSlug   string `json:"-"`
	AccessToken string `json:"access_token"`
	DeviceToken string `json:"-"`
	ObjectKey   string `json:"object_key"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
	Message     string `json:"message"`
	UploadToken string `json:"upload_token"`
}

func (s *Service) RegisterPhoto(ctx context.Context, in RegisterPhotoInput) (*domain.Photo, int, error) {
	joined, _, err := s.joinGuest(ctx, in.EventSlug, in.AccessToken, in.DeviceToken, "", true)
	if err != nil {
		return nil, 0, err
	}
	intent, err := s.uploads.GetByPhotoID(ctx, in.PhotoID)
	if err != nil {
		return nil, 0, err
	}
	if intent.Used || intent.EventID != joined.Event.ID || intent.GuestID != joined.Guest.ID || !s.tokenMatches(in.UploadToken, intent.TokenHash) || time.Now().UTC().After(intent.ExpiresAt) {
		return nil, 0, domain.ErrForbidden
	}
	info, err := s.storage.Head(ctx, intent.ObjectKey)
	if err != nil {
		return nil, 0, err
	}
	if info.SizeBytes != intent.SizeBytes || (info.ContentType != "" && info.ContentType != intent.ContentType) {
		return nil, 0, fmt.Errorf("%w: uploaded object does not match presigned intent", domain.ErrValidation)
	}
	if err := s.verifyUploadedImage(ctx, intent.ObjectKey, intent.ContentType); err != nil {
		return nil, 0, err
	}
	intent, err = s.uploads.MarkUsed(ctx, in.PhotoID, s.HashToken(in.UploadToken))
	if err != nil {
		return nil, 0, err
	}
	if intent.EventID != joined.Event.ID || intent.GuestID != joined.Guest.ID {
		return nil, 0, domain.ErrForbidden
	}
	count, err := s.guests.IncrementUploadCount(ctx, joined.Guest.ID, joined.Event.MaxPhotosPerGuest)
	if err != nil {
		return nil, 0, err
	}
	now := time.Now().UTC()
	status := domain.PhotoPending
	if joined.Event.AutoApprovePhotos {
		status = domain.PhotoApproved
	}
	photo := &domain.Photo{ID: intent.PhotoID, EventID: joined.Event.ID, GuestID: joined.Guest.ID, ObjectKey: intent.ObjectKey, ContentType: intent.ContentType, SizeBytes: intent.SizeBytes, Message: strings.TrimSpace(in.Message), Status: status, IsDeveloped: galleryAvailable(joined.Event), CreatedAt: now, UpdatedAt: now}
	if err := s.photos.Create(ctx, photo); err != nil {
		return nil, 0, err
	}
	return photo, joined.Event.MaxPhotosPerGuest - count, nil
}

func (s *Service) Gallery(ctx context.Context, slug, accessToken string) (*domain.Event, []domain.Photo, error) {
	event, err := s.events.GetBySlug(ctx, slug)
	if err != nil {
		return nil, nil, err
	}
	if !s.disableGuestTokens && !s.tokenMatches(accessToken, event.AccessTokenHash) {
		return nil, nil, domain.ErrUnauthorized
	}
	if !galleryAvailable(event) {
		return nil, nil, domain.ErrRevealNotReached
	}
	filter := domain.PhotoFilter{Statuses: []domain.PhotoStatus{domain.PhotoApproved}}
	photos, err := s.photos.ListByEvent(ctx, event.ID, filter)
	if err != nil {
		return nil, nil, err
	}
	photos, err = s.preparePhotoResponses(ctx, event, photos, false)
	if err != nil {
		return nil, nil, err
	}
	return event, photos, nil
}

func (s *Service) preparePhotoResponses(ctx context.Context, event *domain.Event, photos []domain.Photo, failFast bool) ([]domain.Photo, error) {
	developed := galleryAvailable(event)
	out := photos[:0]
	for i := range photos {
		photos[i].IsDeveloped = developed
		url, err := s.storage.PublicURL(ctx, photos[i].ObjectKey)
		if err != nil {
			if failFast {
				return nil, err
			}
			continue
		}
		photos[i].PublicURL = url
		out = append(out, photos[i])
	}
	return out, nil
}

func (s *Service) HashToken(token string) string {
	mac := hmac.New(sha256.New, []byte(s.pepper))
	mac.Write([]byte(token))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Service) tokenMatches(raw, expected string) bool {
	if raw == "" || expected == "" {
		return false
	}
	return hmac.Equal([]byte(s.HashToken(raw)), []byte(expected))
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func slugify(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	slug = slugPattern.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return "event"
	}
	return slug
}

func remaining(event *domain.Event, guest *domain.Guest) int {
	left := event.MaxPhotosPerGuest - guest.UploadCount
	if left < 0 {
		return 0
	}
	return left
}

func offlineUploadDeadline(event *domain.Event) time.Time {
	hours := event.OfflineUploadGraceHours
	if hours <= 0 {
		hours = 24
	}
	return event.EndsAt.Add(time.Duration(hours) * time.Hour)
}

func galleryAvailable(event *domain.Event) bool {
	return !time.Now().UTC().Before(event.RevealAt)
}

func allowedImageType(contentType string) bool {
	switch strings.ToLower(contentType) {
	case "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif":
		return true
	default:
		return false
	}
}

func (s *Service) verifyUploadedImage(ctx context.Context, objectKey, contentType string) error {
	reader, err := s.storage.Open(ctx, objectKey)
	if err != nil {
		return err
	}
	defer reader.Close()

	header := make([]byte, 512)
	n, err := io.ReadFull(reader, header)
	if err != nil && err != io.ErrUnexpectedEOF {
		return err
	}
	header = header[:n]
	if len(bytes.TrimSpace(header)) == 0 {
		return fmt.Errorf("%w: uploaded object is empty", domain.ErrValidation)
	}
	if imageBytesMatchContentType(header, contentType) {
		return nil
	}
	return fmt.Errorf("%w: uploaded object is not a valid %s", domain.ErrValidation, contentType)
}

func imageBytesMatchContentType(header []byte, contentType string) bool {
	contentType = strings.ToLower(contentType)
	detected := http.DetectContentType(header)
	switch contentType {
	case "image/jpeg", "image/jpg":
		return detected == "image/jpeg"
	case "image/png":
		return detected == "image/png"
	case "image/webp":
		return len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WEBP"
	case "image/heic", "image/heif":
		return hasISOBMFFBrand(header, "heic") || hasISOBMFFBrand(header, "heix") || hasISOBMFFBrand(header, "hevc") || hasISOBMFFBrand(header, "hevx") || hasISOBMFFBrand(header, "mif1") || hasISOBMFFBrand(header, "msf1")
	default:
		return false
	}
}

func hasISOBMFFBrand(header []byte, brand string) bool {
	if len(header) < 12 || string(header[4:8]) != "ftyp" {
		return false
	}
	for i := 8; i+4 <= len(header) && i < 64; i += 4 {
		if string(header[i:i+4]) == brand {
			return true
		}
	}
	return false
}
