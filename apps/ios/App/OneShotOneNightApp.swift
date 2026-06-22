import SwiftUI

@main
struct OneShotOneNightApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appModel)
                .preferredColorScheme(.dark)
                .onOpenURL { appModel.open($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { appModel.open(url) }
                }
        }
    }
}

