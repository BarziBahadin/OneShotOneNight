package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"oneshotonenight/api/internal/application"
	"oneshotonenight/api/internal/domain"
	"oneshotonenight/api/internal/infra/config"
)

const guestCookieName = "event_guest_token"
const adminCookieName = "admin_session"
const maxJSONBodyBytes = 1 << 20

type Server struct {
	service *application.Service
	cfg     config.Config
	log     *slog.Logger
}

func New(service *application.Service, cfg config.Config, log *slog.Logger) http.Handler {
	s := &Server{service: service, cfg: cfg, log: log}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{AllowedOrigins: cfg.CORSOrigins, AllowOriginFunc: allowDevOrigin(cfg), AllowedMethods: []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"}, AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "Idempotency-Key"}, AllowCredentials: true, MaxAge: 300}))
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
	})
	r.Get("/.well-known/apple-app-site-association", s.appleAppSiteAssociation)
	r.Get("/apple-app-site-association", s.appleAppSiteAssociation)
	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/events", s.createEvent)
		r.Route("/admin", func(r chi.Router) {
			r.Post("/login", s.adminLogin)
			r.Post("/logout", s.adminLogout)
			r.Get("/me", s.adminMe)
			r.Group(func(r chi.Router) {
				r.Use(s.requireAdmin)
				r.Get("/overview", s.adminOverview)
				r.Get("/events", s.adminEvents)
				r.Post("/events", s.adminCreateEvent)
				r.Get("/events/{eventID}", s.adminEvent)
				r.Patch("/events/{eventID}", s.adminUpdateEvent)
				r.Delete("/events/{eventID}", s.adminDeleteEvent)
				r.Post("/events/{eventID}/open", s.adminOpenEvent)
				r.Post("/events/{eventID}/lock", s.adminLockEvent)
				r.Get("/events/{eventID}/photos", s.adminEventPhotos)
				r.Get("/events/{eventID}/photos/download", s.adminDownloadPhotos)
				r.Patch("/events/{eventID}/photos/{photoID}", s.adminModeratePhoto)
				r.Get("/events/{eventID}/guests", s.adminEventGuests)
				r.Patch("/events/{eventID}/guests/{guestID}", s.adminUpdateGuest)
			})
		})
		r.Post("/guest/{slug}/join", s.joinGuest)
		r.Post("/guest/{slug}/uploads/presign", s.presignUpload)
		r.Post("/guest/{slug}/photos", s.registerPhoto)
		r.Get("/gallery/{slug}", s.gallery)
		r.Get("/host/events/{slug}/photos", s.hostGallery)
		r.Patch("/host/events/{eventID}/photos/{photoID}", s.moderatePhoto)
	})
	return r
}

func (s *Server) appleAppSiteAssociation(w http.ResponseWriter, r *http.Request) {
	writeAppleAppSiteAssociation(w, s.cfg)
}

func writeAppleAppSiteAssociation(w http.ResponseWriter, cfg config.Config) {
	appIDs := make([]string, 0, 2)
	if cfg.AppleTeamID != "" && cfg.IOSAppBundleID != "" {
		appIDs = append(appIDs, cfg.AppleTeamID+"."+cfg.IOSAppBundleID)
	}
	if cfg.AppleTeamID != "" && cfg.IOSAppClipBundleID != "" {
		appIDs = append(appIDs, cfg.AppleTeamID+"."+cfg.IOSAppClipBundleID)
	}

	appClips := []string{}
	if cfg.AppleTeamID != "" && cfg.IOSAppClipBundleID != "" {
		appClips = append(appClips, cfg.AppleTeamID+"."+cfg.IOSAppClipBundleID)
	}

	pathPrefix := cfg.AppClipPathPrefix
	if pathPrefix == "" {
		pathPrefix = "/guest/*"
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"applinks": map[string]any{
			"details": []map[string]any{
				{
					"appIDs": appIDs,
					"components": []map[string]string{
						{"/": pathPrefix, "comment": "OneShotOneNight guest event links"},
					},
				},
			},
		},
		"appclips": map[string]any{
			"apps": appClips,
		},
	})
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := s.service.AdminSession(r.Context(), cookieValue(r, adminCookieName)); err != nil {
			writeError(w, domain.ErrUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func allowDevOrigin(cfg config.Config) func(r *http.Request, origin string) bool {
	allowed := map[string]bool{}
	for _, origin := range cfg.CORSOrigins {
		allowed[origin] = true
	}
	return func(r *http.Request, origin string) bool {
		if allowed[origin] {
			return true
		}
		if cfg.AppEnv != "development" {
			return false
		}
		parsed, err := url.Parse(origin)
		if err != nil {
			return false
		}
		host := parsed.Hostname()
		if parsed.Scheme != "http" {
			return false
		}
		if host == "localhost" || host == "127.0.0.1" {
			return true
		}
		ip := net.ParseIP(host)
		return ip != nil && ip.IsPrivate()
	}
}

func (s *Server) createEvent(w http.ResponseWriter, r *http.Request) {
	if s.cfg.AppEnv == "production" && s.cfg.AdminCreateToken == "" {
		writeError(w, domain.ErrUnauthorized)
		return
	}
	if s.cfg.AdminCreateToken != "" && tokenFrom("", r) != s.cfg.AdminCreateToken {
		writeError(w, domain.ErrUnauthorized)
		return
	}
	var in application.CreateEventInput
	if !decode(w, r, &in) {
		return
	}
	out, err := s.service.CreateEvent(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) adminLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if !decode(w, r, &body) {
		return
	}
	token, expires, err := s.service.AdminLogin(r.Context(), body.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: token, Path: "/api/v1/admin", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: expires})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "expires_at": expires})
}

func (s *Server) adminLogout(w http.ResponseWriter, r *http.Request) {
	_ = s.service.AdminLogout(r.Context(), cookieValue(r, adminCookieName))
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: "", Path: "/api/v1/admin", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) adminMe(w http.ResponseWriter, r *http.Request) {
	session, err := s.service.AdminSession(r.Context(), cookieValue(r, adminCookieName))
	if err != nil {
		if errors.Is(err, domain.ErrUnauthorized) {
			writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
			return
		}
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "expires_at": session.ExpiresAt})
}

func (s *Server) adminOverview(w http.ResponseWriter, r *http.Request) {
	out, err := s.service.AdminOverview(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) adminEvents(w http.ResponseWriter, r *http.Request) {
	out, err := s.service.AdminEvents(r.Context(), r.URL.Query().Get("q"), r.URL.Query().Get("status"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": out})
}

func (s *Server) adminCreateEvent(w http.ResponseWriter, r *http.Request) {
	var in application.CreateEventInput
	if !decode(w, r, &in) {
		return
	}
	out, err := s.service.CreateEvent(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) adminEvent(w http.ResponseWriter, r *http.Request) {
	out, err := s.service.AdminEvent(r.Context(), chi.URLParam(r, "eventID"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) adminEventPhotos(w http.ResponseWriter, r *http.Request) {
	out, err := s.service.AdminEvent(r.Context(), chi.URLParam(r, "eventID"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": out.Event, "photos": out.Photos})
}

func (s *Server) adminDownloadPhotos(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="event-photos.zip"`)
	if _, err := s.service.AdminPhotoArchive(r.Context(), chi.URLParam(r, "eventID"), w); err != nil {
		s.log.Error("photo archive failed", "event_id", chi.URLParam(r, "eventID"), "error", err)
	}
}

func (s *Server) adminEventGuests(w http.ResponseWriter, r *http.Request) {
	out, err := s.service.AdminEvent(r.Context(), chi.URLParam(r, "eventID"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": out.Event, "guests": out.Guests})
}

func (s *Server) adminUpdateEvent(w http.ResponseWriter, r *http.Request) {
	var in application.UpdateEventInput
	if !decode(w, r, &in) {
		return
	}
	event, err := s.service.AdminUpdateEvent(r.Context(), chi.URLParam(r, "eventID"), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event})
}

func (s *Server) adminDeleteEvent(w http.ResponseWriter, r *http.Request) {
	status := domain.EventDeleted
	event, err := s.service.AdminSetEventStatus(r.Context(), chi.URLParam(r, "eventID"), status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event})
}

func (s *Server) adminOpenEvent(w http.ResponseWriter, r *http.Request) {
	status := domain.EventOpen
	event, err := s.service.AdminSetEventStatus(r.Context(), chi.URLParam(r, "eventID"), status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event})
}

func (s *Server) adminLockEvent(w http.ResponseWriter, r *http.Request) {
	status := domain.EventLocked
	event, err := s.service.AdminSetEventStatus(r.Context(), chi.URLParam(r, "eventID"), status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event})
}

func (s *Server) adminModeratePhoto(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status domain.PhotoStatus `json:"status"`
	}
	if !decode(w, r, &body) {
		return
	}
	err := s.service.AdminModeratePhoto(r.Context(), chi.URLParam(r, "eventID"), chi.URLParam(r, "photoID"), body.Status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) adminUpdateGuest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status domain.GuestStatus `json:"status"`
	}
	if !decode(w, r, &body) {
		return
	}
	guest, err := s.service.AdminUpdateGuestStatus(r.Context(), chi.URLParam(r, "eventID"), chi.URLParam(r, "guestID"), body.Status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"guest": guest})
}

func (s *Server) joinGuest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DisplayName string `json:"display_name"`
		AccessToken string `json:"access_token"`
	}
	if !decode(w, r, &body) {
		return
	}
	raw := cookieValue(r, guestCookieName)
	out, token, err := s.service.JoinGuest(r.Context(), chi.URLParam(r, "slug"), tokenFrom(body.AccessToken, r), raw, body.DisplayName)
	if err != nil {
		writeError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: guestCookieName, Value: token, Path: "/api/v1/guest", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: time.Now().Add(s.cfg.GuestCookieTTL)})
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) presignUpload(w http.ResponseWriter, r *http.Request) {
	var in application.PresignInput
	if !decode(w, r, &in) {
		return
	}
	in.EventSlug = chi.URLParam(r, "slug")
	in.AccessToken = tokenFrom(in.AccessToken, r)
	in.DeviceToken = cookieValue(r, guestCookieName)
	in.IdempotencyKey = r.Header.Get("Idempotency-Key")
	out, err := s.service.PresignUpload(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) registerPhoto(w http.ResponseWriter, r *http.Request) {
	var in application.RegisterPhotoInput
	if !decode(w, r, &in) {
		return
	}
	in.EventSlug = chi.URLParam(r, "slug")
	in.AccessToken = tokenFrom(in.AccessToken, r)
	in.DeviceToken = cookieValue(r, guestCookieName)
	photo, remaining, err := s.service.RegisterPhoto(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"photo": photo, "remaining_shots": remaining})
}

func (s *Server) gallery(w http.ResponseWriter, r *http.Request) {
	event, photos, err := s.service.Gallery(r.Context(), chi.URLParam(r, "slug"), tokenFrom("", r), false)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event, "photos": photos})
}

func (s *Server) hostGallery(w http.ResponseWriter, r *http.Request) {
	event, photos, err := s.service.Gallery(r.Context(), chi.URLParam(r, "slug"), tokenFrom("", r), true)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event, "photos": photos})
}

func (s *Server) moderatePhoto(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status domain.PhotoStatus `json:"status"`
	}
	if !decode(w, r, &body) {
		return
	}
	err := s.service.ModeratePhoto(r.Context(), chi.URLParam(r, "eventID"), tokenFrom("", r), chi.URLParam(r, "photoID"), body.Status)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(out); err != nil {
		writeError(w, domain.ErrValidation)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	code := "internal_error"
	switch {
	case errors.Is(err, domain.ErrValidation):
		status, code = http.StatusBadRequest, "validation_error"
	case errors.Is(err, domain.ErrUnauthorized):
		status, code = http.StatusUnauthorized, "unauthorized"
	case errors.Is(err, domain.ErrForbidden), errors.Is(err, domain.ErrEventLocked), errors.Is(err, domain.ErrEventNotStarted), errors.Is(err, domain.ErrEventEnded), errors.Is(err, domain.ErrEventPaused), errors.Is(err, domain.ErrRevealNotReached):
		status, code = http.StatusForbidden, err.Error()
	case errors.Is(err, domain.ErrNotFound):
		status, code = http.StatusNotFound, "not_found"
	case errors.Is(err, domain.ErrUploadLimit), errors.Is(err, domain.ErrGuestLimit), errors.Is(err, domain.ErrDuplicateRequest):
		status, code = http.StatusConflict, err.Error()
	}
	writeJSON(w, status, map[string]string{"error": code, "message": err.Error()})
}

func cookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}

func tokenFrom(bodyToken string, r *http.Request) string {
	if bodyToken != "" {
		return bodyToken
	}
	auth := r.Header.Get("Authorization")
	return strings.TrimPrefix(auth, "Bearer ")
}
