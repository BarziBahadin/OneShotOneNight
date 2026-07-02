import Foundation

struct EventRecord: Codable, Hashable, Sendable {
    let id: String
    let slug: String
    let name: String
    let description: String
    let mode: String
    let status: String
    let startsAt: String
    let endsAt: String
    let revealAt: String
    let maxGuests: Int
    let maxPhotosPerGuest: Int
    let allowGalleryUploads: Bool
    let preferCameraCapture: Bool
    let allowImmediateGallery: Bool
    let autoApprovePhotos: Bool
    let offlineUploadGraceHours: Int

    var revealDate: Date { ServerDate.parse(revealAt) ?? .now }
    var startDate: Date { ServerDate.parse(startsAt) ?? .now }
}

#if DEBUG
extension EventRecord {
    static let layoutPreview = EventRecord(
        id: "preview", slug: "layout-preview", name: "Jackson & Lisa’s Celebration",
        description: "Share the evening from your point of view.", mode: "live_gallery", status: "open",
        startsAt: "2026-07-02T18:00:00Z", endsAt: "2026-07-03T00:00:00Z", revealAt: "2026-07-02T18:00:00Z",
        maxGuests: 250, maxPhotosPerGuest: 49, allowGalleryUploads: true, preferCameraCapture: true,
        allowImmediateGallery: true, autoApprovePhotos: true, offlineUploadGraceHours: 24
    )
}
#endif

struct PhotoRecord: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let objectKey: String
    let publicURL: String?
    let thumbnailURL: String?
    let previewURL: String?
    let contentType: String
    let sizeBytes: Int
    let message: String?
    let status: String
    let isDeveloped: Bool
    let createdAt: String

    private enum CodingKeys: String, CodingKey {
        case id
        case objectKey
        case publicURL = "publicUrl"
        case thumbnailURL = "thumbnailUrl"
        case previewURL = "previewUrl"
        case contentType
        case sizeBytes
        case message
        case status
        case isDeveloped
        case createdAt
    }
}

struct JoinResponse: Codable, Sendable {
    let event: EventRecord
    let guestName: String
    let remainingShots: Int
    let galleryAvailable: Bool
}

struct PresignResponse: Codable, Sendable {
    let photoID: String
    let objectKey: String
    let uploadURL: URL
    let uploadHeaders: [String: String]
    let uploadToken: String
    let remainingShots: Int

    private enum CodingKeys: String, CodingKey {
        case photoID = "photoId"
        case objectKey
        case uploadURL = "uploadUrl"
        case uploadHeaders
        case uploadToken
        case remainingShots
    }
}

struct RegisterPhotoResponse: Codable, Sendable {
    let photo: PhotoRecord
    let remainingShots: Int
}

struct GalleryResponse: Codable, Sendable {
    let event: EventRecord
    let photos: [PhotoRecord]
    let nextCursor: String?
}

enum EventAvailability: Equatable {
    case upcoming(Date)
    case open
    case gracePeriod(Date)
    case closed

    static func resolve(event: EventRecord, now: Date = .now) -> EventAvailability {
        let start = ServerDate.parse(event.startsAt) ?? now
        let end = ServerDate.parse(event.endsAt) ?? now
        if now < start { return .upcoming(start) }
        if event.status != "open" { return .closed }
        if now <= end { return .open }
        let graceEnd = end.addingTimeInterval(Double(event.offlineUploadGraceHours) * 3_600)
        return now <= graceEnd ? .gracePeriod(graceEnd) : .closed
    }
}

enum ServerDate {
    static func parse(_ value: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
