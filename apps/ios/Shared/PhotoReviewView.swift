import SwiftUI
import UIKit

struct PhotoReviewView: View {
    let data: Data
    let isUploading: Bool
    let onRetake: () -> Void
    let onUse: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFit().ignoresSafeArea()
            }
            VStack {
                HStack { Text("LOOKS GOOD?").font(.caption.weight(.bold)).tracking(2).foregroundStyle(.white.opacity(0.68)); Spacer() }
                Spacer()
                HStack(spacing: 12) {
                    Button("Retake", action: onRetake).frame(maxWidth: .infinity).frame(height: 56).background(.ultraThinMaterial, in: Capsule())
                    Button(action: onUse) { if isUploading { ProgressView().frame(maxWidth: .infinity) } else { Label("Use photo", systemImage: "checkmark").frame(maxWidth: .infinity) } }.buttonStyle(PrimaryButtonStyle()).disabled(isUploading)
                }
                Text("It stays hidden until the host reveals the album.").font(.caption).foregroundStyle(.white.opacity(0.56)).padding(.top, 12)
            }.padding(20)
        }.preferredColorScheme(.dark)
    }
}

