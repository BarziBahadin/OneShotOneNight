package storage

import (
	"context"
	"testing"
	"time"
)

func TestPresignPutSignsContentType(t *testing.T) {
	storage := PresignedStorage{
		Endpoint: "http://127.0.0.1:9000", Region: "us-east-1", Bucket: "test",
		AccessKey: "test-access", SecretKey: "test-secret", UsePathStyle: true,
	}
	url, headers, err := storage.PresignPut(context.Background(), "events/e/photos/g/p", "image/jpeg", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if url == "" || headers["Content-Type"] != "image/jpeg" {
		t.Fatal("signed URL or required content type header is missing")
	}
}
