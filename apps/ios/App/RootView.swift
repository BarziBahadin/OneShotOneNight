import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
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
