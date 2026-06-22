package storage

import (
	"context"
	"io"
	"net/url"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"oneshotonenight/api/internal/ports"
)

type PresignedStorage struct {
	Endpoint     string
	Region       string
	Bucket       string
	AccessKey    string
	SecretKey    string
	UsePathStyle bool
	client       *s3.Client
}

func (s PresignedStorage) PresignPut(ctx context.Context, objectKey, contentType string, expires time.Duration) (string, map[string]string, error) {
	client, err := s.s3Client(ctx)
	if err != nil {
		return "", nil, err
	}
	presigner := s3.NewPresignClient(client)
	out, err := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.Bucket),
		Key:         aws.String(objectKey),
		ContentType: aws.String(contentType),
	}, func(options *s3.PresignOptions) {
		options.Expires = expires
	})
	if err != nil {
		return "", nil, err
	}
	return out.URL, map[string]string{"Content-Type": contentType}, nil
}

func (s PresignedStorage) PublicURL(ctx context.Context, objectKey string) (string, error) {
	client, err := s.s3Client(ctx)
	if err != nil {
		return "", err
	}
	presigner := s3.NewPresignClient(client)
	out, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.Bucket),
		Key:    aws.String(objectKey),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", err
	}
	return out.URL, nil
}

func (s PresignedStorage) Head(ctx context.Context, objectKey string) (*ports.ObjectInfo, error) {
	client, err := s.s3Client(ctx)
	if err != nil {
		return nil, err
	}
	out, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.Bucket), Key: aws.String(objectKey)})
	if err != nil {
		return nil, err
	}
	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	size := out.ContentLength
	if size == nil {
		if value, ok := out.Metadata["content-length"]; ok {
			parsed, _ := strconv.ParseInt(value, 10, 64)
			size = &parsed
		}
	}
	var sizeBytes int64
	if size != nil {
		sizeBytes = *size
	}
	return &ports.ObjectInfo{ContentType: contentType, SizeBytes: sizeBytes}, nil
}

func (s PresignedStorage) Open(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	client, err := s.s3Client(ctx)
	if err != nil {
		return nil, err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.Bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}

func (s PresignedStorage) Promote(ctx context.Context, sourceKey, destinationKey string) error {
	client, err := s.s3Client(ctx)
	if err != nil {
		return err
	}
	_, err = client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(s.Bucket),
		CopySource: aws.String(url.PathEscape(s.Bucket + "/" + sourceKey)),
		Key:        aws.String(destinationKey),
	})
	return err
}

func (s PresignedStorage) Delete(ctx context.Context, objectKey string) error {
	client, err := s.s3Client(ctx)
	if err != nil {
		return err
	}
	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.Bucket), Key: aws.String(objectKey)})
	return err
}

func (s PresignedStorage) s3Client(ctx context.Context) (*s3.Client, error) {
	if s.client != nil {
		return s.client, nil
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(s.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(s.AccessKey, s.SecretKey, "")),
	)
	if err != nil {
		return nil, err
	}
	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(s.Endpoint)
		o.UsePathStyle = s.UsePathStyle
	}), nil
}
