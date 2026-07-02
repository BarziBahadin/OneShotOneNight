import Observation
import SwiftUI

typealias ScanLandingView = JoinEventEntryView

@MainActor
@Observable
final class JoinEventViewModel {
    var guestName = UserDefaults.standard.string(forKey: "guest-display-name") ?? ""
    var inviteLink = ""
    var isScannerPresented = false
    var isPasteLinkPresented = false
    var isLoading = false
    var errorMessage: String?

    var canContinue: Bool {
        !guestName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func scanQRCode() {
        guard canContinue else { return }
        errorMessage = nil
        isScannerPresented = true
    }

    func pasteInviteLink() {
        guard canContinue else { return }
        errorMessage = nil
        isPasteLinkPresented = true
    }

    func handleScannedCode(_ code: String) -> URL? {
        resolveInvitation(code)
    }

    func handlePastedLink() -> URL? {
        resolveInvitation(inviteLink)
    }

    func resolveInvitation(_ link: String) -> URL? {
        let cleanedLink = link.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canContinue,
              let url = URL(string: cleanedLink),
              EventInvitation(url: url) != nil else {
            errorMessage = "This invitation link is not valid. Please check the link and try again."
            return nil
        }
        let cleanedName = guestName.trimmingCharacters(in: .whitespacesAndNewlines)
        UserDefaults.standard.set(cleanedName, forKey: "guest-display-name")
        guestName = cleanedName
        errorMessage = nil
        return url
    }
}

struct JoinEventEntryView: View {
    @Environment(AppModel.self) private var appModel
    @State private var viewModel = JoinEventViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                LinearGradient(
                    colors: [Theme.surface.opacity(0.32), Theme.background],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 30) {
                        Spacer(minLength: 150)

                        Image(systemName: "camera.aperture")
                            .font(.system(size: 26, weight: .light))
                            .foregroundStyle(Theme.memoryYellow)
                            .frame(width: 58, height: 58)
                            .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

                        VStack(alignment: .leading, spacing: 14) {
                            Text("Join a film")
                                .font(.system(size: 48, weight: .regular, design: .serif))
                                .foregroundStyle(.white)
                            Text("Enter your name and scan your invitation QR code, or paste the invitation link.")
                                .font(.system(size: 17))
                                .foregroundStyle(Theme.textMedium)
                                .lineSpacing(4)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        HStack(spacing: 14) {
                            Image(systemName: "person.fill")
                                .foregroundStyle(Theme.textMedium)
                            TextField("Enter your name", text: $viewModel.guestName)
                                .font(.system(size: 17, weight: .medium))
                                .textInputAutocapitalization(.words)
                                .submitLabel(.continue)
                        }
                        .padding(.horizontal, 22)
                        .frame(height: 72)
                        .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Theme.surfaceStroke))

                        VStack(spacing: 14) {
                            PrimaryCapsuleButton(
                                title: "Scan QR Code",
                                systemImage: "qrcode.viewfinder",
                                isEnabled: viewModel.canContinue
                            ) { viewModel.scanQRCode() }
                            .accessibilityHint("Opens the camera to scan an event invitation")

                            SecondaryCapsuleButton(title: "Paste Invitation Link", systemImage: "link") {
                                viewModel.pasteInviteLink()
                            }
                            .opacity(viewModel.canContinue ? 1 : 0.45)
                            .disabled(!viewModel.canContinue)
                            .overlay(Capsule().stroke(Theme.surfaceStroke))
                        }

                        if let errorMessage = viewModel.errorMessage {
                            Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                                .font(.footnote)
                                .foregroundStyle(.red.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 32)
                    }
                    .frame(maxWidth: 560, alignment: .leading)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 32)
                    .frame(maxWidth: .infinity)
                }
                .scrollIndicators(.hidden)
            }
        }
        .sheet(isPresented: $viewModel.isScannerPresented) {
            QRCodeScannerView { code in
                guard let url = viewModel.handleScannedCode(code) else { return }
                viewModel.isScannerPresented = false
                appModel.open(url)
            }
        }
        .sheet(isPresented: $viewModel.isPasteLinkPresented) {
            PasteInviteLinkView(viewModel: viewModel) { url in
                viewModel.isPasteLinkPresented = false
                appModel.open(url)
            }
            .presentationDetents([.height(360)])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(36)
        }
        .preferredColorScheme(.dark)
    }
}

struct PasteInviteLinkView: View {
    @Bindable var viewModel: JoinEventViewModel
    let onContinue: (URL) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                VStack(alignment: .leading, spacing: 22) {
                    Text("Paste invitation link")
                        .font(.system(size: 34, weight: .regular, design: .serif))
                    Text("Paste the link shared by your host to open this film.")
                        .foregroundStyle(Theme.textMedium)

                    HStack(spacing: 12) {
                        Image(systemName: "link").foregroundStyle(Theme.textMedium)
                        TextField("https://…", text: $viewModel.inviteLink)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                            .submitLabel(.go)
                            .onSubmit(continueWithLink)
                    }
                    .padding(.horizontal, 20)
                    .frame(height: 68)
                    .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Theme.surfaceStroke))

                    if let errorMessage = viewModel.errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red.opacity(0.9))
                    }

                    PrimaryCapsuleButton(
                        title: "Continue",
                        systemImage: "arrow.right",
                        isEnabled: !viewModel.inviteLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                        action: continueWithLink
                    )
                }
                .padding(24)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                }
            }
        }
    }

    private func continueWithLink() {
        if let url = viewModel.handlePastedLink() { onContinue(url) }
    }
}

#if DEBUG
#Preview("Join a film") {
    JoinEventEntryView()
        .environment(AppModel())
}
#endif
