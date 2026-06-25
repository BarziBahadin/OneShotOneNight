@preconcurrency import AVFoundation
import SwiftUI
import UIKit

struct QRScannerView: View {
    let onFound: (URL) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var scannerError: String?

    var body: some View {
        ZStack {
            #if targetEnvironment(simulator)
            Color.black.ignoresSafeArea()
            #else
            QRScannerCamera(onFound: onFound) { message in
                scannerError = message
            }
            .ignoresSafeArea()
            #endif

            LinearGradient(colors: [.black.opacity(0.52), .clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.headline).frame(width: 48, height: 48)
                    }
                    .background(.black.opacity(0.52), in: Circle())
                    Spacer()
                }
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: scannerError == nil ? "qrcode.viewfinder" : "camera.fill")
                        .font(.system(size: 34, weight: .light))
                    Text(scannerError == nil ? "Point at the event QR code" : "Scanner unavailable")
                        .font(.headline)
                    Text(scannerError ?? "The invitation opens automatically.")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                    if scannerError != nil {
                        Button("Paste the event link instead") { dismiss() }
                            .font(.footnote.weight(.semibold))
                            .padding(.top, 6)
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            }
            .padding(18)
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
    private nonisolated let sessionQueue = DispatchQueue(label: "com.oneshotonenight.qr-scanner")
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
