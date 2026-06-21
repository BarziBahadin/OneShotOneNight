package storage

import (
	"context"
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func TestPresignPostEnforcesContentTypeAndByteRange(t *testing.T) {
	storage := PresignedStorage{
		Endpoint: "http://127.0.0.1:9000", Region: "us-east-1", Bucket: "test",
		AccessKey: "test-access", SecretKey: "test-secret", UsePathStyle: true,
	}
	_, fields, err := storage.PresignPost(context.Background(), "events/e/photos/g/p", "image/jpeg", 1234, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := base64.StdEncoding.DecodeString(fields["policy"])
	if err != nil {
		t.Fatal(err)
	}
	text := string(policy)
	if !strings.Contains(text, `["content-length-range",1,1234]`) || !strings.Contains(text, `"Content-Type":"image/jpeg"`) {
		t.Fatalf("upload policy does not contain required restrictions: %s", text)
	}
	if fields["Content-Type"] != "image/jpeg" {
		t.Fatal("content type form field is missing")
	}
}
