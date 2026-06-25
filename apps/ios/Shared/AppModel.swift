import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    var invitation: EventInvitation?

    init() {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "--invitation-url"),
           arguments.indices.contains(index + 1),
           let url = URL(string: arguments[index + 1]) {
            invitation = EventInvitation(url: url)
        }
        #endif
    }

    func open(_ url: URL) {
        invitation = EventInvitation(url: url)
    }
}

struct EventInvitation: Hashable, Sendable {
    let slug: String
    let accessToken: String
    let apiBaseURL: URL
    let sourceURL: URL

    init?(url: URL) {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let parts = url.pathComponents.filter { $0 != "/" }
        let slug: String?
        if url.scheme == "oneshot", url.host == "guest" {
            slug = parts.first
        } else if let guestIndex = parts.firstIndex(of: "guest"), parts.indices.contains(guestIndex + 1) {
            slug = parts[guestIndex + 1]
        } else {
            slug = nil
        }
        guard let slug, !slug.isEmpty else { return nil }
        guard let token = components?.queryItems?.first(where: { $0.name == "t" })?.value,
              !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }

        if url.scheme == "http" || url.scheme == "https" {
            guard let scheme = url.scheme, let host = url.host else { return nil }
            var base = URLComponents()
            base.scheme = scheme
            base.host = host
            base.port = url.port
            guard let apiURL = base.url else { return nil }
            apiBaseURL = URL(string: "https://huakafctiajezinrzfle.supabase.co/functions/v1/api") ?? apiURL
        } else {
            #if DEBUG
            guard let fallback = URL(string: "http://127.0.0.1:3000") else { return nil }
            #else
            guard let fallback = URL(string: "https://oneshotonenight.app") else { return nil }
            #endif
            apiBaseURL = URL(string: "https://huakafctiajezinrzfle.supabase.co/functions/v1/api") ?? fallback
        }
        self.slug = slug
        accessToken = token
        sourceURL = url
    }
}
