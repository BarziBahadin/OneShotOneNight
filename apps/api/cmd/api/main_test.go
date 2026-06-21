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
	cfg.RedisPassword = ""
	if err := validateConfig(cfg); err == nil || !strings.Contains(err.Error(), "REDIS_PASSWORD") {
		t.Fatalf("got %v, want missing Redis password rejection", err)
	}
}

func validProductionConfig() config.Config {
	return config.Config{
		AppEnv:            "production",
		PublicWebURL:      "https://example.test",
		CORSOrigins:       []string{"https://example.test"},
		DataBackend:       "redis",
		RedisPassword:     "a-long-random-redis-password",
		RedisAddr:         "redis.example.test:6379",
		RedisTLS:          true,
		TokenPepper:       "a-long-random-production-token-pepper",
		AdminPasswordHash: "$2a$10$7EqJtq98hPqEX7fNZaFWoO7QXD4i5Vq9pM7hLsr9uDGC0yQG0xGqG",
		AdminSessionTTL:   12 * time.Hour,
		GuestCookieTTL:    30 * 24 * time.Hour,
		CookieSecure:      true,
		S3Endpoint:        "https://s3.example.test",
		S3Region:          "us-east-1",
		S3Bucket:          "photos",
		S3AccessKey:       "prod-access-key",
		S3SecretKey:       "prod-secret-key",
		MaxUploadBytes:    10 << 20,
	}
}
