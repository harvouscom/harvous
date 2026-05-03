#if os(iOS)
import PhotosUI
import SwiftUI

/// Sheet for inserting an inline image into the note editor (photo library).
struct IOSInlineImagePickSheet: View {
    @Binding var isPresented: Bool
    var onPick: (UIImage) -> Void
    @State private var item: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            PhotosPicker(selection: $item, matching: .images) {
                Label("Choose Photo", systemImage: "photo.on.rectangle.angled")
                    .font(.headline)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(24)
            .navigationTitle("Insert Image")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
            }
            .onChange(of: item) { _, newVal in
                guard let newVal else { return }
                Task {
                    defer {
                        Task { @MainActor in item = nil }
                    }
                    guard let data = try? await newVal.loadTransferable(type: Data.self),
                          let img = UIImage(data: data) else { return }
                    await MainActor.run {
                        onPick(img)
                        isPresented = false
                    }
                }
            }
        }
    }
}

#endif
