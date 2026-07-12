import Foundation

struct AppClipEvent: Equatable, Sendable {
    let id: String?
    let slug: String
    let name: String
    let hostName: String
    let remainingPhotos: Int

    static func sample(slug: String = "test-event") -> AppClipEvent {
        AppClipEvent(id: "test-event-id", slug: slug, name: "Test Party", hostName: "Demo Host", remainingPhotos: 25)
    }
}

enum AppClipServiceError: LocalizedError {
    case backendUnavailable
    case uploadFailed

    var errorDescription: String? {
        switch self {
        case .backendUnavailable: "The event service is unavailable. Please try again."
        case .uploadFailed: "Your photo could not be uploaded. Please try again."
        }
    }
}

protocol AppClipServicing: Sendable {
    func event(for route: AppClipRoute) async throws -> AppClipEvent
    func upload(_ jpegData: Data, to event: AppClipEvent) async throws
}

struct AppClipService: AppClipServicing {
    let testMode: Bool

    func event(for route: AppClipRoute) async throws -> AppClipEvent {
        if testMode {
            try await Task.sleep(for: .milliseconds(350))
            return .sample(slug: route.eventSlug)
        }
        throw AppClipServiceError.backendUnavailable
    }

    func upload(_ jpegData: Data, to event: AppClipEvent) async throws {
        guard !jpegData.isEmpty else { throw AppClipServiceError.uploadFailed }
        if testMode {
            try await Task.sleep(for: .milliseconds(900))
            return
        }
        throw AppClipServiceError.backendUnavailable
    }
}
