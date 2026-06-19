package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientKeyIgnoresForwardedHeadersFromUntrustedRemote(t *testing.T) {
	trustedProxies, err := parseTrustedProxies(nil)
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{trustedProxies: trustedProxies}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/login", nil)
	req.RemoteAddr = "203.0.113.10:4444"
	req.Header.Set("X-Forwarded-For", "198.51.100.77")
	req.Header.Set("X-Real-IP", "198.51.100.88")

	if got := server.clientKey(req); got != "203.0.113.10" {
		t.Fatalf("clientKey got %q, want remote address", got)
	}
}

func TestClientKeyUsesForwardedHeadersFromTrustedRemote(t *testing.T) {
	trustedProxies, err := parseTrustedProxies([]string{"203.0.113.10"})
	if err != nil {
		t.Fatal(err)
	}
	server := &Server{trustedProxies: trustedProxies}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/login", nil)
	req.RemoteAddr = "203.0.113.10:4444"
	req.Header.Set("X-Forwarded-For", "198.51.100.77, 203.0.113.10")

	if got := server.clientKey(req); got != "198.51.100.77" {
		t.Fatalf("clientKey got %q, want forwarded client", got)
	}
}

func TestParseTrustedProxiesRejectsInvalidEntries(t *testing.T) {
	if _, err := parseTrustedProxies([]string{"not-an-ip"}); err == nil {
		t.Fatal("expected invalid trusted proxy to fail")
	}
	if _, err := parseTrustedProxies([]string{"10.0.0.0/not-a-mask"}); err == nil {
		t.Fatal("expected invalid trusted proxy CIDR to fail")
	}
}

func TestValidCSRFRequiresMatchingCookieAndHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/admin/events/event-1", nil)
	req.Header.Set(adminCSRFHeader, "token-a")
	req.AddCookie(&http.Cookie{Name: adminCSRFName, Value: "token-a"})
	if !validCSRF(req) {
		t.Fatal("expected matching CSRF values to pass")
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/v1/admin/events/event-1", nil)
	req.Header.Set(adminCSRFHeader, "token-a")
	req.AddCookie(&http.Cookie{Name: adminCSRFName, Value: "token-b"})
	if validCSRF(req) {
		t.Fatal("expected mismatched CSRF values to fail")
	}
}

func TestDecodeRejectsUnknownFields(t *testing.T) {
	var out struct {
		Name string `json:"name"`
	}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"Night","extra":true}`))
	rec := httptest.NewRecorder()

	if decode(rec, req, &out) {
		t.Fatal("expected unknown JSON field to fail")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got status %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestDecodeRejectsTrailingJSON(t *testing.T) {
	var out struct {
		Name string `json:"name"`
	}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"Night"} {"name":"Other"}`))
	rec := httptest.NewRecorder()

	if decode(rec, req, &out) {
		t.Fatal("expected trailing JSON to fail")
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got status %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestWriteErrorDoesNotExposeInternalErrorText(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, errors.New("redis password leaked in provider error"))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got status %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	if strings.Contains(rec.Body.String(), "redis password") {
		t.Fatalf("internal error leaked to client: %s", rec.Body.String())
	}
}
