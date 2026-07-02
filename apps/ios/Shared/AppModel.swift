import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    var invitation: EventInvitation?
    private let activeInvitationKey = "active-invitation-url"

    init() {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "--invitation-url"),
           arguments.indices.contains(index + 1),
           let url = URL(string: arguments[index + 1]) {
            invitation = EventInvitation(url: url)
        }
        #endif
        if invitation == nil,
           let saved = SecureStore.string(for: activeInvitationKey),
           let url = URL(string: saved) {
            invitation = EventInvitation(url: url)
        }
    }

    func open(_ url: URL) {
        guard let parsed = EventInvitation(url: url) else { return }
        invitation = parsed
        SecureStore.set(url.absoluteString, for: activeInvitationKey)
    }

    func closeInvitation() {
        invitation = nil
        SecureStore.remove(activeInvitationKey)
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
        } else if let guestIndex = parts.firstIndex(where: { $0 == "guest" || $0 == "guest-upload" }), parts.indices.contains(guestIndex + 1) {
            slug = parts[guestIndex + 1]
        } else {
            slug = nil
        }
        guard let slug, !slug.isEmpty else { return nil }
        guard let token = components?.queryItems?.first(where: { $0.name == "t" || $0.name == "token" })?.value,
              !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }

        if url.scheme == "http" || url.scheme == "https" {
            guard let scheme = url.scheme, let host = url.host else { return nil }
            var base = URLComponents()
            base.scheme = scheme
            base.host = host
            base.port = url.port
            guard let apiURL = base.url else { return nil }
            apiBaseURL = AppConfiguration.apiBaseURL ?? apiURL
        } else {
            #if DEBUG
            guard let fallback = URL(string: "http://127.0.0.1:3000") else { return nil }
            #else
            guard let fallback = URL(string: "https://oneshotonenight.app") else { return nil }
            #endif
            apiBaseURL = AppConfiguration.apiBaseURL ?? fallback
        }
        self.slug = slug
        accessToken = token
        sourceURL = url
    }
}
