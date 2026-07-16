@preconcurrency import AVFoundation
import SwiftUI
import UIKit

typealias CameraCaptureView = PartyCameraView

struct PartyCameraView: View {
    let eventName: String
    let remainingShots: Int
    let maxShots: Int
    let revealDate: Date?
    let invitationURL: URL?
    let isUploading: Bool
    let uploadWarning: String?
    let previewMode: Bool
    var onOpenGallery: (() -> Void)?
    let onCapture: (Data) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = CameraController()
    @State private var now = Date.now
    @State private var showsInvite = false
    @State private var shutterPressed = false
    @State private var captureFlashVisible = false
    @State private var localRemainingShots: Int

    init(
        eventName: String,
        remainingShots: Int,
        maxShots: Int,
        revealDate: Date?,
        invitationURL: URL? = nil,
        isUploading: Bool = false,
        uploadWarning: String? = nil,
        previewMode: Bool = false,
        onOpenGallery: (() -> Void)? = nil,
        onCapture: @escaping (Data) -> Void
    ) {
        self.eventName = eventName
        self.remainingShots = remainingShots
        self.maxShots = max(maxShots, 1)
        self.revealDate = revealDate
        self.invitationURL = invitationURL
        self.isUploading = isUploading
        self.uploadWarning = uploadWarning
        self.previewMode = previewMode
        self.onOpenGallery = onOpenGallery
        self.onCapture = onCapture
        _localRemainingShots = State(initialValue: remainingShots)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Theme.background.ignoresSafeArea()

                if camera.permissionDenied && !previewMode {
                    cameraUnavailable
                } else if let message = camera.unavailableMessage, !previewMode {
                    cameraUnavailable(message: message)
                } else {
                    let horizontalMargin: CGFloat = 15
                    let previewWidth = proxy.size.width - (horizontalMargin * 2)
                    let previewHeight = previewWidth * 4 / 3
                    let previewTop = max(proxy.safeAreaInsets.top + 100, 145)

                    ZStack(alignment: .top) {
                        cameraTopBar
                            .padding(.top, proxy.safeAreaInsets.top + 17)

                        CameraPreviewView(
                            session: camera.session,
                            previewMode: previewMode
                        )
                        .frame(width: previewWidth, height: previewHeight)
                        .clipShape(RoundedRectangle(cornerRadius: 42, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 42, style: .continuous).stroke(.white.opacity(0.06)))
                        .padding(.top, previewTop)

                        CameraControlBar(
                            flashEnabled: camera.flashEnabled,
                            selectedZoom: CGFloat(camera.zoomFactor),
                            supportsUltraWide: camera.supportsUltraWide && camera.position == .back,
                            onFlash: camera.toggleFlash,
                            onZoom: camera.setZoom,
                            onFlip: camera.switchCamera
                        )
                        .padding(.top, previewTop + previewHeight + 36)

                        bottomControls
                            .padding(.top, previewTop + previewHeight + 105)
                    }
                    .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
                    .ignoresSafeArea(edges: [.top, .bottom])
                }

                Color.white
                    .opacity(captureFlashVisible ? 0.55 : 0)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .animation(.easeOut(duration: 0.18), value: captureFlashVisible)
            }
        }
        .task { if !previewMode { await camera.start() } }
        .onDisappear { if !previewMode { camera.stop() } }
        .onReceive(camera.$capturedData.compactMap { $0 }) { data in
            guard localRemainingShots > 0 else { return }
            localRemainingShots -= 1
            onCapture(data)
        }
        .onChange(of: remainingShots) { _, updatedValue in
            localRemainingShots = min(localRemainingShots, updatedValue)
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now = $0 }
        .sheet(isPresented: $showsInvite) {
            if let invitationURL {
                InviteSheetView(eventName: eventName, invitationURL: invitationURL)
                    .presentationDetents([.fraction(0.72), .large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(36)
            }
        }
        .preferredColorScheme(.dark)
    }

    private var cameraTopBar: some View {
        HStack(spacing: 12) {
            cameraTopButton(systemImage: "chevron.left", accessibilityText: "Close camera") { dismiss() }

            VStack(spacing: 4) {
                Text(eventName)
                    .font(.system(size: 26, weight: .regular, design: .serif))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.64)
                Text(timeLeft)
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.48))
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity)

            cameraTopButton(systemImage: "qrcode", accessibilityText: "Show invitation QR code") {
                showsInvite = invitationURL != nil
            }
            .opacity(invitationURL == nil ? 0.45 : 1)
            .disabled(invitationURL == nil)
        }
        .padding(.horizontal, 22)
        .frame(height: 48)
    }

    private func cameraTopButton(
        systemImage: String,
        accessibilityText: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: systemImage == "qrcode" ? 23 : 22, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityText)
    }

    private var bottomControls: some View {
        ZStack {
            Button {
                guard localRemainingShots > 0 else { return }
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                shutterPressed = true
                captureFlashVisible = true
                camera.capture()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.14) {
                    shutterPressed = false
                    captureFlashVisible = false
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(Theme.surface)
                        .frame(width: 88, height: 88)
                        .shadow(color: .white.opacity(0.12), radius: 18)
                    Circle()
                        .fill(Color(red: 70 / 255, green: 70 / 255, blue: 70 / 255))
                        .frame(width: 70, height: 70)
                    Circle()
                        .stroke(.white.opacity(0.18), lineWidth: 2)
                        .frame(width: 78, height: 78)
                }
            }
            .buttonStyle(.plain)
            .scaleEffect(shutterPressed ? 0.94 : 1)
            .animation(.spring(response: 0.24, dampingFraction: 0.7), value: shutterPressed)
            .disabled(localRemainingShots == 0 || camera.isCapturing)
            .opacity(localRemainingShots == 0 ? 0.45 : 1)
            .accessibilityLabel(localRemainingShots == 0 ? "No shots remaining" : "Take photo")

            HStack {
                ShotCounterPicker(selectedNumber: localRemainingShots, maximum: maxShots)

                Spacer(minLength: 0)

                Button { onOpenGallery?() } label: {
                    Group {
                        if let image = camera.lastCapturedPhoto {
                            Image(uiImage: image).resizable().scaledToFill()
                        } else {
                            EventBackdropImage()
                        }
                    }
                    .frame(width: 62, height: 62)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(.white.opacity(0.22)))
                    .overlay(alignment: .bottomTrailing) {
                        if isUploading {
                            ProgressView()
                                .controlSize(.mini)
                                .tint(.white)
                                .padding(5)
                                .background(.black.opacity(0.72), in: Circle())
                                .offset(x: 4, y: 4)
                        } else if uploadWarning != nil {
                            Image(systemName: "icloud.and.arrow.up")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(Theme.memoryYellow)
                                .padding(5)
                                .background(.black.opacity(0.72), in: Circle())
                                .offset(x: 4, y: 4)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(onOpenGallery == nil)
                .opacity(onOpenGallery == nil ? 0.45 : 1)
                .accessibilityLabel(onOpenGallery == nil ? "Album locked until reveal" : "Open event album")
            }
        }
        .overlay(alignment: .bottom) {
            if localRemainingShots == 0 {
                Text("No shots left")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.textMedium)
                    .offset(y: 22)
            }
        }
        .padding(.horizontal, 22)
        .frame(height: 96, alignment: .center)
    }

    private var timeLeft: String {
        guard let revealDate else { return "Private event camera" }
        let seconds = max(Int(revealDate.timeIntervalSince(now)), 0)
        if seconds == 0 { return "Film revealed" }
        let days = seconds / 86_400
        let hours = (seconds % 86_400) / 3_600
        if days > 0 { return "\(days)d \(hours)h left" }
        return "\(hours)h left"
    }

    private var cameraUnavailable: some View {
        cameraUnavailable(message: "Enable Camera access in Settings to take event photos.")
    }

    private func cameraUnavailable(message: String) -> some View {
        VStack(spacing: 18) {
            Image(systemName: "camera.fill")
                .font(.system(size: 36))
                .foregroundStyle(Theme.textMedium)
            Text("Camera unavailable")
                .font(.system(size: 32, weight: .regular, design: .serif))
            Text(message)
                .foregroundStyle(Theme.textMedium)
                .multilineTextAlignment(.center)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
            .font(.headline)
            .foregroundStyle(.black)
            .padding(.horizontal, 24)
            .frame(height: 54)
            .background(.white, in: Capsule())
        }
        .padding(32)
    }
}

struct CameraPreviewView: View {
    let session: AVCaptureSession
    var previewMode = false

    var body: some View {
        if previewMode {
            EventBackdropImage()
                .blur(radius: 10)
                .overlay(Color.orange.opacity(0.22))
        } else {
            LiveCameraPreview(session: session)
        }
    }
}

struct CameraControlBar: View {
    let flashEnabled: Bool
    let selectedZoom: CGFloat
    let supportsUltraWide: Bool
    let onFlash: () -> Void
    let onZoom: (CGFloat) -> Void
    let onFlip: () -> Void

    var body: some View {
        HStack {
            Button(action: onFlash) {
                Image(systemName: flashEnabled ? "bolt.badge.a.fill" : "bolt.badge.a")
                    .font(.system(size: 25, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(flashEnabled ? "Turn flash off" : "Turn flash on")

            Spacer()
            ZoomSelector(selectedZoom: selectedZoom, supportsUltraWide: supportsUltraWide, onSelect: onZoom)
            Spacer()

            Button(action: onFlip) {
                Image(systemName: "arrow.triangle.2.circlepath.camera")
                    .font(.system(size: 25, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Switch camera")
        }
        .padding(.horizontal, 28)
        .frame(height: 44)
    }
}

struct ZoomSelector: View {
    let selectedZoom: CGFloat
    let supportsUltraWide: Bool
    let onSelect: (CGFloat) -> Void

    var body: some View {
        HStack(spacing: 4) {
            if supportsUltraWide { zoomButton(0.5, title: "0.5") }
            zoomButton(1, title: "1×")
        }
        .padding(3)
        .frame(width: 108, height: 42)
        .background(.black, in: Capsule())
    }

    private func zoomButton(_ zoom: CGFloat, title: String) -> some View {
        let selected = abs(selectedZoom - zoom) < 0.1
        return Button { onSelect(zoom) } label: {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(selected ? .white : Theme.textLow)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(selected ? Theme.surfaceElevated : .clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.28, dampingFraction: 0.76), value: selected)
    }
}

struct ShotCounterPicker: View {
    let selectedNumber: Int
    let maximum: Int

    var body: some View {
        HStack(spacing: 8) {
            Text("\(max(selectedNumber - 1, 0))").opacity(0.25)
            Text("\(selectedNumber)")
                .font(.system(size: 28, weight: .semibold, design: .serif))
            Text("\(min(selectedNumber + 1, maximum))").opacity(0.25)
        }
        .font(.system(size: 22, weight: .regular, design: .serif))
        .foregroundStyle(.white)
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
        .frame(width: 116, height: 58)
        .background(.black, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .clipped()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(selectedNumber) shots remaining")
    }
}

private struct LiveCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

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
    @Published var zoomFactor: Double = 1
    @Published var position: AVCaptureDevice.Position = .back
    @Published var unavailableMessage: String?
    @Published var isCapturing = false
    @Published var lastCapturedPhoto: UIImage?
    @Published private(set) var supportsUltraWide = AVCaptureDevice.default(
        .builtInUltraWideCamera,
        for: .video,
        position: .back
    ) != nil
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "com.barzibahadin.nightframe.camera")

    override init() {
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(sessionInterrupted), name: AVCaptureSession.wasInterruptedNotification, object: session)
        NotificationCenter.default.addObserver(self, selector: #selector(sessionInterruptionEnded), name: AVCaptureSession.interruptionEndedNotification, object: session)
        NotificationCenter.default.addObserver(self, selector: #selector(sessionRuntimeError), name: AVCaptureSession.runtimeErrorNotification, object: session)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    func start() async {
        let allowed: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: allowed = true
        case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .video)
        default: allowed = false
        }
        guard allowed else {
            await MainActor.run { permissionDenied = true }
            return
        }
        configureIfNeeded()
        queue.async { [session] in if !session.isRunning { session.startRunning() } }
    }

    func stop() {
        queue.async { [session] in if session.isRunning { session.stopRunning() } }
    }

    func toggleFlash() {
        guard position == .back, zoomFactor >= 1 else {
            flashEnabled = false
            return
        }
        flashEnabled.toggle()
    }

    func setZoom(_ target: CGFloat) {
        queue.async { [weak self] in
            guard let self, self.position == .back else { return }
            let deviceType: AVCaptureDevice.DeviceType = target < 1 ? .builtInUltraWideCamera : .builtInWideAngleCamera
            guard let device = AVCaptureDevice.default(deviceType, for: .video, position: .back) else { return }
            self.replaceInput(with: device, position: .back, displayedZoom: Double(target))
        }
    }

    func switchCamera() {
        let nextPosition: AVCaptureDevice.Position = position == .back ? .front : .back
        queue.async { [weak self] in
            guard let self,
                  let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: nextPosition) else { return }
            self.replaceInput(with: device, position: nextPosition, displayedZoom: 1)
        }
    }

    func capture() {
        guard !isCapturing else { return }
        isCapturing = true
        let settings = AVCapturePhotoSettings()
        settings.flashMode = flashEnabled ? .on : .off
        output.capturePhoto(with: settings, delegate: self)
    }

    @objc private func sessionInterrupted(_ notification: Notification) {
        DispatchQueue.main.async { self.unavailableMessage = "Another app or system feature is using the camera. It will resume automatically." }
    }

    @objc private func sessionInterruptionEnded(_ notification: Notification) {
        DispatchQueue.main.async { self.unavailableMessage = nil }
        queue.async { [session] in if !session.isRunning { session.startRunning() } }
    }

    @objc private func sessionRuntimeError(_ notification: Notification) {
        DispatchQueue.main.async { self.unavailableMessage = "The camera stopped unexpectedly. Close and reopen it to try again." }
    }

    private func configureIfNeeded() {
        guard session.inputs.isEmpty else { return }
        session.beginConfiguration()
        session.sessionPreset = .photo
        defer { session.commitConfiguration() }
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera),
              session.canAddInput(input),
              session.canAddOutput(output) else { return }
        session.addInput(input)
        session.addOutput(output)
        output.maxPhotoQualityPrioritization = .quality
    }

    private func replaceInput(
        with device: AVCaptureDevice,
        position: AVCaptureDevice.Position,
        displayedZoom: Double
    ) {
        guard let input = try? AVCaptureDeviceInput(device: device) else { return }
        session.beginConfiguration()
        let oldInputs = session.inputs
        oldInputs.forEach(session.removeInput)
        if session.canAddInput(input) {
            session.addInput(input)
            session.commitConfiguration()
            do {
                try device.lockForConfiguration()
                device.videoZoomFactor = min(max(1, device.minAvailableVideoZoomFactor), device.maxAvailableVideoZoomFactor)
                device.unlockForConfiguration()
            } catch { }
            DispatchQueue.main.async {
                self.position = position
                self.zoomFactor = displayedZoom
                if position == .front || displayedZoom < 1 { self.flashEnabled = false }
            }
        } else {
            oldInputs.forEach { if session.canAddInput($0) { session.addInput($0) } }
            session.commitConfiguration()
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            DispatchQueue.main.async {
                self.isCapturing = false
                self.unavailableMessage = "The photo could not be captured. Please try again."
            }
            return
        }
        DispatchQueue.main.async {
            self.lastCapturedPhoto = image
            self.capturedData = data
            self.isCapturing = false
        }
    }
}

#if DEBUG
#Preview("Party camera") {
    PartyCameraView(
        eventName: "Once party 2026",
        remainingShots: 18,
        maxShots: 24,
        revealDate: .now.addingTimeInterval(10_800),
        invitationURL: URL(string: "https://oneshotonenight.app/guest/once-party-2026?t=preview"),
        previewMode: true,
        onOpenGallery: {}
    ) { _ in }
}
#endif
