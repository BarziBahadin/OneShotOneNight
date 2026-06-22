import Foundation

actor APIClient {
    private let invitation: EventInvitation
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let guestToken = UUID().uuidString

    init(invitation: EventInvitation) {
        self.invitation = invitation
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        session = URLSession(configuration: configuration)
        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    func join() async throws -> JoinResponse {
        struct Body: Encodable { let accessToken: String; let displayName: String }
        return try await request(
            path: "/api/v1/guest/\(invitation.slug)/join",
            method: "POST",
            headers: ["X-Guest-Token": guestToken],
            body: Body(accessToken: invitation.accessToken, displayName: "")
        )
    }

    func upload(jpegData: Data, message: String = "") async throws -> RegisterPhotoResponse {
        struct PresignBody: Encodable {
            let accessToken: String
            let fileName: String
            let contentType: String
            let sizeBytes: Int
        }
        let presign: PresignResponse = try await request(
            path: "/api/v1/guest/\(invitation.slug)/uploads/presign",
            method: "POST",
            headers: ["Idempotency-Key": UUID().uuidString, "X-Guest-Token": guestToken],
            body: PresignBody(accessToken: invitation.accessToken, fileName: "photo-\(UUID().uuidString).jpg", contentType: "image/jpeg", sizeBytes: jpegData.count)
        )
        try await signedUpload(data: jpegData, presign: presign)

        struct RegisterBody: Encodable {
            let accessToken: String
            let photoID: String
            let uploadToken: String
            let message: String
        }
        return try await request(
            path: "/api/v1/guest/\(invitation.slug)/photos",
            method: "POST",
            headers: ["X-Guest-Token": guestToken],
            body: RegisterBody(accessToken: invitation.accessToken, photoID: presign.photoID, uploadToken: presign.uploadToken, message: message)
        )
    }

    func gallery() async throws -> GalleryResponse {
        try await request(
            path: "/api/v1/gallery/\(invitation.slug)",
            method: "GET",
            headers: ["Authorization": "Bearer \(invitation.accessToken)"],
            body: Optional<String>.none
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        headers: [String: String] = [:],
        body: Body?
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: invitation.apiBaseURL) else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        if let body { request.httpBody = try encoder.encode(body) }
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(Response.self, from: data)
    }

    private func signedUpload(data: Data, presign: PresignResponse) async throws {
        var request = URLRequest(url: presign.uploadURL)
        request.httpMethod = "PUT"
        presign.uploadHeaders.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.httpBody = data
        let (responseData, response) = try await session.data(for: request)
        try validate(response: response, data: responseData)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard 200..<300 ~= http.statusCode else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw APIError.server(status: http.statusCode, message: message ?? "Request failed")
        }
    }
}

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "The event link is invalid."
        case .invalidResponse: "The server returned an invalid response."
        case let .server(_, message): message
        }
    }
}
