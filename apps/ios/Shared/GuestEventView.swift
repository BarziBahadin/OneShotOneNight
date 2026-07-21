import PhotosUI
import SwiftUI
import UIKit

typealias GuestEventView = PartyFilmRootView

struct PartyFilmRootView: View {
    let invitation: EventInvitation
    let onClose: () -> Void
    @State private var model: GuestEventModel
    @State private var showsCameraGallery = false
    @Environment(\.scenePhase) private var scenePhase

    init(invitation: EventInvitation, onClose: @escaping () -> Void) {
        self.invitation = invitation
        self.onClose = onClose
        _model = State(initialValue: GuestEventModel(invitation: invitation))
    }

    #if DEBUG
    init(previewEvent: EventRecord) {
        let previewURL = URL(string: "https://oneshotonenight.app/guest/layout-preview?t=preview")!
        let invitation = EventInvitation(url: previewURL)!
        self.invitation = invitation
        onClose = {}
        _model = State(initialValue: GuestEventModel(invitation: invitation, previewEvent: previewEvent))
    }
    #endif

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if let event = model.event {
                GuestLandingView(event: event, model: model, onClose: onClose)
            } else if let error = model.errorMessage {
                ErrorState(message: error) { Task { await model.join() } }
            } else {
                ProgressView("Opening invitation…")
                    .tint(.white)
                    .foregroundStyle(.white)
            }
        }
        .task { await model.join() }
        .fullScreenCover(isPresented: $model.showsCamera) {
            CameraCaptureView(
                eventName: model.event?.name ?? "OneShot OneNight",
                remainingShots: model.remainingShots,
                maxShots: model.event?.maxPhotosPerGuest ?? max(model.remainingShots, 1),
                revealDate: model.event?.revealDate,
                invitationURL: model.invitation.sourceURL,
                isUploading: model.isUploading,
                uploadWarning: model.uploadError,
                coverURL: model.event?.coverURL,
                latestPhotoData: model.latestCaptureData,
                onOpenGallery: model.galleryAvailable ? {
                    showsCameraGallery = true
                } : nil
            ) { data in
                model.queueCameraCapture(data)
            }
            .fullScreenCover(isPresented: $showsCameraGallery) {
                GalleryView(model: model)
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { model.reviewImageData != nil },
            set: { if !$0 { model.reviewImageData = nil } }
        )) {
            if let data = model.reviewImageData {
                PhotoReviewView(data: data, isUploading: model.isUploading) {
                    model.reviewImageData = nil
                    model.showsCamera = true
                } onUse: { message in
                    Task { await model.upload(data, message: message) }
                }
            }
        }
        .fullScreenCover(isPresented: $model.showsGallery) { GalleryView(model: model) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refresh() } }
        }
        .preferredColorScheme(.dark)
    }
}

struct GuestLandingView: View {
    let event: EventRecord
    @Bindable var model: GuestEventModel
    let onClose: () -> Void
    @State private var now = Date.now
    @State private var draftName: String
    @State private var heroVisible = false

    init(event: EventRecord, model: GuestEventModel, onClose: @escaping () -> Void) {
        self.event = event
        self.model = model
        self.onClose = onClose
        _draftName = State(initialValue: model.displayName)
    }

    private var trimmedName: String { draftName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hoursLeft: Int { max(Int(event.revealDate.timeIntervalSince(now) / 3_600), 0) }

    var body: some View {
        if model.remainingShots == 0 {
            FilmFinishedView(
                event: event,
                galleryAvailable: model.galleryAvailable,
                isFinishingUpload: model.isUploading || model.pendingUploadCount > 0,
                uploadNeedsRetry: model.uploadError != nil && model.pendingUploadCount > 0,
                onViewGallery: { model.showsGallery = true },
                onRetryUpload: { Task { await model.retryPendingUploads() } },
                onClose: onClose
            )
        } else {
            GeometryReader { proxy in
            let fullWidth = proxy.size.width + proxy.safeAreaInsets.leading + proxy.safeAreaInsets.trailing
            let fullHeight = proxy.size.height + proxy.safeAreaInsets.top + proxy.safeAreaInsets.bottom
            let contentWidth = min(max(proxy.size.width - 64, 0), 560)

            ZStack(alignment: .bottom) {
                EventBackdropImage(url: event.coverURL)
                    .frame(width: fullWidth, height: fullHeight)
                    .clipped()
                    .offset(
                        x: (proxy.safeAreaInsets.trailing - proxy.safeAreaInsets.leading) / 2,
                        y: (proxy.safeAreaInsets.bottom - proxy.safeAreaInsets.top) / 2
                    )
                    .scaleEffect(heroVisible ? 1 : 1.04)
                    .opacity(heroVisible ? 1 : 0)

                LinearGradient(
                    colors: [.black.opacity(0.05), .black.opacity(0.25), .black.opacity(0.96)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(width: fullWidth, height: fullHeight)
                .offset(
                    x: (proxy.safeAreaInsets.trailing - proxy.safeAreaInsets.leading) / 2,
                    y: (proxy.safeAreaInsets.bottom - proxy.safeAreaInsets.top) / 2
                )

                VStack(spacing: 20) {
                    Spacer(minLength: 120)

                    HStack(spacing: 9) {
                        Image(systemName: "person.2.fill")
                        Text("Invited by the host")
                    }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 44)
                    .background(.gray.opacity(0.72), in: Capsule())

                    Text(event.name)
                        .font(.system(size: 46, weight: .regular, design: .serif))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.72)

                    EventMetadataRow(
                        firstIcon: "clock",
                        firstText: hoursLeft > 0 ? "\(hoursLeft) hours left" : "Revealing soon",
                        secondIcon: "camera.fill",
                        secondText: "\(model.remainingShots) shots available"
                    )

                    if model.displayName.isEmpty {
                        HStack(spacing: 14) {
                            Image(systemName: "pencil")
                                .foregroundStyle(Theme.textMedium)
                            TextField("Enter your name", text: $draftName)
                                .font(.system(size: 17, weight: .medium))
                                .textInputAutocapitalization(.words)
                                .submitLabel(.continue)
                                .onSubmit(openCamera)
                        }
                        .padding(.horizontal, 22)
                        .frame(height: 72)
                        .background(Theme.surface.opacity(0.94), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.surfaceStroke))
                    } else {
                        HStack(spacing: 14) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.black)
                                .frame(width: 30, height: 30)
                                .background(Theme.accentGreen, in: Circle())
                            Text("Welcome back, \(model.displayName)!")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(.white)
                            Spacer()
                        }
                        .padding(.horizontal, 20)
                        .frame(height: 72)
                        .background(Theme.successSurface.opacity(0.96), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Theme.accentGreen.opacity(0.45)))
                    }

                    PrimaryCapsuleButton(
                        title: model.isUploading ? "Uploading…" : "Take your camera",
                        systemImage: "arrow.right",
                        isEnabled: model.displayName.isEmpty ? !trimmedName.isEmpty : model.canUpload,
                        action: openCamera
                    )
                    .accessibilityLabel("Take your camera")
                    .accessibilityHint("Double tap to open the camera and add a photo to this party")

                    if model.galleryAvailable {
                        Button { model.showsGallery = true } label: {
                            Label("View the party film", systemImage: "photo.stack.fill")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.88))
                                .frame(minHeight: 44)
                        }
                    }

                    if model.pendingUploadCount > 0 {
                        Button("Retry \(model.pendingUploadCount) pending upload\(model.pendingUploadCount == 1 ? "" : "s")") {
                            Task { await model.retryPendingUploads() }
                        }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.memoryYellow)
                        .frame(minHeight: 44)
                    }
                }
                .frame(width: contentWidth)
                .padding(.bottom, max(proxy.safeAreaInsets.bottom, 24) + 14)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .overlay(alignment: .topLeading) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 48, height: 48)
                    .background(.black.opacity(0.4), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close invitation")
            .padding(.leading, 20)
            .padding(.top, 10)
        }
        .onAppear {
            withAnimation(.spring(response: 0.9, dampingFraction: 0.88)) { heroVisible = true }
        }
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { now = $0 }
            .alert("Couldn’t upload", isPresented: Binding(
                get: { model.uploadError != nil },
                set: { if !$0 { model.uploadError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(model.uploadError ?? "Please try again.")
            }
        }
    }

    private func openCamera() {
        if model.displayName.isEmpty {
            guard !trimmedName.isEmpty else { return }
            model.saveDisplayName(trimmedName)
        }
        guard model.canUpload else { return }
        model.showsCamera = true
    }
}

private struct FilmFinishedView: View {
    let event: EventRecord
    let galleryAvailable: Bool
    let isFinishingUpload: Bool
    let uploadNeedsRetry: Bool
    let onViewGallery: () -> Void
    let onRetryUpload: () -> Void
    let onClose: () -> Void

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                EventBackdropImage(url: event.coverURL)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()

                LinearGradient(
                    colors: [.black.opacity(0.28), .black.opacity(0.7), .black.opacity(0.98)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                VStack(spacing: 20) {
                    Spacer()

                    ZStack {
                        Circle()
                            .fill(Theme.memoryYellow.opacity(0.16))
                            .frame(width: 96, height: 96)
                        Circle()
                            .stroke(Theme.memoryYellow.opacity(0.45), lineWidth: 1)
                            .frame(width: 96, height: 96)
                        Image(systemName: "film.stack.fill")
                            .font(.system(size: 36, weight: .medium))
                            .foregroundStyle(Theme.memoryYellow)
                    }

                    Text("Your roll is complete.")
                        .font(.system(size: 43, weight: .regular, design: .serif))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)

                    Text("Thank you for giving this night your point of view. You captured something beautiful.")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(.white.opacity(0.88))
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)

                    Text(galleryAvailable
                         ? "Your photos are safe, and the film is ready whenever you want to return to it."
                         : "Your photos are safe. Let the film develop for a little while—when the album is revealed, these moments will be waiting for you.")
                        .font(.system(size: 15))
                        .foregroundStyle(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)

                    if uploadNeedsRetry {
                        Label("Your last photo is safe and waiting to upload.", systemImage: "icloud.and.arrow.up")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.memoryYellow)
                        Button("Retry the last photo", action: onRetryUpload)
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(minHeight: 44)
                    } else if isFinishingUpload {
                        Label("Finishing your last photo…", systemImage: "icloud.and.arrow.up")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.memoryYellow)
                    }

                    PrimaryCapsuleButton(
                        title: galleryAvailable ? "View the party film" : "Done for tonight",
                        systemImage: galleryAvailable ? "photo.stack.fill" : "heart.fill",
                        action: galleryAvailable ? onViewGallery : onClose
                    )

                    if galleryAvailable {
                        Button("Close") { onClose() }
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.72))
                            .frame(minHeight: 44)
                    }

                    Spacer().frame(height: max(proxy.safeAreaInsets.bottom, 18))
                }
                .frame(maxWidth: 520)
                .padding(.horizontal, 34)
            }
        }
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
        .accessibilityElement(children: .contain)
    }
}

private struct ErrorState: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(Theme.memoryYellow)
            Text("Invitation unavailable")
                .font(Theme.display(30))
            Text(message)
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.62))
                .multilineTextAlignment(.center)
            PrimaryCapsuleButton(title: "Try again", action: retry)
        }
        .padding(30)
    }
}

@MainActor
@Observable
final class GuestEventModel {
    let invitation: EventInvitation
    private let client: APIClient
    var event: EventRecord?
    var remainingShots = 0
    var galleryAvailable = false
    var errorMessage: String?
    var uploadError: String?
    var isUploading = false
    var showsCamera = false
    var showsGallery = false
    var reviewImageData: Data?
    var latestCaptureData: Data?
    var photos: [PhotoRecord] = []
    var displayName: String
    var pendingUploadCount = 0
    var nextGalleryCursor: String?
    var galleryError: String?
    var isLoadingGallery = false

    var availability: EventAvailability { event.map { EventAvailability.resolve(event: $0) } ?? .closed }
    var canUpload: Bool {
        guard !isUploading, remainingShots > 0, !displayName.isEmpty else { return false }
        switch availability { case .open, .gracePeriod: return true; default: return false }
    }

    init(invitation: EventInvitation, previewEvent: EventRecord? = nil) {
        self.invitation = invitation
        client = APIClient(invitation: invitation)
        event = previewEvent
        remainingShots = previewEvent?.maxPhotosPerGuest ?? 0
        galleryAvailable = previewEvent != nil
        displayName = previewEvent == nil ? (UserDefaults.standard.string(forKey: "guest-display-name") ?? "") : ""
        Task { await updatePendingCount() }
    }

    func join() async {
        guard event == nil else { return }
        errorMessage = nil
        do {
            let response = try await client.join(displayName: displayName)
            event = response.event
            remainingShots = response.remainingShots
            galleryAvailable = response.galleryAvailable
            if !response.guestName.isEmpty { displayName = response.guestName }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        do {
            let response = try await client.join(displayName: displayName)
            event = response.event
            remainingShots = response.remainingShots
            galleryAvailable = response.galleryAvailable
        } catch {
            errorMessage = error.localizedDescription
        }
        await updatePendingCount()
        await drainPendingUploads()
    }

    func saveDisplayName(_ value: String) {
        displayName = value.trimmingCharacters(in: .whitespacesAndNewlines)
        UserDefaults.standard.set(displayName, forKey: "guest-display-name")
    }

    func upload(_ data: Data, message: String = "") async {
        guard canUpload else { return }
        latestCaptureData = data
        isUploading = true
        uploadError = nil
        let pending: PendingUpload
        do {
            pending = try await PendingUploadStore.shared.enqueue(
                data: data,
                eventSlug: invitation.slug,
                displayName: displayName,
                message: message
            )
        } catch {
            uploadError = "The photo could not be saved for upload."
            isUploading = false
            return
        }
        do {
            let dimensions = UIImage(data: data).map { (Int($0.size.width * $0.scale), Int($0.size.height * $0.scale)) }
            let response = try await client.upload(
                jpegData: data,
                displayName: displayName,
                message: message,
                width: dimensions?.0,
                height: dimensions?.1
            )
            remainingShots = response.remainingShots
            reviewImageData = nil
            await PendingUploadStore.shared.remove(pending)
            Diagnostics.uploadCompleted()
        } catch {
            uploadError = error.localizedDescription
            Diagnostics.uploadQueued()
        }
        isUploading = false
        await updatePendingCount()
    }

    func queueCameraCapture(_ data: Data) {
        guard remainingShots > 0, !displayName.isEmpty else { return }
        latestCaptureData = data
        remainingShots -= 1
        uploadError = nil

        Task {
            do {
                _ = try await PendingUploadStore.shared.enqueue(
                    data: data,
                    eventSlug: invitation.slug,
                    displayName: displayName,
                    message: ""
                )
                await updatePendingCount()
                await drainPendingUploads()
            } catch {
                uploadError = "The captured photo could not be queued for upload."
            }
        }
    }

    private func drainPendingUploads() async {
        guard !isUploading else { return }
        isUploading = true
        defer { isUploading = false }

        while true {
            guard let item = await PendingUploadStore.shared.items(eventSlug: invitation.slug).first else { break }
            var uploadedResponse: RegisterPhotoResponse?
            for attempt in 0..<3 {
                do {
                    uploadedResponse = try await uploadPendingItem(item)
                    break
                } catch {
                    if attempt < 2 {
                        try? await Task.sleep(for: .seconds(1 << attempt))
                    }
                }
            }

            if let response = uploadedResponse {
                remainingShots = min(remainingShots, response.remainingShots)
                await PendingUploadStore.shared.remove(item)
                if galleryAvailable, !photos.contains(where: { $0.id == response.photo.id }) {
                    photos.insert(response.photo, at: 0)
                }
                Diagnostics.uploadCompleted()
                uploadError = nil
                await updatePendingCount()
            } else {
                uploadError = "A photo is waiting to upload. It will retry automatically."
                Diagnostics.uploadQueued()
                break
            }
        }
    }

    private func uploadPendingItem(_ item: PendingUpload) async throws -> RegisterPhotoResponse {
        let data = try await PendingUploadStore.shared.data(for: item)
        let dimensions = UIImage(data: data).map {
            (Int($0.size.width * $0.scale), Int($0.size.height * $0.scale))
        }
        return try await client.upload(
            jpegData: data,
            displayName: item.displayName,
            message: item.message,
            width: dimensions?.0,
            height: dimensions?.1
        )
    }

    func retryPendingUploads() async {
        uploadError = nil
        await drainPendingUploads()
        await updatePendingCount()
    }

    private func updatePendingCount() async {
        pendingUploadCount = await PendingUploadStore.shared.items(eventSlug: invitation.slug).count
    }

    func loadGallery(reset: Bool = true) async {
        guard !isLoadingGallery else { return }
        isLoadingGallery = true
        galleryError = nil
        do {
            let response = try await client.gallery(before: reset ? nil : nextGalleryCursor)
            photos = reset ? response.photos : photos + response.photos.filter { photo in
                !photos.contains(where: { $0.id == photo.id })
            }
            nextGalleryCursor = response.nextCursor
            galleryAvailable = true
        } catch {
            galleryError = error.localizedDescription
        }
        isLoadingGallery = false
    }
}

#if DEBUG
private extension GuestEventModel {
    static func landingPreview(joined: Bool) -> GuestEventModel {
        let url = URL(string: "https://oneshotonenight.app/guest/once-party-2026?t=preview")!
        let model = GuestEventModel(invitation: EventInvitation(url: url)!, previewEvent: .layoutPreview)
        if joined { model.saveDisplayName("Yebin") }
        return model
    }
}

#Preview("Guest landing — joined") {
    GuestLandingView(event: .layoutPreview, model: .landingPreview(joined: true), onClose: {})
        .preferredColorScheme(.dark)
}

#Preview("Guest landing — not joined") {
    GuestLandingView(event: .layoutPreview, model: .landingPreview(joined: false), onClose: {})
        .preferredColorScheme(.dark)
}
#endif
