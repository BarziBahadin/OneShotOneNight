import Foundation

enum AppConfiguration {
    static var apiBaseURL: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
              !value.isEmpty else { return nil }
        return URL(string: value)
    }

    static var publicWebURL: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "PublicWebURL") as? String,
              !value.isEmpty else { return nil }
        return URL(string: value)
    }
}
