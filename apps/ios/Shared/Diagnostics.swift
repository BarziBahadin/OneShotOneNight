import OSLog

enum Diagnostics {
    private static let network = Logger(subsystem: "com.barzibahadin.nightframe", category: "network")
    private static let uploads = Logger(subsystem: "com.barzibahadin.nightframe", category: "uploads")

    static func apiFailure(status: Int, code: String) {
        network.error("API request failed status=\(status, privacy: .public) code=\(code, privacy: .public)")
    }

    static func uploadQueued() { uploads.notice("Photo retained in the pending upload queue") }
    static func uploadCompleted() { uploads.notice("Pending photo upload completed") }
}
