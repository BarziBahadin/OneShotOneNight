import XCTest
@testable import OneShotOneNight

final class OneShotOneNightTests: XCTestCase {
    func testParsesCurrentGuestLink() throws {
        let invitation = try XCTUnwrap(EventInvitation(url: URL(string: "https://example.com/guest/summer-night?t=secret")!))
        XCTAssertEqual(invitation.slug, "summer-night")
        XCTAssertEqual(invitation.accessToken, "secret")
    }

    func testParsesLegacyGuestUploadLink() throws {
        let invitation = try XCTUnwrap(EventInvitation(url: URL(string: "https://example.com/guest-upload/summer-night?token=secret")!))
        XCTAssertEqual(invitation.slug, "summer-night")
        XCTAssertEqual(invitation.accessToken, "secret")
    }

    func testRejectsInvitationWithoutToken() {
        XCTAssertNil(EventInvitation(url: URL(string: "https://example.com/guest/summer-night")!))
    }

    func testServerDateParsesFractionalAndWholeSeconds() {
        XCTAssertNotNil(ServerDate.parse("2026-07-02T08:00:00.123Z"))
        XCTAssertNotNil(ServerDate.parse("2026-07-02T08:00:00Z"))
    }

    func testPresignResponseDecodesAcronymKeys() throws {
        let response = try decoder.decode(PresignResponse.self, from: Data(#"""
        {
            "photo_id":"photo-1",
            "object_key":"events/1/photo.jpg",
            "upload_url":"https://example.com/upload",
            "upload_headers":{"Content-Type":"image/jpeg"},
            "upload_token":"token",
            "remaining_shots":11
        }
        """#.utf8))

        XCTAssertEqual(response.photoID, "photo-1")
        XCTAssertEqual(response.uploadURL.absoluteString, "https://example.com/upload")
    }

    func testPhotoResponseDecodesImageURLs() throws {
        let photo = try decoder.decode(PhotoRecord.self, from: Data(#"""
        {
            "id":"photo-1",
            "object_key":"events/1/photo.jpg",
            "public_url":"https://example.com/photo.jpg",
            "thumbnail_url":"https://example.com/thumb.jpg",
            "preview_url":"https://example.com/preview.jpg",
            "content_type":"image/jpeg",
            "size_bytes":1024,
            "message":"",
            "status":"approved",
            "is_developed":true,
            "created_at":"2026-07-02T08:00:00Z"
        }
        """#.utf8))

        XCTAssertEqual(photo.publicURL, "https://example.com/photo.jpg")
        XCTAssertEqual(photo.thumbnailURL, "https://example.com/thumb.jpg")
        XCTAssertEqual(photo.previewURL, "https://example.com/preview.jpg")
    }

    func testUpcomingEventAvailability() {
        let now = Date(timeIntervalSince1970: 1_000)
        let event = makeEvent(startsAt: iso(now.addingTimeInterval(60)), endsAt: iso(now.addingTimeInterval(120)))
        XCTAssertEqual(EventAvailability.resolve(event: event, now: now), .upcoming(now.addingTimeInterval(60)))
    }

    func testClosedEventAvailability() {
        let now = Date(timeIntervalSince1970: 1_000)
        let event = makeEvent(status: "locked", startsAt: iso(now.addingTimeInterval(-120)), endsAt: iso(now.addingTimeInterval(120)))
        XCTAssertEqual(EventAvailability.resolve(event: event, now: now), .closed)
    }

    private func makeEvent(status: String = "open", startsAt: String, endsAt: String) -> EventRecord {
        EventRecord(id: "1", slug: "event", name: "Event", description: "", mode: "delayed_reveal", status: status,
                    startsAt: startsAt, endsAt: endsAt, revealAt: endsAt, maxGuests: 10, maxPhotosPerGuest: 12,
                    allowGalleryUploads: true, preferCameraCapture: true, allowImmediateGallery: false,
                    autoApprovePhotos: true, offlineUploadGraceHours: 24)
    }

    private func iso(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}
