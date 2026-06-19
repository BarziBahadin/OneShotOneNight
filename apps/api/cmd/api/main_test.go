package main

import (
	"strings"
	"testing"

	"oneshotonenight/api/internal/infra/config"
)

func TestValidateProductionConfigRequiresBcryptAdminHash(t *testing.T) {
	cfg := validProductionConfig()
	cfg.AdminPasswordHash = "legacy-hmac-looking-value"

	err := validateProductionConfig(cfg)
	if err == nil || !strings.Contains(err.Error(), "bcrypt") {
		t.Fatalf("got %v, want bcrypt hash error", err)
	}
}

func TestValidateProductionConfigAcceptsHardenedConfig(t *testing.T) {
	if err := validateProductionConfig(validProductionConfig()); err != nil {
		t.Fatal(err)
	}
}

func validProductionConfig() config.Config {
	return config.Config{
		AppEnv:            "production",
		PublicWebURL:      "https://example.test",
		CORSOrigins:       []string{"https://example.test"},
		DataBackend:       "redis",
		TokenPepper:       "a-long-random-production-token-pepper",
		AdminPasswordHash: "$2a$10$7EqJtq98hPqEX7fNZaFWoO7QXD4i5Vq9pM7hLsr9uDGC0yQG0xGqG",
		CookieSecure:      true,
		S3AccessKey:       "prod-access-key",
		S3SecretKey:       "prod-secret-key",
	}
}
