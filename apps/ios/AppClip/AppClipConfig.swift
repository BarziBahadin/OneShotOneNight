import Foundation

enum AppClipConfig {
    static var associatedDomain: String {
        (Bundle.main.object(forInfoDictionaryKey: "AppClipAssociatedDomain") as? String)
            .flatMap { $0.isEmpty || $0.contains("$(") ? nil : $0 } ?? "example.com"
    }

    static var isTestMode: Bool {
        if let value = ProcessInfo.processInfo.environment["APP_CLIP_TEST_MODE"] {
            return ["1", "true", "yes"].contains(value.lowercased())
        }
        let value = Bundle.main.object(forInfoDictionaryKey: "AppClipTestMode") as? String
        return value?.lowercased() == "true"
    }

    static var launchURL: URL? {
        ProcessInfo.processInfo.environment["_XCAppClipURL"].flatMap(URL.init(string:))
    }

    static func fullAppURL(eventSlug: String) -> URL {
        URL(string: "https://\(associatedDomain)/e/\(eventSlug)?open=full-app")!
    }
}
