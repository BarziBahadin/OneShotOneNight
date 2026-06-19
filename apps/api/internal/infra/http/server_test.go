package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientKeyIgnoresForwardedHeadersFromUntrustedRemote(t *testing.T) {
	server := &Server{trustedProxies: parseTrustedProxies(nil)}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/login", nil)
	req.RemoteAddr = "203.0.113.10:4444"
	req.Header.Set("X-Forwarded-For", "198.51.100.77")
	req.Header.Set("X-Real-IP", "198.51.100.88")

	if got := server.clientKey(req); got != "203.0.113.10" {
		t.Fatalf("clientKey got %q, want remote address", got)
	}
}

func TestClientKeyUsesForwardedHeadersFromTrustedRemote(t *testing.T) {
	server := &Server{trustedProxies: parseTrustedProxies([]string{"203.0.113.10"})}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/login", nil)
	req.RemoteAddr = "203.0.113.10:4444"
	req.Header.Set("X-Forwarded-For", "198.51.100.77, 203.0.113.10")

	if got := server.clientKey(req); got != "198.51.100.77" {
		t.Fatalf("clientKey got %q, want forwarded client", got)
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
