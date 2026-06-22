import SwiftUI

struct GuestEventView: View {
    let invitation: EventInvitation
    let onClose: () -> Void
    @State private var model: GuestEventModel

    init(invitation: EventInvitation, onClose: @escaping () -> Void) {
        self.invitation = invitation
        self.onClose = onClose
        _model = State(initialValue: GuestEventModel(invitation: invitation))
    }

    var body: some View {
        ZStack {
            EventBackdropImage().ignoresSafeArea()
            LinearGradient(
                stops: [.init(color: .black.opacity(0.16), location: 0), .init(color: .black.opacity(0.18), location: 0.31), .init(color: .black.opacity(0.92), location: 0.74), .init(color: .black, location: 1)],
                startPoint: .top, endPoint: .bottom
            ).ignoresSafeArea()

            Group {
                if let event = model.event {
                    EventContent(event: event, model: model, onClose: onClose)
                } else if let error = model.errorMessage {
                    ErrorState(message: error) { Task { await model.join() } }
                } else {
                    ProgressView("Opening invitation…").tint(.white)
                }
            }
        }
        .task { await model.join() }
        .fullScreenCover(isPresented: $model.showsCamera) {
            CameraCaptureView(
                eventName: model.event?.name ?? "OneShot OneNight",
                remainingShots: model.remainingShots,
                maxShots: model.event?.maxPhotosPerGuest ?? max(model.remainingShots, 1),
                revealDate: model.event?.revealDate,
                onOpenGallery: model.galleryAvailable ? {
                    model.showsCamera = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        model.showsGallery = true
                    }
                } : nil
            ) { data in
                model.showsCamera = false
                model.reviewImageData = data
            }
        }
        .fullScreenCover(isPresented: Binding(get: { model.reviewImageData != nil }, set: { if !$0 { model.reviewImageData = nil } })) {
            if let data = model.reviewImageData {
                PhotoReviewView(data: data, isUploading: model.isUploading) {
                    model.reviewImageData = nil
                    model.showsCamera = true
                } onUse: {
                    Task { await model.upload(data) }
                }
            }
        }
        .fullScreenCover(isPresented: $model.showsGallery) {
            GalleryView(model: model)
        }
    }
}

private struct EventContent: View {
    let event: EventRecord
    @Bindable var model: GuestEventModel
    let onClose: () -> Void
    @State private var now = Date.now
    @State private var showsInfo = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button(action: onClose) { Image(systemName: "xmark").font(.title3.weight(.medium)) }.buttonStyle(GlassCircleButton())
                Spacer()
                Button { showsInfo = true } label: { Label("Event info", systemImage: "info.circle").font(.subheadline.weight(.semibold)).padding(.horizontal, 16).frame(height: 48) }
                    .background(.black.opacity(0.5), in: Capsule()).overlay(Capsule().stroke(.white.opacity(0.12)))
            }
            Spacer(minLength: 38)

            HStack(spacing: 7) {
                Text("YOU’RE JOINED")
                Image(systemName: "lock.fill")
            }
            .font(.caption2.weight(.bold)).tracking(2.1).foregroundStyle(Theme.gold)
            Text(event.name)
                .font(Theme.display(48)).tracking(-1.6).lineLimit(1).minimumScaleFactor(0.7).padding(.top, 10)
            Text(event.startDate.formatted(.dateTime.month(.wide).day().year()))
                .font(.caption.weight(.bold)).tracking(1.2).foregroundStyle(.white.opacity(0.66)).padding(.top, 12)

            Spacer(minLength: 34)
            if model.galleryAvailable {
                Button { model.showsGallery = true } label: { Label("View the revealed album", systemImage: "sparkles").frame(maxWidth: .infinity) }
                    .buttonStyle(PrimaryButtonStyle())
            } else {
                CountdownView(revealDate: event.revealDate, now: now)
                HStack(spacing: 14) {
                    FeatureIcon(systemName: "lock.fill", tint: Theme.gold)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Photos are locked.").font(.subheadline.weight(.semibold))
                        Text("You’ll see every moment after the reveal.").font(.footnote).foregroundStyle(.white.opacity(0.56))
                    }
                }.padding(.top, 22)
            }

            HStack(spacing: 14) {
                FeatureIcon(systemName: "camera", tint: .white)
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(event.maxPhotosPerGuest - model.remainingShots) of \(event.maxPhotosPerGuest) shots used").font(.subheadline.weight(.semibold))
                    ProgressView(value: Double(event.maxPhotosPerGuest - model.remainingShots), total: Double(event.maxPhotosPerGuest)).tint(Theme.blue)
                    Text("Add up to \(event.maxPhotosPerGuest) photos to this event.").font(.footnote).foregroundStyle(.white.opacity(0.52))
                }
            }.padding(.top, 22)

            Spacer(minLength: 20)
            VStack(spacing: 12) {
                Button { model.showsCamera = true } label: {
                    Label(model.isUploading ? "Uploading…" : "Take a photo", systemImage: "camera")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.isUploading || model.remainingShots == 0)
                Text("Private event · Only the host controls the reveal")
                    .font(.caption2).foregroundStyle(.white.opacity(0.48))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .sheet(isPresented: $showsInfo) {
            EventInfoSheet(event: event, sourceURL: model.invitation.sourceURL)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .alert("Couldn’t upload", isPresented: Binding(get: { model.uploadError != nil }, set: { if !$0 { model.uploadError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(model.uploadError ?? "Please try again.") }
    }
}

private struct CountdownView: View {
    let revealDate: Date
    let now: Date
    var remaining: Int { max(Int(revealDate.timeIntervalSince(now)), 0) }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PHOTOS REVEAL IN").font(.caption2.weight(.bold)).tracking(2).foregroundStyle(Theme.gold)
            HStack(spacing: 34) {
                TimeValue(value: remaining / 3600, label: "HRS")
                TimeValue(value: remaining % 3600 / 60, label: "MIN")
                TimeValue(value: remaining % 60, label: "SEC")
            }
        }
    }
}

private struct TimeValue: View {
    let value: Int; let label: String
    var body: some View { VStack(alignment: .leading, spacing: 3) { Text(String(format: "%02d", value)).font(Theme.display(40)).monospacedDigit(); Text(label).font(.caption2.weight(.bold)).tracking(1.5).foregroundStyle(.white.opacity(0.54)) } }
}

private struct FeatureIcon: View {
    let systemName: String; let tint: Color
    var body: some View { Image(systemName: systemName).foregroundStyle(tint).frame(width: 48, height: 48).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 15, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 15).stroke(.white.opacity(0.1))) }
}

private struct ErrorState: View {
    let message: String; let retry: () -> Void
    var body: some View { VStack(spacing: 18) { Image(systemName: "exclamationmark.triangle").font(.largeTitle); Text("Invitation unavailable").font(Theme.display(30)); Text(message).font(.footnote).foregroundStyle(.white.opacity(0.62)).multilineTextAlignment(.center); Button("Try again", action: retry).buttonStyle(.borderedProminent).tint(Theme.blue) }.padding(30) }
}

private struct EventInfoSheet: View {
    let event: EventRecord; let sourceURL: URL
    var body: some View { NavigationStack { VStack(alignment: .leading, spacing: 18) { Text(event.description.isEmpty ? "Share the night from your point of view. Every photo stays private until the reveal." : event.description).foregroundStyle(.secondary); ShareLink(item: sourceURL) { Label("Share guest link", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity) }.buttonStyle(PrimaryButtonStyle()); Spacer() }.padding(22).navigationTitle(event.name).navigationBarTitleDisplayMode(.inline) }.preferredColorScheme(.dark) }
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
    var photos: [PhotoRecord] = []

    init(invitation: EventInvitation) { self.invitation = invitation; client = APIClient(invitation: invitation) }

    func join() async {
        guard event == nil else { return }
        do { let response = try await client.join(); event = response.event; remainingShots = response.remainingShots; galleryAvailable = response.galleryAvailable }
        catch { errorMessage = error.localizedDescription }
    }

    func upload(_ data: Data) async {
        isUploading = true; uploadError = nil
        do { let response = try await client.upload(jpegData: data); remainingShots = response.remainingShots; reviewImageData = nil }
        catch { uploadError = error.localizedDescription }
        isUploading = false
    }

    func loadGallery() async {
        do { let response = try await client.gallery(); photos = response.photos; galleryAvailable = true }
        catch { errorMessage = error.localizedDescription }
    }
}
