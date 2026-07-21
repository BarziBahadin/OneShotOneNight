import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct GalleryView: View {
    @Bindable var model: GuestEventModel
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPhoto: PhotoRecord?
    @State private var isInvitePresented = false
    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    private var eventName: String { model.event?.name ?? "Party film" }
    private var joinedCount: Int { max(model.photos.count, model.displayName.isEmpty ? 0 : 1) }

    var body: some View {
        ZStack {
            EventBackdropImage(url: model.event?.coverURL)
                .ignoresSafeArea()
                .scaleEffect(1.12)
                .blur(radius: 18)
                .opacity(0.3)

            Color.black.opacity(0.74).ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 28) {
                    header
                    actions
                    MemoryForeverCard()
                    galleryContent
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .refreshable { await model.loadGallery() }
        }
        .task { await model.loadGallery() }
        .sheet(isPresented: $isInvitePresented) {
            InviteSheetView(eventName: eventName, invitationURL: model.invitation.sourceURL)
                .presentationDetents([.fraction(0.72), .large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(36)
        }
        .fullScreenCover(item: $selectedPhoto) { photo in
            PhotoViewerView(photo: photo)
        }
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top) {
                IconSquareButton(systemImage: "chevron.left", accessibilityText: "Back") { dismiss() }
                Spacer()
                EventBackdropImage(url: model.event?.coverURL)
                    .frame(width: 92, height: 92)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(.white.opacity(0.1)))
            }

            Text(eventName)
                .font(.system(size: 42, weight: .regular, design: .serif))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.75)

            EventMetadataRow(
                firstIcon: "clock",
                firstText: timeLeft,
                secondIcon: "person.fill",
                secondText: "\(joinedCount) people joined",
                vertical: true
            )
        }
    }

    private var actions: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
            spacing: 10
        ) {
            ShareLink(item: model.invitation.sourceURL) {
                GalleryActionLabel(title: "Export", systemImage: "square.and.arrow.up")
            }
            .accessibilityLabel("Export party film")

            Button { isInvitePresented = true } label: {
                GalleryActionLabel(title: "Invite", systemImage: "qrcode")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Invite guests")
            .accessibilityHint("Double tap to show the invitation QR code")

            Button {
                dismiss()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { model.showsCamera = true }
            } label: {
                GalleryActionLabel(
                    title: "Camera",
                    systemImage: "camera.fill",
                    foreground: .black,
                    background: .white
                )
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private var galleryContent: some View {
        if model.photos.isEmpty, model.isLoadingGallery {
            ProgressView("Opening album…")
                .frame(maxWidth: .infinity, minHeight: 240)
        } else if model.photos.isEmpty, let error = model.galleryError {
            VStack(spacing: 14) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.largeTitle)
                Text("Album unavailable").font(Theme.display(28))
                Text(error).font(.footnote).foregroundStyle(Theme.textMedium).multilineTextAlignment(.center)
                SecondaryCapsuleButton(title: "Try again", systemImage: "arrow.clockwise") {
                    Task { await model.loadGallery() }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 280)
        } else if model.photos.isEmpty {
            VStack(spacing: 14) {
                Image(systemName: "photo.stack")
                    .font(.system(size: 34))
                    .foregroundStyle(Theme.textMedium)
                Text("No photos yet").font(Theme.display(28))
                Text("Revealed photos will appear here.").foregroundStyle(Theme.textMedium)
            }
            .frame(maxWidth: .infinity, minHeight: 260)
        } else {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(model.photos) { photo in
                    PartyPhotoTile(photo: photo) { selectedPhoto = photo }
                        .onAppear {
                            if photo.id == model.photos.last?.id, model.nextGalleryCursor != nil {
                                Task { await model.loadGallery(reset: false) }
                            }
                        }
                }
                if model.isLoadingGallery {
                    ProgressView().padding().gridCellColumns(2)
                }
            }
        }
    }

    private var timeLeft: String {
        guard let revealDate = model.event?.revealDate else { return "Revealing soon" }
        let hours = max(Int(revealDate.timeIntervalSinceNow / 3_600), 0)
        return hours > 0 ? "\(hours) hours left" : "Revealed"
    }
}

private struct GalleryActionLabel: View {
    let title: String
    let systemImage: String
    var foreground: Color = .white
    var background: Color = Theme.surfaceElevated

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.system(size: 16, weight: .semibold))
            .minimumScaleFactor(0.78)
            .lineLimit(1)
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity)
            .frame(height: 64)
            .background(background, in: Capsule())
            .contentShape(Capsule())
    }
}

struct PartyPhotoTile: View {
    let photo: PhotoRecord
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topLeading) {
                PartyRemoteImage(photo: photo, contentMode: .fill)
                    .frame(maxWidth: .infinity)
                    .frame(height: 290)
                    .clipped()
                LinearGradient(
                    colors: [.black.opacity(0.5), .clear],
                    startPoint: .top,
                    endPoint: .center
                )
                Text(photo.photographerName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(16)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Photo by \(photo.photographerName)")
        .accessibilityHint("Double tap to open photo viewer")
    }
}

struct InviteSheetView: View {
    let eventName: String
    let invitationURL: URL
    @State private var didCopy = false

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(eventName)
                            .font(.system(size: 20, weight: .semibold))
                            .lineLimit(1)
                        Spacer()
                        Image(systemName: "qrcode")
                            .font(.title2)
                    }

                    EventBackdropImage()
                        .frame(maxWidth: .infinity)
                        .frame(height: 190)
                        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Invite guests to your film.")
                            .font(.system(size: 36, weight: .regular, design: .serif))
                            .foregroundStyle(.white)
                        Text("Take a glimpse of your world through their lens.\nInvite your guests to make this film unforgettable.")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.textMedium)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Divider().overlay(Theme.surfaceStroke)

                    QRCodeView(value: invitationURL.absoluteString)
                        .frame(width: 230, height: 230)
                        .padding(18)
                        .background(.white, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                        .frame(maxWidth: .infinity)

                    SecondaryCapsuleButton(
                        title: didCopy ? "Invitation Link Copied" : "Copy Invitation Link",
                        systemImage: didCopy ? "checkmark" : "link"
                    ) {
                        UIPasteboard.general.url = invitationURL
                        withAnimation(.snappy) { didCopy = true }
                    }
                    .overlay(Capsule().stroke(Theme.surfaceStroke))
                    .accessibilityLabel("Copy invitation link")
                    .accessibilityHint("Double tap to copy the event invitation link")
                }
                .padding(.horizontal, 24)
                .padding(.top, 10)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
    }
}

struct PhotoViewerView: View {
    let photo: PhotoRecord
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            PartyRemoteImage(photo: photo, contentMode: .fit, usesFullResolution: true)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            VStack {
                HStack {
                    Text(photo.photographerName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                    Spacer()
                    IconSquareButton(systemImage: "xmark", accessibilityText: "Close photo viewer") { dismiss() }
                }
                Spacer()
                HStack(spacing: 12) {
                    SecondaryCapsuleButton(title: "Save", systemImage: "arrow.down") { savePhoto() }
                    if let url = photo.shareURL {
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.black)
                                .frame(width: 58, height: 58)
                                .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }
                        .accessibilityLabel("Share photo")
                    }
                    Menu {
                        if let url = photo.shareURL { ShareLink("Share link", item: url) }
                        Button("Close viewer") { dismiss() }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 58, height: 58)
                            .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }
                    .accessibilityLabel("More photo actions")
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
        }
        .preferredColorScheme(.dark)
    }

    private func savePhoto() {
        guard let url = photo.shareURL else { return }
        Task {
            guard let (data, _) = try? await URLSession.shared.data(from: url),
                  let image = UIImage(data: data) else { return }
            UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
        }
    }
}

private struct PartyRemoteImage: View {
    let photo: PhotoRecord
    let contentMode: ContentMode
    var usesFullResolution = false

    var body: some View {
        if let url = usesFullResolution ? photo.fullResolutionURL : photo.thumbnailImageURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case let .success(image):
                    image.resizable().aspectRatio(contentMode: contentMode)
                case .failure:
                    placeholder(systemImage: "exclamationmark.triangle")
                default:
                    placeholder(systemImage: nil)
                }
            }
        } else {
            placeholder(systemImage: "photo")
        }
    }

    private func placeholder(systemImage: String?) -> some View {
        Rectangle()
            .fill(Theme.surface)
            .overlay {
                if let systemImage { Image(systemName: systemImage).foregroundStyle(Theme.textLow) }
                else { ProgressView() }
            }
    }
}

private struct QRCodeView: View {
    let value: String
    private let context = CIContext()
    private let filter = CIFilter.qrCodeGenerator()

    var body: some View {
        if let image = makeImage() {
            Image(uiImage: image)
                .resizable()
                .interpolation(.none)
                .scaledToFit()
        } else {
            Image(systemName: "qrcode")
                .resizable()
                .scaledToFit()
                .foregroundStyle(.black)
        }
    }

    private func makeImage() -> UIImage? {
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cgImage = context.createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

private extension PhotoRecord {
    var photographerName: String {
        guard let guestName, !guestName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "Guest" }
        return guestName
    }

    var thumbnailImageURL: URL? {
        [thumbnailURL, previewURL, publicURL]
            .compactMap { $0 }
            .compactMap(URL.init(string:))
            .first
    }

    var fullResolutionURL: URL? {
        [publicURL, previewURL, thumbnailURL]
            .compactMap { $0 }
            .compactMap(URL.init(string:))
            .first
    }

    var shareURL: URL? {
        [publicURL, previewURL, thumbnailURL]
            .compactMap { $0 }
            .compactMap(URL.init(string:))
            .first
    }
}

#if DEBUG
@MainActor
private enum PartyFilmPreviewData {
    static var photo: PhotoRecord {
        let localURL = Bundle.main.url(forResource: "event-background", withExtension: "jpg")?.absoluteString
        return PhotoRecord(
            id: "preview-photo",
            objectKey: "preview/event-background.jpg",
            guestName: "Yebin",
            publicURL: localURL,
            thumbnailURL: localURL,
            previewURL: localURL,
            contentType: "image/jpeg",
            sizeBytes: 1,
            message: "",
            status: "approved",
            isDeveloped: true,
            createdAt: "2026-07-02T18:00:00Z"
        )
    }

    static var model: GuestEventModel {
        let url = URL(string: "https://oneshotonenight.app/guest/once-party-2026?t=preview")!
        let model = GuestEventModel(invitation: EventInvitation(url: url)!, previewEvent: .layoutPreview)
        model.saveDisplayName("Yebin")
        model.photos = [photo, photo]
        return model
    }
}

#Preview("Gallery") {
    GalleryView(model: PartyFilmPreviewData.model)
        .preferredColorScheme(.dark)
}

#Preview("Invite sheet") {
    InviteSheetView(
        eventName: EventRecord.layoutPreview.name,
        invitationURL: URL(string: "https://oneshotonenight.app/guest/once-party-2026?t=preview")!
    )
    .preferredColorScheme(.dark)
}

#Preview("Photo viewer") {
    PhotoViewerView(photo: PartyFilmPreviewData.photo)
        .preferredColorScheme(.dark)
}
#endif
