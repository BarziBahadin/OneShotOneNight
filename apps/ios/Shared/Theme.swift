import SwiftUI
import UIKit

enum Theme {
    static let blue = Color(red: 0.12, green: 0.36, blue: 0.93)
    static let gold = Color(red: 0.96, green: 0.68, blue: 0.17)
    static let ink = Color(red: 0.025, green: 0.025, blue: 0.03)

    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .serif)
    }
}

struct EventBackdropImage: View {
    var body: some View {
        if let url = Bundle.main.url(forResource: "golden-event", withExtension: "jpg"),
           let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
        } else {
            Color.black
        }
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(minHeight: 58)
            .foregroundStyle(.white)
            .background(Theme.blue.opacity(configuration.isPressed ? 0.76 : 1), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct GlassCircleButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(width: 48, height: 48)
            .background(.black.opacity(configuration.isPressed ? 0.7 : 0.5), in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.12)))
            .contentShape(Circle())
    }
}
