import Foundation
import Observation

@MainActor
@Observable
final class AppClipModel {
    enum State: Equatable {
        case waitingForURL
        case loading
        case event(AppClipEvent)
        case camera(AppClipEvent)
        case uploading(AppClipEvent)
        case success(AppClipEvent)
        case error(title: String, message: String, canRetry: Bool)
    }

    private(set) var state: State = .waitingForURL
    private(set) var route: AppClipRoute?
    private let service: AppClipServicing

    init(service: AppClipServicing = AppClipService(testMode: AppClipConfig.isTestMode)) {
        self.service = service
    }

    func start() {
        guard case .waitingForURL = state else { return }
        if let url = AppClipConfig.launchURL {
            open(url)
        } else if AppClipConfig.isTestMode {
            open(URL(string: "https://\(AppClipConfig.associatedDomain)/e/test-event")!)
        }
    }

    func open(_ url: URL) {
        switch AppClipRouter.parse(url) {
        case .success(let parsed):
            route = parsed
            #if DEBUG
            print("[AppClip] URL: \(parsed.sourceURL.absoluteString)")
            print("[AppClip] slug=\(parsed.eventSlug), eventId=\(parsed.eventID ?? "nil"), query=\(parsed.queryParameters)")
            #endif
            Task { await load(parsed) }
        case .failure(let error):
            route = nil
            state = .error(title: "Invalid event link", message: error.localizedDescription, canRetry: false)
        }
    }

    func load(_ route: AppClipRoute? = nil) async {
        guard let route = route ?? self.route else { return }
        state = .loading
        do {
            state = .event(try await service.event(for: route))
        } catch {
            state = .error(title: "Event unavailable", message: error.localizedDescription, canRetry: true)
        }
    }

    func showCamera(for event: AppClipEvent) { state = .camera(event) }
    func returnToEvent(_ event: AppClipEvent) { state = .event(event) }

    func upload(_ data: Data, to event: AppClipEvent) {
        state = .uploading(event)
        Task {
            do {
                try await service.upload(data, to: event)
                state = .success(event)
            } catch {
                state = .error(title: "Upload failed", message: error.localizedDescription, canRetry: true)
            }
        }
    }

    func retry() {
        guard let route else { return }
        Task { await load(route) }
    }
}
