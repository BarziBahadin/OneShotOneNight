package domain

import "errors"

var (
	ErrNotFound          = errors.New("not_found")
	ErrUnauthorized      = errors.New("unauthorized")
	ErrForbidden         = errors.New("forbidden")
	ErrValidation        = errors.New("validation_error")
	ErrEventLocked       = errors.New("event_locked")
	ErrEventNotStarted   = errors.New("event_not_started")
	ErrEventEnded        = errors.New("event_ended")
	ErrEventPaused       = errors.New("event_paused")
	ErrRevealNotReached  = errors.New("reveal_not_reached")
	ErrUploadLimit       = errors.New("upload_limit_reached")
	ErrGuestLimit        = errors.New("guest_limit_reached")
	ErrDuplicateRequest  = errors.New("duplicate_request")
	ErrUnsupportedStatus = errors.New("unsupported_status")
)
