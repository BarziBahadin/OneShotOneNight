package httpapi

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"oneshotonenight/api/internal/application"
	"oneshotonenight/api/internal/domain"
	"oneshotonenight/api/internal/infra/config"
	"oneshotonenight/api/internal/ports"
)

const guestCookieName = "event_guest_token"
const adminCookieName = "admin_session"
const adminCSRFName = "admin_csrf"
const adminCSRFHeader = "X-CSRF-Token"
const maxJSONBodyBytes = 1 << 20

type Server struct {
	service        *application.Service
	cfg            config.Config
	log            *slog.Logger
	limits         ports.RateLimitRepository
	trustedProxies []*net.IPNet
}

func New(service *application.Service, cfg config.Config, log *slog.Logger, limits ports.RateLimitRepository) http.Handler {
	handler, err := NewWithError(service, cfg, log, limits)
	if err != nil {
		panic(err)
	}
	return handler
}

func NewWithError(service *application.Service, cfg config.Config, log *slog.Logger, limits ports.RateLimitRepository) (http.Handler, error) {
	trustedProxies, err := parseTrustedProxies(cfg.TrustedProxies)
	if err != nil {
		return nil, err
	}
	if limits == nil {
		return nil, errors.New("rate limit repository is required")
	}
	s := &Server{service: service, cfg: cfg, log: log, limits: limits, trustedProxies: trustedProxies}
	r := chi.NewRouter()
	// Do not use chi's RealIP middleware here: it trusts forwarded headers from
	// any caller. clientKey applies the configured trusted-proxy allowlist.
	r.Use(middleware.RequestID, middleware.Recoverer)
	r.Use(securityHeaders)
	r.Use(cors.Handler(cors.Options{AllowedOrigins: cfg.CORSOrigins, AllowedMethods: []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"}, AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "Idempotency-Key", adminCSRFHeader}, AllowCredentials: true, MaxAge: 300}))
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
	})
	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/admin", func(r chi.Router) {
			r.With(s.limit("admin-login", 8, 15*time.Minute)).Post("/login", s.adminLogin)
			r.With(s.requireAdmin).Post("/logout", s.adminLogout)
			r.Get("/me", s.adminMe)
			r.Group(func(r chi.Router) {
				r.Use(s.requireAdmin)
				r.Get("/overview", s.adminOverview)
				r.Get("/events", s.adminEvents)
				r.Post("/events", s.adminCreateEvent)
				r.Get("/events/{eventID}", s.adminEvent)
				r.Patch("/events/{eventID}", s.adminUpdateEvent)
				r.Delete("/events/{eventID}", s.adminDeleteEvent)
				r.Post("/events/{eventID}/tokens/reset", s.adminResetEventTokens)
				r.Post("/events/{eventID}/open", s.adminOpenEvent)
				r.Post("/events/{eventID}/lock", s.adminLockEvent)
				r.Get("/events/{eventID}/photos", s.adminEventPhotos)
				r.With(s.limit("admin-photo-download", 5, time.Minute)).Get("/events/{eventID}/photos/download", s.adminDownloadPhotos)
				r.Patch("/events/{eventID}/photos/{photoID}", s.adminModeratePhoto)
				r.Get("/events/{eventID}/guests", s.adminEventGuests)
				r.Patch("/events/{eventID}/guests/{guestID}", s.adminUpdateGuest)
			})
		})
		r.With(s.limit("guest-join", 40, time.Minute)).Post("/guest/{slug}/join", s.joinGuest)
		r.With(s.limit("guest-presign", 30, time.Minute)).Post("/guest/{slug}/uploads/presign", s.presignUpload)
		r.With(s.limit("guest-register-photo", 60, time.Minute)).Post("/guest/{slug}/photos", s.registerPhoto)
		r.With(s.limit("guest-gallery", 120, time.Minute)).Get("/gallery/{slug}", s.gallery)
	})
	return r, nil
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Pragma", "no-cache")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := s.service.AdminSession(r.Context(), cookieValue(r, adminCookieName)); err != nil {
			writeError(w, domain.ErrUnauthorized)
			return
		}
		if unsafeMethod(r.Method) && !validCSRF(r) {
			writeError(w, domain.ErrForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
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
	csrf, err := randomCookieToken()
	if err != nil {
		writeError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: token, Path: "/api/v1/admin", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: expires})
	http.SetCookie(w, &http.Cookie{Name: adminCSRFName, Value: csrf, Path: "/api/v1/admin", HttpOnly: false, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: expires})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "expires_at": expires})
}

func (s *Server) adminLogout(w http.ResponseWriter, r *http.Request) {
	_ = s.service.AdminLogout(r.Context(), cookieValue(r, adminCookieName))
	http.SetCookie(w, &http.Cookie{Name: adminCookieName, Value: "", Path: "/api/v1/admin", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	http.SetCookie(w, &http.Cookie{Name: adminCSRFName, Value: "", Path: "/api/v1/admin", HttpOnly: false, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
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
	tmp, err := os.CreateTemp("", "oneshotonenight-photos-*.zip")
	if err != nil {
		writeError(w, err)
		return
	}
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
	}()
	if _, err := s.service.AdminPhotoArchive(r.Context(), chi.URLParam(r, "eventID"), tmp); err != nil {
		s.log.Error("photo archive failed", "event_id", chi.URLParam(r, "eventID"), "error", err)
		writeError(w, err)
		return
	}
	if _, err := tmp.Seek(0, 0); err != nil {
		writeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="event-photos.zip"`)
	http.ServeContent(w, r, "event-photos.zip", time.Now(), tmp)
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

func (s *Server) adminResetEventTokens(w http.ResponseWriter, r *http.Request) {
	out, err := s.service.AdminRotateEventTokens(r.Context(), chi.URLParam(r, "eventID"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
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
	raw := guestDeviceToken(r)
	out, token, err := s.service.JoinGuest(r.Context(), chi.URLParam(r, "slug"), tokenFrom(body.AccessToken, r), raw, body.DisplayName)
	if err != nil {
		writeError(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: guestCookieName, Value: token, Path: "/api/v1", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode, Expires: time.Now().Add(s.cfg.GuestCookieTTL)})
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) presignUpload(w http.ResponseWriter, r *http.Request) {
	var in application.PresignInput
	if !decode(w, r, &in) {
		return
	}
	in.EventSlug = chi.URLParam(r, "slug")
	in.AccessToken = tokenFrom(in.AccessToken, r)
	in.DeviceToken = guestDeviceToken(r)
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
	in.DeviceToken = guestDeviceToken(r)
	photo, remaining, err := s.service.RegisterPhoto(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"photo": photo, "remaining_shots": remaining})
}

func (s *Server) gallery(w http.ResponseWriter, r *http.Request) {
	event, photos, err := s.service.Gallery(r.Context(), chi.URLParam(r, "slug"), tokenFrom("", r), guestDeviceToken(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"event": event, "photos": photos})
}

func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		writeError(w, domain.ErrValidation)
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
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
	message := "internal server error"
	switch {
	case errors.Is(err, domain.ErrValidation):
		status, code, message = http.StatusBadRequest, "validation_error", "invalid request"
	case errors.Is(err, domain.ErrUnauthorized):
		status, code, message = http.StatusUnauthorized, "unauthorized", "unauthorized"
	case errors.Is(err, domain.ErrForbidden), errors.Is(err, domain.ErrEventLocked), errors.Is(err, domain.ErrEventNotStarted), errors.Is(err, domain.ErrEventEnded), errors.Is(err, domain.ErrEventPaused), errors.Is(err, domain.ErrRevealNotReached):
		status, code, message = http.StatusForbidden, err.Error(), err.Error()
	case errors.Is(err, domain.ErrNotFound):
		status, code, message = http.StatusNotFound, "not_found", "not found"
	case errors.Is(err, domain.ErrRateLimited):
		status, code, message = http.StatusTooManyRequests, "rate_limited", "rate limited"
	case errors.Is(err, domain.ErrUploadLimit), errors.Is(err, domain.ErrGuestLimit), errors.Is(err, domain.ErrDuplicateRequest):
		status, code, message = http.StatusConflict, err.Error(), err.Error()
	}
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}

func cookieValue(r *http.Request, name string) string {
	c, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return c.Value
}

func guestDeviceToken(r *http.Request) string {
	return cookieValue(r, guestCookieName)
}

func tokenFrom(bodyToken string, r *http.Request) string {
	if bodyToken != "" {
		return bodyToken
	}
	auth := r.Header.Get("Authorization")
	return strings.TrimPrefix(auth, "Bearer ")
}

func (s *Server) limit(scope string, max int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := scope + ":" + s.clientKey(r)
			allowed, err := s.limits.Allow(r.Context(), key, max, window)
			if err != nil {
				s.log.Error("rate limit check failed", "scope", scope, "error", err)
				writeError(w, err)
				return
			}
			if !allowed {
				writeError(w, domain.ErrRateLimited)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (s *Server) clientKey(r *http.Request) string {
	remote := remoteIP(r)
	if s.trustsRemote(remote) {
		if ip := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); ip != "" {
			parsed := net.ParseIP(strings.TrimSpace(strings.Split(ip, ",")[0]))
			if parsed != nil {
				return parsed.String()
			}
		}
		if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
			parsed := net.ParseIP(ip)
			if parsed != nil {
				return parsed.String()
			}
		}
	}
	if remote != nil {
		return remote.String()
	}
	return r.RemoteAddr
}

func remoteIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return net.ParseIP(host)
	}
	return net.ParseIP(r.RemoteAddr)
}

func (s *Server) trustsRemote(ip net.IP) bool {
	if ip == nil {
		return false
	}
	for _, network := range s.trustedProxies {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func parseTrustedProxies(values []string) ([]*net.IPNet, error) {
	out := make([]*net.IPNet, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if !strings.Contains(value, "/") {
			ip := net.ParseIP(value)
			if ip == nil {
				return nil, fmt.Errorf("invalid trusted proxy %q", value)
			}
			bits := 32
			if ip.To4() == nil {
				bits = 128
			}
			out = append(out, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
			continue
		}
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			return nil, fmt.Errorf("invalid trusted proxy CIDR %q", value)
		}
		out = append(out, network)
	}
	return out, nil
}

func validCSRF(r *http.Request) bool {
	header := strings.TrimSpace(r.Header.Get(adminCSRFHeader))
	cookie := cookieValue(r, adminCSRFName)
	if header == "" || cookie == "" || len(header) != len(cookie) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(header), []byte(cookie)) == 1
}

func unsafeMethod(method string) bool {
	return method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
}

func randomCookieToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
