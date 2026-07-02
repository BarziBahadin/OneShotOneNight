import Foundation

actor APIClient {
    private let invitation: EventInvitation
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let guestToken = GuestIdentity.token

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

    func join(displayName: String = "") async throws -> JoinResponse {
        struct Body: Encodable { let accessToken: String; let displayName: String }
        return try await request(
            path: "/api/v1/guest/\(invitation.slug)/join",
            method: "POST",
            headers: ["X-Guest-Token": guestToken],
            body: Body(accessToken: invitation.accessToken, displayName: displayName)
        )
    }

    func upload(jpegData: Data, displayName: String, message: String = "", width: Int? = nil, height: Int? = nil) async throws -> RegisterPhotoResponse {
        struct PresignBody: Encodable {
            let accessToken: String
            let fileName: String
            let contentType: String
            let sizeBytes: Int
            let displayName: String
        }
        let presign: PresignResponse = try await request(
            path: "/api/v1/guest/\(invitation.slug)/uploads/presign",
            method: "POST",
            headers: ["Idempotency-Key": UUID().uuidString, "X-Guest-Token": guestToken],
            body: PresignBody(accessToken: invitation.accessToken, fileName: "photo-\(UUID().uuidString).jpg", contentType: "image/jpeg", sizeBytes: jpegData.count, displayName: displayName)
        )
        try await signedUpload(data: jpegData, presign: presign)

        struct RegisterBody: Encodable {
            let accessToken: String
            let photoID: String
            let uploadToken: String
            let message: String
            let displayName: String
            let widthPx: Int?
            let heightPx: Int?
        }
        return try await request(
            path: "/api/v1/guest/\(invitation.slug)/photos",
            method: "POST",
            headers: ["X-Guest-Token": guestToken],
            body: RegisterBody(accessToken: invitation.accessToken, photoID: presign.photoID, uploadToken: presign.uploadToken, message: message, displayName: displayName, widthPx: width, heightPx: height)
        )
    }

    func gallery(before cursor: String? = nil, limit: Int = 24) async throws -> GalleryResponse {
        try await request(
            path: "/api/v1/gallery/\(invitation.slug)",
            method: "GET",
            headers: ["Authorization": "Bearer \(invitation.accessToken)"],
            queryItems: [URLQueryItem(name: "limit", value: String(limit)), cursor.map { URLQueryItem(name: "before", value: $0) }].compactMap { $0 },
            body: Optional<String>.none
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        headers: [String: String] = [:],
        queryItems: [URLQueryItem] = [],
        body: Body?
    ) async throws -> Response {
        guard let baseURL = endpointURL(path: path),
              var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { throw APIError.invalidURL }
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components.url else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        if let body { request.httpBody = try encoder.encode(body) }
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(Response.self, from: data)
    }

    private func endpointURL(path: String) -> URL? {
        let components = path.split(separator: "/", omittingEmptySubsequences: true)
        guard !components.isEmpty else { return nil }
        return components.reduce(invitation.apiBaseURL) { url, component in
            url.appendingPathComponent(String(component))
        }
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
            let payload = try? decoder.decode(APIErrorPayload.self, from: data)
            let code = payload?.error ?? "request_failed"
            Diagnostics.apiFailure(status: http.statusCode, code: code)
            throw APIError.server(status: http.statusCode, code: code, message: payload?.message ?? "Request failed")
        }
    }
}

private struct APIErrorPayload: Decodable {
    let message: String
    let error: String
}

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case server(status: Int, code: String, message: String)

    var code: String? {
        if case let .server(_, code, _) = self { return code }
        return nil
    }

    var errorDescription: String? {
        switch self {
        case .invalidURL: "The event link is invalid."
        case .invalidResponse: "The server returned an invalid response."
        case let .server(_, _, message): message
        }
    }
}
