package config

import "testing"

func TestLoadRejectsMalformedTypedValues(t *testing.T) {
	t.Setenv("MAX_UPLOAD_BYTES", "not-a-number")
	if _, err := Load(); err == nil {
		t.Fatal("malformed integer should fail configuration loading")
	}
	t.Setenv("MAX_UPLOAD_BYTES", "1024")
	t.Setenv("COOKIE_SECURE", "sometimes")
	if _, err := Load(); err == nil {
		t.Fatal("malformed boolean should fail configuration loading")
	}
}
