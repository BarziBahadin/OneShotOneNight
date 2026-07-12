import Foundation

struct AppClipRoute: Equatable, Sendable {
    let eventSlug: String
    let eventID: String?
    let sourceURL: URL
    let queryParameters: [String: String]
}

enum AppClipRouteError: LocalizedError, Equatable {
    case invalidURL
    case unsupportedPath
    case missingEventSlug

    var errorDescription: String? {
        switch self {
        case .invalidURL: "This event link is invalid."
        case .unsupportedPath: "This link does not open an event."
        case .missingEventSlug: "This event link is missing its event name."
        }
    }
}

enum AppClipRouter {
    static func parse(_ url: URL) -> Result<AppClipRoute, AppClipRouteError> {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
              components.host != nil else { return .failure(.invalidURL) }
        let parts = components.path.split(separator: "/").map(String.init)
        guard let prefix = parts.first, ["e", "clip"].contains(prefix) else {
            return .failure(.unsupportedPath)
        }
        guard parts.count > 1, !parts[1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .failure(.missingEventSlug)
        }
        let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        let eventID = query["eventId"] ?? query["event_id"] ?? query["id"]
        return .success(AppClipRoute(eventSlug: parts[1], eventID: eventID, sourceURL: url, queryParameters: query))
    }
}
