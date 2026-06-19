package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv             string
	HTTPAddr           string
	PublicWebURL       string
	CORSOrigins        []string
	TrustedProxies     []string
	DataBackend        string
	RedisAddr          string
	RedisPassword      string
	RedisDB            int
	TokenPepper        string
	AdminPassword      string
	AdminPasswordHash  string
	AdminSessionTTL    time.Duration
	DisableGuestTokens bool
	CookieSecure       bool
	GuestCookieTTL     time.Duration
	S3Endpoint         string
	S3Region           string
	S3Bucket           string
	S3AccessKey        string
	S3SecretKey        string
	S3UsePathStyle     bool
	MaxUploadBytes     int64
}

func Load() Config {
	return Config{
		AppEnv:             get("APP_ENV", "development"),
		HTTPAddr:           get("HTTP_ADDR", ":8080"),
		PublicWebURL:       get("PUBLIC_WEB_URL", "http://localhost:3000"),
		CORSOrigins:        split(get("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")),
		TrustedProxies:     split(get("TRUSTED_PROXIES", "")),
		DataBackend:        get("DATA_BACKEND", "redis"),
		RedisAddr:          get("REDIS_ADDR", "localhost:6379"),
		RedisPassword:      get("REDIS_PASSWORD", ""),
		RedisDB:            getInt("REDIS_DB", 0),
		TokenPepper:        get("TOKEN_PEPPER", "dev-pepper-change-me"),
		AdminPassword:      get("ADMIN_PASSWORD", "admin"),
		AdminPasswordHash:  get("ADMIN_PASSWORD_HASH", ""),
		AdminSessionTTL:    time.Duration(getInt("ADMIN_SESSION_TTL_HOURS", 12)) * time.Hour,
		DisableGuestTokens: getBool("DISABLE_GUEST_TOKENS", false),
		CookieSecure:       getBool("COOKIE_SECURE", false),
		GuestCookieTTL:     time.Duration(getInt("GUEST_COOKIE_TTL_HOURS", 720)) * time.Hour,
		S3Endpoint:         get("S3_ENDPOINT", "http://localhost:9000"),
		S3Region:           get("S3_REGION", "us-east-1"),
		S3Bucket:           get("S3_BUCKET", "oneshotonenight"),
		S3AccessKey:        get("S3_ACCESS_KEY", "minioadmin"),
		S3SecretKey:        get("S3_SECRET_KEY", "minioadmin"),
		S3UsePathStyle:     getBool("S3_USE_PATH_STYLE", true),
		MaxUploadBytes:     int64(getInt("MAX_UPLOAD_BYTES", 10485760)),
	}
}

func get(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	v, err := strconv.Atoi(get(key, ""))
	if err != nil {
		return fallback
	}
	return v
}

func getBool(key string, fallback bool) bool {
	v := get(key, "")
	if v == "" {
		return fallback
	}
	return v == "true" || v == "1"
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
