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

struct PhotoRecord: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let objectKey: String
    let publicURL: String?
    let contentType: String
    let sizeBytes: Int
    let message: String?
    let status: String
    let isDeveloped: Bool
    let createdAt: String
}

struct JoinResponse: Codable, Sendable {
    let event: EventRecord
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
}

struct RegisterPhotoResponse: Codable, Sendable {
    let photo: PhotoRecord
    let remainingShots: Int
}

struct GalleryResponse: Codable, Sendable {
    let event: EventRecord
    let photos: [PhotoRecord]
}

enum ServerDate {
    static func parse(_ value: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
