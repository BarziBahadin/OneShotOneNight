import SwiftUI

struct AppClipRootView: View {
    @Bindable var model: AppClipModel

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            switch model.state {
            case .waitingForURL, .loading:
                AppClipUploadStateView(title: "Opening event", message: "Getting your instant camera ready…")
            case .event(let event):
                AppClipEventView(event: event) { model.showCamera(for: event) }
            case .camera(let event):
                AppClipCameraView(event: event, onCancel: { model.returnToEvent(event) }) { model.upload($0, to: event) }
            case .uploading:
                AppClipUploadStateView(title: "Uploading", message: "Adding your moment to the party…")
            case .success(let event):
                AppClipSuccessView(event: event) { model.returnToEvent(event) }
            case .error(let title, let message, let canRetry):
                AppClipErrorView(title: title, message: message, canRetry: canRetry, retry: model.retry)
            }
        }
        .task { model.start() }
        #if DEBUG
        .overlay(alignment: .topTrailing) { AppClipDebugPanel(route: model.route) }
        #endif
    }
}

struct AppClipEventView: View {
    let event: AppClipEvent
    let start: () -> Void

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottom) {
                EventBackdropImage().ignoresSafeArea()
                LinearGradient(colors: [.black.opacity(0.08), .black.opacity(0.3), .black.opacity(0.98)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()
                VStack(spacing: 20) {
                    Spacer()
                    Label("Hosted by \(event.hostName)", systemImage: "person.2.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .padding(.horizontal, 18).frame(height: 44)
                        .background(.black.opacity(0.48), in: Capsule())
                    Text(event.name)
                        .font(Theme.display(46))
                        .multilineTextAlignment(.center)
                    Label("\(event.remainingPhotos) shots available", systemImage: "camera.fill")
                        .foregroundStyle(Theme.textMedium)
                    PrimaryCapsuleButton(title: "Open event camera", systemImage: "arrow.right", action: start)
                    Text("No account needed")
                        .font(.footnote.weight(.medium)).foregroundStyle(Theme.textLow)
                }
                .frame(maxWidth: 560)
                .padding(.horizontal, 32)
                .padding(.bottom, max(proxy.safeAreaInsets.bottom, 24) + 18)
            }
        }
    }
}

struct AppClipUploadStateView: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 22) {
            ProgressView().controlSize(.large).tint(.white)
            Text(title).font(Theme.display(34))
            Text(message).foregroundStyle(Theme.textMedium).multilineTextAlignment(.center)
        }
        .padding(32)
    }
}

struct AppClipSuccessView: View {
    let event: AppClipEvent
    let addAnother: () -> Void
    @Environment(\.openURL) private var openURL
    @State private var handoffMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark")
                .font(.system(size: 38, weight: .bold)).foregroundStyle(.black)
                .frame(width: 92, height: 92).background(Theme.accentGreen, in: Circle())
            VStack(spacing: 10) {
                Text("Moment shared")
                    .font(Theme.display(40))
                Text("Your photo is now part of \(event.name).")
                    .foregroundStyle(Theme.textMedium).multilineTextAlignment(.center)
            }
            Spacer()
            VStack(spacing: 12) {
                PrimaryCapsuleButton(title: "Add another photo", systemImage: "camera.fill", action: addAnother)
                SecondaryCapsuleButton(title: "Open Full App", systemImage: "arrow.up.forward.app") {
                    openURL(AppClipConfig.fullAppURL(eventSlug: event.slug)) { accepted in
                        if !accepted { handoffMessage = "The full app is not available yet. Your photo is safely shared." }
                    }
                }
            }
        }
        .padding(30)
        .alert("Full app unavailable", isPresented: Binding(get: { handoffMessage != nil }, set: { if !$0 { handoffMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(handoffMessage ?? "Please try again later.") }
    }
}

struct AppClipErrorView: View {
    let title: String
    let message: String
    let canRetry: Bool
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 42)).foregroundStyle(Theme.memoryYellow)
            Text(title).font(Theme.display(34)).multilineTextAlignment(.center)
            Text(message).foregroundStyle(Theme.textMedium).multilineTextAlignment(.center)
            if canRetry { PrimaryCapsuleButton(title: "Try again", action: retry) }
        }
        .padding(32)
    }
}

#if DEBUG
private struct AppClipDebugPanel: View {
    let route: AppClipRoute?
    @State private var expanded = false

    var body: some View {
        Button { expanded.toggle() } label: {
            VStack(alignment: .trailing, spacing: 3) {
                Text("TEST").font(.caption2.bold()).foregroundStyle(.black)
                if expanded {
                    Text(route?.eventSlug ?? "waiting for URL")
                    Text(route?.eventID.map { "id: \($0)" } ?? "id: —")
                }
            }
            .font(.caption2.monospaced()).foregroundStyle(.white)
            .padding(8).background(Theme.memoryYellow.opacity(0.92), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain).padding(12)
        .accessibilityLabel("Toggle App Clip test details")
    }
}
#endif
