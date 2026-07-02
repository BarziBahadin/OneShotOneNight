import SwiftUI
import UIKit

enum Theme {
    static let background = Color(red: 11 / 255, green: 11 / 255, blue: 11 / 255)
    static let surface = Color(red: 23 / 255, green: 23 / 255, blue: 23 / 255)
    static let surfaceElevated = Color(red: 30 / 255, green: 30 / 255, blue: 30 / 255)
    static let surfaceStroke = Color(red: 42 / 255, green: 42 / 255, blue: 42 / 255)
    static let textMedium = Color(red: 184 / 255, green: 184 / 255, blue: 184 / 255)
    static let textLow = Color(red: 122 / 255, green: 122 / 255, blue: 122 / 255)
    static let accentGreen = Color(red: 25 / 255, green: 232 / 255, blue: 121 / 255)
    static let successSurface = Color(red: 6 / 255, green: 37 / 255, blue: 20 / 255)
    static let memoryYellow = Color(red: 244 / 255, green: 242 / 255, blue: 106 / 255)

    // Kept for camera/review screens that still use the established palette.
    static let blue = Color(red: 0.12, green: 0.36, blue: 0.93)
    static let gold = Color(red: 0.96, green: 0.68, blue: 0.17)
    static let ink = background

    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .serif)
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

private struct CapsulePressStyle: ButtonStyle {
    let foreground: Color
    let background: Color
    let height: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(background.opacity(configuration.isPressed ? 0.82 : 1), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.72), value: configuration.isPressed)
    }
}

struct PrimaryCapsuleButton: View {
    let title: String
    var systemImage: String? = nil
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title)
                if let systemImage { Image(systemName: systemImage) }
            }
        }
        .buttonStyle(CapsulePressStyle(
            foreground: isEnabled ? .black : Theme.textLow,
            background: isEnabled ? .white : Color(red: 67 / 255, green: 67 / 255, blue: 67 / 255),
            height: 64
        ))
        .disabled(!isEnabled)
    }
}

struct SecondaryCapsuleButton: View {
    let title: String
    var systemImage: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
        }
        .buttonStyle(CapsulePressStyle(foreground: .white, background: Theme.surfaceElevated, height: 58))
    }
}

struct IconSquareButton: View {
    let systemImage: String
    let accessibilityText: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 58, height: 58)
                .foregroundStyle(.white)
                .background(Theme.surfaceElevated, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.surfaceStroke))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityText)
    }
}

struct EventMetadataRow: View {
    let firstIcon: String
    let firstText: String
    let secondIcon: String
    let secondText: String
    var vertical = false

    var body: some View {
        Group {
            if vertical {
                VStack(alignment: .leading, spacing: 10) { items }
            } else {
                HStack(spacing: 22) { items }
            }
        }
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(Theme.textMedium)
    }

    @ViewBuilder private var items: some View {
        Label(firstText, systemImage: firstIcon)
        Label(secondText, systemImage: secondIcon)
    }
}

struct MemoryForeverCard: View {
    var body: some View {
        HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 9) {
                Text("Keep your memories forever")
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(Theme.memoryYellow)
                Text("Create an account to revisit your photos anytime.")
                    .font(.system(size: 15))
                    .foregroundStyle(.white.opacity(0.68))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Image(systemName: "arrow.down.to.line.compact")
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(.black)
                .frame(width: 54, height: 54)
                .background(Theme.memoryYellow, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(22)
        .frame(maxWidth: .infinity, minHeight: 140)
        .background(Theme.memoryYellow.opacity(0.055), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(Theme.memoryYellow.opacity(0.14)))
    }
}

// Existing camera and review views use these styles.
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
