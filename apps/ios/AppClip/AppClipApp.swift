import SwiftUI

@main
struct AppClipApp: App {
    @State private var model = AppClipModel()

    var body: some Scene {
        WindowGroup {
            AppClipRootView(model: model)
                .preferredColorScheme(.dark)
                .onOpenURL { model.open($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { model.open(url) }
                }
        }
    }
}
