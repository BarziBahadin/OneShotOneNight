import SwiftUI

struct GalleryView: View {
    @Bindable var model: GuestEventModel
    @Environment(\.dismiss) private var dismiss
    private let columns = [GridItem(.flexible(), spacing: 2), GridItem(.flexible(), spacing: 2)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 2) {
                    ForEach(model.photos) { photo in
                        if let value = photo.publicURL, let url = URL(string: value) {
                            AsyncImage(url: url) { phase in
                                if let image = phase.image { image.resizable().scaledToFill() }
                                else { Rectangle().fill(.white.opacity(0.06)).overlay { ProgressView() } }
                            }.frame(height: 210).clipped()
                        }
                    }
                }
            }
            .background(Theme.ink)
            .navigationTitle(model.event?.name ?? "Revealed")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Close") { dismiss() } } }
        }
        .task { await model.loadGallery() }
        .preferredColorScheme(.dark)
    }
}

