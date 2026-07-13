import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var appModel
    @State private var showsSplash = true

    var body: some View {
        ZStack {
            Group {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-camera-design-preview") {
                CameraCaptureView(
                    eventName: "Once party 2026",
                    remainingShots: 18,
                    maxShots: 24,
                    revealDate: .now.addingTimeInterval(1_101_600),
                    invitationURL: URL(string: "https://oneshotonenight.app/guest/once-party-2026?t=preview"),
                    previewMode: true,
                    onOpenGallery: {}
                ) { _ in }
            } else if ProcessInfo.processInfo.arguments.contains("-event-layout-preview") {
                GuestEventView(previewEvent: .layoutPreview)
            } else {
                productionContent
            }
            #else
            productionContent
            #endif
            }
            if showsSplash {
                NightframeSplashView()
                    .transition(.opacity)
                    .zIndex(10)
            }
        }
        .task {
            guard showsSplash else { return }
            try? await Task.sleep(for: .milliseconds(900))
            withAnimation(.easeOut(duration: 0.35)) { showsSplash = false }
        }
    }

    @ViewBuilder
    private var productionContent: some View {
        if let invitation = appModel.invitation {
                GuestEventView(invitation: invitation) {
                    appModel.closeInvitation()
                }
        } else {
            ScanLandingView()
        }
    }
}
