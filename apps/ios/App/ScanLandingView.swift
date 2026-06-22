import SwiftUI

struct ScanLandingView: View {
    @Environment(AppModel.self) private var appModel
    @State private var showsScanner = false
    @State private var pastedLink = ""
    @State private var message: String?

    var body: some View {
        GeometryReader { canvas in
        ZStack {
            EventBackdropImage()
                .frame(width: canvas.size.width, height: canvas.size.height)
                .clipped()
                .ignoresSafeArea()
            LinearGradient(colors: [.black.opacity(0.18), .black.opacity(0.96)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                Spacer()
                Text("ONESHOT · ONENIGHT")
                    .font(.caption.weight(.bold))
                    .tracking(2.2)
                    .foregroundStyle(Theme.gold)
                Text("Every angle of\nthe night.")
                    .font(Theme.display(50))
                    .tracking(-1.8)
                    .padding(.top, 12)
                Text("Scan the host’s code. Take your photos. See everyone’s moments together when the album reveals.")
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.68))
                    .lineSpacing(4)
                    .padding(.top, 18)

                Button { showsScanner = true } label: {
                    Label("Scan event QR", systemImage: "qrcode.viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.top, 28)

                HStack(spacing: 10) {
                    TextField("Paste event link", text: $pastedLink)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .padding(.horizontal, 16)
                        .frame(height: 52)
                        .background(.ultraThinMaterial, in: Capsule())
                    Button("Open") { openPastedLink() }
                        .font(.subheadline.weight(.semibold))
                        .frame(height: 52)
                        .padding(.horizontal, 18)
                        .background(.white.opacity(0.11), in: Capsule())
                }
                .padding(.top, 12)

                if let message {
                    Text(message).font(.footnote).foregroundStyle(.red.opacity(0.9)).padding(.top, 10)
                }
            }
            .frame(width: max(canvas.size.width - 44, 0), alignment: .leading)
            .padding(22)
            .padding(.bottom, 12)
        }
        .frame(width: canvas.size.width, height: canvas.size.height)
        .clipped()
        }
        .sheet(isPresented: $showsScanner) {
            QRScannerView { url in
                showsScanner = false
                appModel.open(url)
            }
        }
    }

    private func openPastedLink() {
        guard let url = URL(string: pastedLink.trimmingCharacters(in: .whitespacesAndNewlines)),
              EventInvitation(url: url) != nil else {
            message = "That doesn’t look like a valid event link."
            return
        }
        message = nil
        appModel.open(url)
    }
}
