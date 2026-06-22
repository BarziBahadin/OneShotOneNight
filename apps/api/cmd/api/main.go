package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"oneshotonenight/api/internal/application"
	"oneshotonenight/api/internal/infra/config"
	httpapi "oneshotonenight/api/internal/infra/http"
	postgresinfra "oneshotonenight/api/internal/infra/postgres"
	"oneshotonenight/api/internal/infra/storage"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg, err := config.Load()
	if err != nil {
		log.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	if err := validateConfig(cfg); err != nil {
		log.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	pool, err := postgresinfra.NewPool(context.Background(), cfg.DatabaseURL, int32(cfg.DBMaxConnections))
	if err != nil {
		log.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	store := postgresinfra.NewStore(pool)
	svc := application.NewService(application.NewServiceInput{
		Events: store.Events(), Guests: store.Guests(), Photos: store.Photos(), Idempotency: store.Idempotency(), Uploads: store.Uploads(),
		AdminSessions: store.AdminSessions(),
		Storage: storage.PresignedStorage{
			Endpoint: cfg.SupabaseStorageEndpoint, Region: cfg.SupabaseStorageRegion, Bucket: cfg.SupabaseStorageBucket,
			AccessKey: cfg.SupabaseStorageAccessKey, SecretKey: cfg.SupabaseStorageSecretKey, UsePathStyle: true,
		},
		Pepper: cfg.TokenPepper, GuestURLBase: cfg.PublicWebURL, MaxBytes: cfg.MaxUploadBytes,
		DisableGuestTokens: cfg.DisableGuestTokens, AdminPassword: cfg.AdminPassword, AdminPasswordHash: cfg.AdminPasswordHash, AdminSessionTTL: cfg.AdminSessionTTL,
	})
	migratedTokens, err := svc.MigrateLegacyEventTokens(context.Background())
	if err != nil {
		log.Error("legacy event-token migration failed", "error", err)
		os.Exit(1)
	}
	if migratedTokens > 0 {
		log.Warn("rotated event links after token-storage or pepper migration", "events", migratedTokens)
	}
	handler, err := httpapi.NewWithError(svc, cfg, log, store.RateLimits())
	if err != nil {
		log.Error("invalid http configuration", "error", err)
		os.Exit(1)
	}
	server := &http.Server{
		Addr: cfg.HTTPAddr, Handler: handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	go func() {
		log.Info("api listening", "addr", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("api failed", "error", err)
			os.Exit(1)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	log.Info("api stopped")
}

func validateProductionConfig(cfg config.Config) error {
	if err := validateConfig(cfg); err != nil {
		return err
	}
	return nil
}

func validateConfig(cfg config.Config) error {
	if cfg.AppEnv != "development" && cfg.AppEnv != "test" && cfg.AppEnv != "production" {
		return fmt.Errorf("APP_ENV must be development, test, or production")
	}
	if len(cfg.TokenPepper) < 32 || cfg.TokenPepper == "dev-pepper-change-me" || cfg.TokenPepper == "change-me-to-a-long-random-secret" {
		return fmt.Errorf("TOKEN_PEPPER must be a random secret of at least 32 characters")
	}
	if cfg.AdminPasswordHash == "" && (len(cfg.AdminPassword) < 12 || cfg.AdminPassword == "admin") {
		return fmt.Errorf("ADMIN_PASSWORD must be at least 12 characters when ADMIN_PASSWORD_HASH is not set")
	}
	if cfg.AdminPasswordHash != "" && !strings.HasPrefix(cfg.AdminPasswordHash, "$2") {
		return fmt.Errorf("ADMIN_PASSWORD_HASH must be a bcrypt hash")
	}
	if !isPostgresURL(cfg.DatabaseURL) {
		return fmt.Errorf("DATABASE_URL must be a PostgreSQL connection URL")
	}
	if cfg.DBMaxConnections < 1 || cfg.DBMaxConnections > 50 {
		return fmt.Errorf("DB_MAX_CONNECTIONS must be between 1 and 50")
	}
	if cfg.SupabaseStorageAccessKey == "" || cfg.SupabaseStorageSecretKey == "" {
		return fmt.Errorf("Supabase Storage S3 credentials must be set")
	}
	if cfg.AdminSessionTTL <= 0 || cfg.AdminSessionTTL > 30*24*time.Hour {
		return fmt.Errorf("ADMIN_SESSION_TTL_HOURS must be between 1 and 720")
	}
	if cfg.GuestCookieTTL <= 0 || cfg.GuestCookieTTL > 365*24*time.Hour {
		return fmt.Errorf("GUEST_COOKIE_TTL_HOURS must be between 1 and 8760")
	}
	if cfg.MaxUploadBytes <= 0 || cfg.MaxUploadBytes > 100<<20 {
		return fmt.Errorf("MAX_UPLOAD_BYTES must be between 1 and 104857600")
	}
	if !isHTTPURL(cfg.PublicWebURL) {
		return fmt.Errorf("PUBLIC_WEB_URL must be an HTTP or HTTPS URL")
	}
	if !isHTTPURL(cfg.SupabaseStorageEndpoint) || cfg.SupabaseStorageBucket == "" || cfg.SupabaseStorageRegion == "" {
		return fmt.Errorf("Supabase Storage endpoint, bucket, and region must be configured")
	}
	if cfg.AppEnv != "production" {
		return nil
	}
	if cfg.DisableGuestTokens {
		return fmt.Errorf("DISABLE_GUEST_TOKENS cannot be true in production")
	}
	if cfg.AdminPasswordHash == "" {
		return fmt.Errorf("ADMIN_PASSWORD_HASH must be set in production")
	}
	if !strings.HasPrefix(cfg.AdminPasswordHash, "$2") {
		return fmt.Errorf("ADMIN_PASSWORD_HASH must be a bcrypt hash in production")
	}
	if !cfg.CookieSecure {
		return fmt.Errorf("COOKIE_SECURE must be true in production")
	}
	if !isHTTPSURL(cfg.PublicWebURL) {
		return fmt.Errorf("PUBLIC_WEB_URL must be an HTTPS URL in production")
	}
	if !isHTTPSURL(cfg.SupabaseStorageEndpoint) {
		return fmt.Errorf("SUPABASE_STORAGE_ENDPOINT must be an HTTPS URL in production")
	}
	if parsed, _ := url.Parse(cfg.DatabaseURL); parsed.Query().Get("sslmode") == "disable" {
		return fmt.Errorf("DATABASE_URL cannot disable TLS in production")
	}
	for _, origin := range cfg.CORSOrigins {
		if !isHTTPSURL(origin) {
			return fmt.Errorf("CORS_ORIGINS must contain only HTTPS origins in production")
		}
	}
	return nil
}

func isHTTPSURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
}

func isPostgresURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	return err == nil && (parsed.Scheme == "postgres" || parsed.Scheme == "postgresql") && parsed.Host != ""
}

func isHTTPURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}
