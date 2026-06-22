package main

import (
	"strings"
	"testing"
	"time"

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

func TestValidateConfigRejectsDevelopmentDefaults(t *testing.T) {
	cfg := validProductionConfig()
	cfg.AppEnv = "development"
	cfg.AdminPasswordHash = ""
	cfg.AdminPassword = "admin"
	if err := validateConfig(cfg); err == nil || !strings.Contains(err.Error(), "ADMIN_PASSWORD") {
		t.Fatalf("got %v, want default admin password rejection", err)
	}
	cfg.AdminPassword = "a-long-random-admin-password"
	cfg.DatabaseURL = ""
	if err := validateConfig(cfg); err == nil || !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Fatalf("got %v, want missing database URL rejection", err)
	}
}

func validProductionConfig() config.Config {
	return config.Config{
		AppEnv:                   "production",
		PublicWebURL:             "https://example.test",
		CORSOrigins:              []string{"https://example.test"},
		DatabaseURL:              "postgresql://app:secret@db.example.test:5432/postgres?sslmode=require",
		DBMaxConnections:         10,
		TokenPepper:              "a-long-random-production-token-pepper",
		AdminPasswordHash:        "$2a$10$7EqJtq98hPqEX7fNZaFWoO7QXD4i5Vq9pM7hLsr9uDGC0yQG0xGqG",
		AdminSessionTTL:          12 * time.Hour,
		GuestCookieTTL:           30 * 24 * time.Hour,
		CookieSecure:             true,
		SupabaseStorageEndpoint:  "https://project.storage.supabase.co/storage/v1/s3",
		SupabaseStorageRegion:    "us-east-1",
		SupabaseStorageBucket:    "photos",
		SupabaseStorageAccessKey: "prod-access-key",
		SupabaseStorageSecretKey: "prod-secret-key",
		MaxUploadBytes:           10 << 20,
	}
}
