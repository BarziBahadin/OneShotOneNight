@preconcurrency import AVFoundation
import SwiftUI
import UIKit

struct CameraCaptureView: View {
    let eventName: String
    let remainingShots: Int
    let maxShots: Int
    let revealDate: Date?
    let previewMode: Bool
    var onOpenGallery: (() -> Void)?
    let onCapture: (Data) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = CameraController()
    @State private var gridEnabled = false
    @State private var showsInfo = false
    @State private var now = Date.now

    init(
        eventName: String,
        remainingShots: Int,
        maxShots: Int,
        revealDate: Date?,
        previewMode: Bool = false,
        onOpenGallery: (() -> Void)? = nil,
        onCapture: @escaping (Data) -> Void
    ) {
        self.eventName = eventName
        self.remainingShots = remainingShots
        self.maxShots = max(maxShots, 1)
        self.revealDate = revealDate
        self.previewMode = previewMode
        self.onOpenGallery = onOpenGallery
        self.onCapture = onCapture
    }

    var body: some View {
        GeometryReader { canvas in
        let viewportWidth = min(canvas.size.width, UIScreen.main.bounds.width)
        ZStack {
            Color.black.ignoresSafeArea()
            if camera.permissionDenied && !previewMode {
                ContentUnavailableView("Camera access is off", systemImage: "camera.fill", description: Text("Enable Camera access in Settings to take event photos."))
            } else {
                if previewMode {
                    EventBackdropImage()
                        .ignoresSafeArea()
                } else {
                    CameraPreview(session: camera.session).ignoresSafeArea()
                }
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.72), location: 0),
                        .init(color: .clear, location: 0.25),
                        .init(color: .clear, location: 0.62),
                        .init(color: .black.opacity(0.9), location: 0.82),
                        .init(color: .black, location: 1)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                if gridEnabled { ViewfinderGrid() }

                GeometryReader { geometry in
                VStack(spacing: 0) {
                    CameraHeader(eventName: eventName, revealDate: revealDate, now: now) {
                        dismiss()
                    } onInfo: {
                        showsInfo = true
                    }
                    .frame(width: geometry.size.width)

                    ZStack {
                        Button { camera.cycleZoom() } label: {
                            Text(camera.zoomFactor == 1 ? "1×" : "2×")
                                .font(.subheadline.weight(.bold))
                        }
                        .buttonStyle(GlassCircleButton())
                        .accessibilityLabel("Change zoom")

                        HStack {
                            Button { camera.toggleFlash() } label: {
                                Image(systemName: camera.flashEnabled ? "bolt.fill" : "bolt.slash.fill")
                            }
                            .buttonStyle(GlassCircleButton())
                            .accessibilityLabel(camera.flashEnabled ? "Turn flash off" : "Turn flash on")

                            Spacer()

                            Button { gridEnabled.toggle() } label: {
                                Image(systemName: gridEnabled ? "grid.circle.fill" : "grid.circle")
                            }
                            .buttonStyle(GlassCircleButton())
                            .accessibilityLabel(gridEnabled ? "Hide grid" : "Show grid")
                        }
                        .padding(.horizontal, 72)
                    }
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.top, 26)
                    .frame(width: geometry.size.width)

                    Spacer()

                    VStack(spacing: 22) {
                        Text("PHOTO")
                            .font(.caption.weight(.bold))
                            .tracking(1.8)
                            .foregroundStyle(Theme.gold)

                        ShotProgress(remainingShots: remainingShots, maxShots: maxShots)

                        ZStack {
                            Button { camera.capture() } label: {
                                ZStack {
                                    Circle().fill(.white).frame(width: 82, height: 82)
                                    Circle().stroke(.black.opacity(0.82), lineWidth: 3).frame(width: 70, height: 70)
                                }
                            }
                            .disabled(remainingShots == 0)
                            .opacity(remainingShots == 0 ? 0.45 : 1)
                            .accessibilityLabel(remainingShots == 0 ? "No shots remaining" : "Take photo")

                            HStack {
                                Button { onOpenGallery?() } label: {
                                    EventBackdropImage()
                                        .frame(width: 56, height: 56)
                                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.82), lineWidth: 1.5))
                                }
                                .disabled(onOpenGallery == nil)
                                .opacity(onOpenGallery == nil ? 0.42 : 1)
                                .accessibilityLabel(onOpenGallery == nil ? "Album locked until reveal" : "Open event album")

                                Spacer()

                                Button { camera.switchCamera() } label: {
                                    Image(systemName: "arrow.triangle.2.circlepath.camera.fill")
                                        .font(.title2)
                                        .foregroundStyle(.white)
                                        .frame(width: 56, height: 56)
                                        .background(.white.opacity(0.1), in: Circle())
                                        .overlay(Circle().stroke(.white.opacity(0.18)))
                                }
                                .accessibilityLabel("Switch camera")
                            }
                            .padding(.horizontal, 66)
                        }
                        .frame(width: geometry.size.width)
                    }
                    .padding(.top, 22)
                    .padding(.bottom, 18)
                    .background(.black.opacity(0.86), in: UnevenRoundedRectangle(topLeadingRadius: 36, topTrailingRadius: 36))
                    .overlay(alignment: .top) {
                        Rectangle().fill(.white.opacity(0.1)).frame(height: 1)
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                }
            }
        }
        .frame(width: viewportWidth, height: canvas.size.height)
        .clipped()
        }
        .task { if !previewMode { await camera.start() } }
        .onDisappear { if !previewMode { camera.stop() } }
        .onReceive(camera.$capturedData.compactMap { $0 }) { onCapture($0) }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .sheet(isPresented: $showsInfo) {
            CameraInfoSheet(eventName: eventName, remainingShots: remainingShots, maxShots: maxShots, revealDate: revealDate)
                .presentationDetents([.height(300)])
                .presentationDragIndicator(.visible)
        }
        .preferredColorScheme(.dark)
    }
}

private struct CameraHeader: View {
    let eventName: String
    let revealDate: Date?
    let now: Date
    let onClose: () -> Void
    let onInfo: () -> Void

    var body: some View {
        ZStack {
            VStack(spacing: 4) {
                HStack(spacing: 6) {
                    Text(eventName.uppercased())
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Image(systemName: "lock.fill").font(.caption2)
                }
                .font(.caption.weight(.bold))
                .tracking(1.2)

                if let revealDate {
                    Text("Photos reveal in \(countdown(to: revealDate, from: now))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.gold)
                        .monospacedDigit()
                } else {
                    Text("Private event camera")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.gold)
                }
            }
            .frame(maxWidth: 220)

            HStack {
                Button(action: onClose) { Image(systemName: "xmark").font(.title3.weight(.semibold)) }
                    .buttonStyle(GlassCircleButton())

                Spacer()

                Button(action: onInfo) { Image(systemName: "info.circle").font(.title3.weight(.semibold)) }
                    .buttonStyle(GlassCircleButton())
            }
            .padding(.horizontal, 62)
        }
        .padding(.top, 8)
    }
}

private struct ShotProgress: View {
    let remainingShots: Int
    let maxShots: Int
    private var usedShots: Int { max(maxShots - remainingShots, 0) }

    var body: some View {
        HStack(spacing: 12) {
            Text("\(usedShots) of \(maxShots) used")
                .foregroundStyle(Theme.blue)

            HStack(spacing: 5) {
                ForEach(0..<maxShots, id: \.self) { index in
                    Capsule()
                        .fill(index < usedShots ? Theme.blue : .white.opacity(0.18))
                        .frame(width: 9, height: 5)
                }
            }

            Text("\(remainingShots) left")
                .foregroundStyle(.white.opacity(0.58))
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 22)
    }
}

private struct ViewfinderGrid: View {
    var body: some View {
        GeometryReader { proxy in
            Path { path in
                let width = proxy.size.width
                let height = proxy.size.height
                path.move(to: CGPoint(x: width / 3, y: 0)); path.addLine(to: CGPoint(x: width / 3, y: height))
                path.move(to: CGPoint(x: width * 2 / 3, y: 0)); path.addLine(to: CGPoint(x: width * 2 / 3, y: height))
                path.move(to: CGPoint(x: 0, y: height / 3)); path.addLine(to: CGPoint(x: width, y: height / 3))
                path.move(to: CGPoint(x: 0, y: height * 2 / 3)); path.addLine(to: CGPoint(x: width, y: height * 2 / 3))
            }
            .stroke(.white.opacity(0.26), lineWidth: 0.7)
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}

private struct CameraInfoSheet: View {
    let eventName: String
    let remainingShots: Int
    let maxShots: Int
    let revealDate: Date?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Label("Private until reveal", systemImage: "lock.fill")
                    .font(.headline)
                    .foregroundStyle(Theme.gold)
                Text("You have \(remainingShots) of \(maxShots) shots remaining. Every photo is stored privately and appears when the host reveals the album.")
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
                if let revealDate {
                    Label(revealDate.formatted(date: .abbreviated, time: .shortened), systemImage: "clock")
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
            }
            .padding(22)
            .navigationTitle(eventName)
            .navigationBarTitleDisplayMode(.inline)
        }
        .preferredColorScheme(.dark)
    }
}

private func countdown(to date: Date, from now: Date) -> String {
    let remaining = max(Int(date.timeIntervalSince(now)), 0)
    return String(format: "%02d:%02d:%02d", remaining / 3600, remaining % 3600 / 60, remaining % 60)
}

private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> PreviewView { let view = PreviewView(); view.previewLayer.session = session; view.previewLayer.videoGravity = .resizeAspectFill; return view }
    func updateUIView(_ uiView: PreviewView, context: Context) {}
}

private final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

final class CameraController: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    @Published var capturedData: Data?
    @Published var permissionDenied = false
    @Published var flashEnabled = false
    @Published var zoomFactor = 1
    @Published var position: AVCaptureDevice.Position = .back
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "com.oneshotonenight.camera")

    func start() async {
        let allowed: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: allowed = true
        case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .video)
        default: allowed = false
        }
        guard allowed else { await MainActor.run { permissionDenied = true }; return }
        configureIfNeeded()
        queue.async { [session] in if !session.isRunning { session.startRunning() } }
    }

    func stop() { queue.async { [session] in if session.isRunning { session.stopRunning() } } }
    func toggleFlash() { flashEnabled.toggle() }
    func cycleZoom() {
        let target = zoomFactor == 1 ? 2 : 1
        queue.async { [weak self] in
            guard let self, let device = (self.session.inputs.first as? AVCaptureDeviceInput)?.device else { return }
            do {
                try device.lockForConfiguration()
                device.videoZoomFactor = min(CGFloat(target), device.activeFormat.videoMaxZoomFactor)
                device.unlockForConfiguration()
                DispatchQueue.main.async { self.zoomFactor = target }
            } catch { return }
        }
    }
    func switchCamera() {
        let nextPosition: AVCaptureDevice.Position = position == .back ? .front : .back
        queue.async { [weak self] in self?.replaceInput(position: nextPosition) }
    }
    func capture() { let settings = AVCapturePhotoSettings(); settings.flashMode = flashEnabled ? .on : .off; output.capturePhoto(with: settings, delegate: self) }

    private func configureIfNeeded() {
        guard session.inputs.isEmpty else { return }
        session.beginConfiguration(); session.sessionPreset = .photo
        defer { session.commitConfiguration() }
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input), session.canAddOutput(output) else { return }
        session.addInput(input); session.addOutput(output); output.maxPhotoQualityPrioritization = .quality
    }

    private func replaceInput(position: AVCaptureDevice.Position) {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: camera) else { return }
        session.beginConfiguration()
        let oldInputs = session.inputs
        oldInputs.forEach(session.removeInput)
        if session.canAddInput(input) {
            session.addInput(input)
            session.commitConfiguration()
            DispatchQueue.main.async {
                self.position = position
                self.zoomFactor = 1
                if position == .front { self.flashEnabled = false }
            }
        } else {
            oldInputs.forEach { if session.canAddInput($0) { session.addInput($0) } }
            session.commitConfiguration()
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        DispatchQueue.main.async { self.capturedData = data }
    }
}
