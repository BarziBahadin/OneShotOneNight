import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

struct AppClipCameraView: View {
    let event: AppClipEvent
    let onCancel: () -> Void
    let onPhoto: (Data) -> Void
    @State private var cameraPresented = false
    @State private var selectedItem: PhotosPickerItem?
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 26) {
            Spacer()
            Image(systemName: "camera.aperture")
                .font(.system(size: 54, weight: .light))
                .foregroundStyle(.white)
                .frame(width: 112, height: 112)
                .background(Theme.surfaceElevated, in: Circle())
                .overlay(Circle().stroke(Theme.surfaceStroke))
            VStack(spacing: 10) {
                Text("Capture the moment")
                    .font(Theme.display(36))
                Text("Your photo uploads immediately to \(event.name).")
                    .foregroundStyle(Theme.textMedium)
                    .multilineTextAlignment(.center)
            }
            VStack(spacing: 12) {
                PrimaryCapsuleButton(title: "Take a photo", systemImage: "camera.fill") { requestCamera() }
                PhotosPicker(selection: $selectedItem, matching: .images) {
                    Label("Choose from library", systemImage: "photo.on.rectangle")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 58)
                        .background(Theme.surfaceElevated, in: Capsule())
                }
                Button("Back", action: onCancel)
                    .foregroundStyle(Theme.textMedium)
                    .frame(minHeight: 44)
            }
            Spacer()
        }
        .padding(28)
        .background(Theme.background.ignoresSafeArea())
        .sheet(isPresented: $cameraPresented) {
            AppClipImagePicker(sourceType: .camera) { image in
                cameraPresented = false
                use(image)
            } onCancel: { cameraPresented = false }
                .ignoresSafeArea()
        }
        .onChange(of: selectedItem) { _, item in
            guard let item else { return }
            Task {
                do {
                    guard let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                        throw AppClipPhotoError.unreadable
                    }
                    use(image)
                } catch {
                    errorMessage = "That photo could not be read. Please choose another."
                }
            }
        }
        .alert("Photo unavailable", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorMessage ?? "Please try again.") }
    }

    private func requestCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            errorMessage = "A camera is not available on this device. Choose a photo instead."
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: cameraPresented = true
        case .notDetermined:
            Task {
                if await AVCaptureDevice.requestAccess(for: .video) { cameraPresented = true }
                else { errorMessage = "Camera access is off. Enable it in Settings or choose a photo." }
            }
        default: errorMessage = "Camera access is off. Enable it in Settings or choose a photo."
        }
    }

    private func use(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.84) else {
            errorMessage = "That photo could not be prepared for upload."
            return
        }
        onPhoto(data)
    }
}

private enum AppClipPhotoError: Error { case unreadable }

private struct AppClipImagePicker: UIViewControllerRepresentable {
    let sourceType: UIImagePickerController.SourceType
    let onImage: (UIImage) -> Void
    let onCancel: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = sourceType
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: AppClipImagePicker
        init(parent: AppClipImagePicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) } else { parent.onCancel() }
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.onCancel() }
    }
}
