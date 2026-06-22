package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv                   string
	HTTPAddr                 string
	PublicWebURL             string
	CORSOrigins              []string
	TrustedProxies           []string
	DatabaseURL              string
	DBMaxConnections         int
	TokenPepper              string
	AdminPassword            string
	AdminPasswordHash        string
	AdminSessionTTL          time.Duration
	DisableGuestTokens       bool
	CookieSecure             bool
	GuestCookieTTL           time.Duration
	SupabaseStorageEndpoint  string
	SupabaseStorageRegion    string
	SupabaseStorageBucket    string
	SupabaseStorageAccessKey string
	SupabaseStorageSecretKey string
	MaxUploadBytes           int64
}

func Load() (Config, error) {
	dbMaxConnections, err := getInt("DB_MAX_CONNECTIONS", 10)
	if err != nil {
		return Config{}, err
	}
	adminTTLHours, err := getInt("ADMIN_SESSION_TTL_HOURS", 12)
	if err != nil {
		return Config{}, err
	}
	guestTTLHours, err := getInt("GUEST_COOKIE_TTL_HOURS", 720)
	if err != nil {
		return Config{}, err
	}
	maxUploadBytes, err := getInt("MAX_UPLOAD_BYTES", 10485760)
	if err != nil {
		return Config{}, err
	}
	disableGuestTokens, err := getBool("DISABLE_GUEST_TOKENS", false)
	if err != nil {
		return Config{}, err
	}
	cookieSecure, err := getBool("COOKIE_SECURE", false)
	if err != nil {
		return Config{}, err
	}
	return Config{
		AppEnv:                   get("APP_ENV", "development"),
		HTTPAddr:                 get("HTTP_ADDR", "127.0.0.1:8080"),
		PublicWebURL:             get("PUBLIC_WEB_URL", "http://localhost:3000"),
		CORSOrigins:              split(get("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")),
		TrustedProxies:           split(get("TRUSTED_PROXIES", "")),
		DatabaseURL:              get("DATABASE_URL", ""),
		DBMaxConnections:         dbMaxConnections,
		TokenPepper:              get("TOKEN_PEPPER", ""),
		AdminPassword:            get("ADMIN_PASSWORD", ""),
		AdminPasswordHash:        get("ADMIN_PASSWORD_HASH", ""),
		AdminSessionTTL:          time.Duration(adminTTLHours) * time.Hour,
		DisableGuestTokens:       disableGuestTokens,
		CookieSecure:             cookieSecure,
		GuestCookieTTL:           time.Duration(guestTTLHours) * time.Hour,
		SupabaseStorageEndpoint:  get("SUPABASE_STORAGE_ENDPOINT", ""),
		SupabaseStorageRegion:    get("SUPABASE_STORAGE_REGION", ""),
		SupabaseStorageBucket:    get("SUPABASE_STORAGE_BUCKET", "oneshotonenight"),
		SupabaseStorageAccessKey: get("SUPABASE_STORAGE_ACCESS_KEY", ""),
		SupabaseStorageSecretKey: get("SUPABASE_STORAGE_SECRET_KEY", ""),
		MaxUploadBytes:           int64(maxUploadBytes),
	}, nil
}

func get(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) (int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	return v, nil
}

func getBool(key string, fallback bool) (bool, error) {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if raw == "" {
		return fallback, nil
	}
	switch raw {
	case "true", "1":
		return true, nil
	case "false", "0":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be true, false, 1, or 0", key)
	}
}

func split(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
