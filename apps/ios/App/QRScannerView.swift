@preconcurrency import AVFoundation
import SwiftUI
import UIKit

struct QRCodeScannerView: View {
    let onFound: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var scannerError: String?

    var body: some View {
        ZStack {
            #if targetEnvironment(simulator)
            Color.black.ignoresSafeArea()
            #else
            QRScannerCamera(onFound: { url in onFound(url.absoluteString) }) { message in
                scannerError = message
            }
            .ignoresSafeArea()
            #endif

            LinearGradient(colors: [.black.opacity(0.52), .clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            VStack(spacing: 0) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.headline)
                            .frame(width: 58, height: 58)
                    }
                    .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.surfaceStroke))
                    Spacer()
                }

                Spacer()

                RoundedRectangle(cornerRadius: 42, style: .continuous)
                    .stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: 274, height: 274)
                    .overlay {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.system(size: 46, weight: .light))
                            .foregroundStyle(.white.opacity(0.78))
                    }

                Spacer()

                VStack(spacing: 8) {
                    Text(scannerError == nil ? "Scan invitation QR code" : "Scanner unavailable")
                        .font(.system(size: 28, weight: .regular, design: .serif))
                    Text(scannerError ?? "Center the host’s invitation code inside the frame. The event opens automatically.")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                    if scannerError != nil {
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 22)
                        .frame(height: 50)
                        .background(.white, in: Capsule())
                        .padding(.top, 8)
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity)
                .background(Theme.surface.opacity(0.94), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Theme.surfaceStroke))
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .onAppear {
            #if targetEnvironment(simulator)
            scannerError = "Live QR scanning is unavailable in Simulator. Run the app on a physical iPhone, or paste the event link."
            #endif
        }
    }
}

#if !targetEnvironment(simulator)
private struct QRScannerCamera: UIViewControllerRepresentable {
    let onFound: (URL) -> Void
    let onFailure: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerViewController {
        QRScannerViewController(onFound: onFound, onFailure: onFailure)
    }

    func updateUIViewController(_ uiViewController: QRScannerViewController, context: Context) {}

    static func dismantleUIViewController(_ uiViewController: QRScannerViewController, coordinator: ()) {
        uiViewController.stopScanning()
    }
}

private final class QRScannerViewController: UIViewController, @preconcurrency AVCaptureMetadataOutputObjectsDelegate, @unchecked Sendable {
    // UIKit makes this view controller main-actor isolated. These members are
    // explicitly nonisolated because mutable session lifecycle work is confined
    // to sessionQueue, while callback delivery returns to the main queue.
    private nonisolated let session = AVCaptureSession()
    private nonisolated let sessionQueue = DispatchQueue(label: "com.barzibahadin.nightframe.qr-scanner")
    private nonisolated(unsafe) let onFailure: (String) -> Void
    private let onFound: (URL) -> Void
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private nonisolated(unsafe) var configured = false
    private var finished = false

    init(onFound: @escaping (URL) -> Void, onFailure: @escaping (String) -> Void) {
        self.onFound = onFound
        self.onFailure = onFailure
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        previewLayer = layer
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        requestCameraAndStart()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopScanning()
    }

    nonisolated func stopScanning() {
        sessionQueue.async { [session] in
            if session.isRunning { session.stopRunning() }
        }
    }

    private func requestCameraAndStart() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAndStart()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                if granted {
                    self?.configureAndStart()
                } else {
                    self?.fail("Camera access is off. Enable it in Settings, then try again.")
                }
            }
        default:
            fail("Camera access is off. Enable it in Settings, then try again.")
        }
    }

    private nonisolated func configureAndStart() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if !self.configured {
                guard self.configureSession() else { return }
                self.configured = true
            }
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    private nonisolated func configureSession() -> Bool {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            fail("No rear camera is available on this device.")
            return false
        }

        do {
            let input = try AVCaptureDeviceInput(device: camera)
            let output = AVCaptureMetadataOutput()
            session.beginConfiguration()
            defer { session.commitConfiguration() }
            session.sessionPreset = .high

            guard session.canAddInput(input), session.canAddOutput(output) else {
                fail("The camera could not be configured for QR scanning.")
                return false
            }

            session.addInput(input)
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            guard output.availableMetadataObjectTypes.contains(.qr) else {
                fail("QR scanning is unavailable on this camera.")
                return false
            }
            output.metadataObjectTypes = [.qr]
            return true
        } catch {
            fail("The camera could not start. Close other camera apps and try again.")
            return false
        }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished else { return }
        for object in metadataObjects {
            guard let code = object as? AVMetadataMachineReadableCodeObject,
                  code.type == .qr,
                  let payload = code.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
                  let url = URL(string: payload),
                  EventInvitation(url: url) != nil else { continue }
            finished = true
            stopScanning()
            onFound(url)
            return
        }
    }

    private nonisolated func fail(_ message: String) {
        DispatchQueue.main.async { [onFailure] in onFailure(message) }
    }
}
#endif
