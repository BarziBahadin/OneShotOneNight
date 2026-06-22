import SwiftUI
import VisionKit

struct QRScannerView: View {
    let onFound: (URL) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            QRDataScanner(onFound: onFound)
                .ignoresSafeArea()
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
                    Image(systemName: "qrcode.viewfinder").font(.system(size: 34, weight: .light))
                    Text("Point at the event QR code").font(.headline)
                    Text("The invitation opens automatically.").font(.footnote).foregroundStyle(.white.opacity(0.6))
                }
                .padding(24)
                .frame(maxWidth: .infinity)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            }
            .padding(18)
        }
        .preferredColorScheme(.dark)
    }
}

private struct QRDataScanner: UIViewControllerRepresentable {
    let onFound: (URL) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFound: onFound) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        try? controller.startScanning()
        return controller
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onFound: (URL) -> Void
        private var finished = false
        init(onFound: @escaping (URL) -> Void) { self.onFound = onFound }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !finished else { return }
            for item in addedItems {
                if case let .barcode(code) = item,
                   let payload = code.payloadStringValue,
                   let url = URL(string: payload),
                   EventInvitation(url: url) != nil {
                    finished = true
                    onFound(url)
                    return
                }
            }
        }
    }
}

