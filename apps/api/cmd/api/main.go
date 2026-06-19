package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"oneshotonenight/api/internal/application"
	"oneshotonenight/api/internal/infra/config"
	httpapi "oneshotonenight/api/internal/infra/http"
	redisinfra "oneshotonenight/api/internal/infra/redis"
	"oneshotonenight/api/internal/infra/storage"
)

func main() {
	cfg := config.Load()
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if err := validateProductionConfig(cfg); err != nil {
		log.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	redisClient := redisinfra.NewClient(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	store := redisinfra.NewStore(redisClient)
	svc := application.NewService(application.NewServiceInput{
		Events: store.Events(), Guests: store.Guests(), Photos: store.Photos(), Idempotency: store.Idempotency(), Uploads: store.Uploads(),
		AdminSessions: store.AdminSessions(),
		Storage: storage.PresignedStorage{
			Endpoint: cfg.S3Endpoint, Region: cfg.S3Region, Bucket: cfg.S3Bucket,
			AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey, UsePathStyle: cfg.S3UsePathStyle,
		},
		Pepper: cfg.TokenPepper, WebURL: cfg.PublicWebURL, MaxBytes: cfg.MaxUploadBytes,
		DisableGuestTokens: cfg.DisableGuestTokens, AdminPassword: cfg.AdminPassword, AdminPasswordHash: cfg.AdminPasswordHash, AdminSessionTTL: cfg.AdminSessionTTL,
	})
	server := &http.Server{
		Addr: cfg.HTTPAddr, Handler: httpapi.New(svc, cfg, log),
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
	_ = redisClient.Close()
	log.Info("api stopped")
}

func validateProductionConfig(cfg config.Config) error {
	if cfg.AppEnv != "production" {
		return nil
	}
	if cfg.DisableGuestTokens {
		return fmt.Errorf("DISABLE_GUEST_TOKENS cannot be true in production")
	}
	if cfg.TokenPepper == "" || cfg.TokenPepper == "dev-pepper-change-me" || cfg.TokenPepper == "change-me-to-a-long-random-secret" {
		return fmt.Errorf("TOKEN_PEPPER must be a strong production secret")
	}
	if cfg.AdminPasswordHash == "" {
		return fmt.Errorf("ADMIN_PASSWORD_HASH must be set in production")
	}
	if !cfg.CookieSecure {
		return fmt.Errorf("COOKIE_SECURE must be true in production")
	}
	return nil
}
