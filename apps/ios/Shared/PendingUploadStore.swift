import Foundation

struct PendingUpload: Codable, Identifiable, Sendable {
    let id: UUID
    let eventSlug: String
    let displayName: String
    let message: String
    let createdAt: Date
    let imageFileName: String
}

actor PendingUploadStore {
    static let shared = PendingUploadStore()
    private let directory: URL

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        directory = base.appendingPathComponent("PendingUploads", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func enqueue(data: Data, eventSlug: String, displayName: String, message: String) throws -> PendingUpload {
        let id = UUID()
        let item = PendingUpload(id: id, eventSlug: eventSlug, displayName: displayName, message: message, createdAt: .now, imageFileName: "\(id.uuidString).jpg")
        try data.write(to: directory.appendingPathComponent(item.imageFileName), options: .atomic)
        try JSONEncoder().encode(item).write(to: metadataURL(id), options: .atomic)
        return item
    }

    func items(eventSlug: String) -> [PendingUpload] {
        let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return urls.filter { $0.pathExtension == "json" }.compactMap { url in
            guard let data = try? Data(contentsOf: url),
                  let item = try? JSONDecoder().decode(PendingUpload.self, from: data),
                  item.eventSlug == eventSlug else { return nil }
            return item
        }.sorted { $0.createdAt < $1.createdAt }
    }

    func data(for item: PendingUpload) throws -> Data {
        try Data(contentsOf: directory.appendingPathComponent(item.imageFileName))
    }

    func remove(_ item: PendingUpload) {
        try? FileManager.default.removeItem(at: directory.appendingPathComponent(item.imageFileName))
        try? FileManager.default.removeItem(at: metadataURL(item.id))
    }

    private func metadataURL(_ id: UUID) -> URL {
        directory.appendingPathComponent("\(id.uuidString).json")
    }
}
