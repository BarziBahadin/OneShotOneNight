import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        Group {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-camera-design-preview") {
                CameraCaptureView(
                    eventName: "Maya & Leo",
                    remainingShots: 8,
                    maxShots: 12,
                    revealDate: .now.addingTimeInterval(8_076),
                    previewMode: true,
                    onOpenGallery: {}
                ) { _ in }
            } else {
                productionContent
            }
            #else
            productionContent
            #endif
        }
        .animation(.snappy, value: appModel.invitation)
    }

    @ViewBuilder
    private var productionContent: some View {
        if let invitation = appModel.invitation {
                GuestEventView(invitation: invitation) {
                    appModel.invitation = nil
                }
        } else {
            ScanLandingView()
        }
    }
}
