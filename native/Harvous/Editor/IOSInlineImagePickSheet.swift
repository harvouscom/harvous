#if os(iOS)
import PhotosUI
import SwiftUI

/// Presents the system photo picker directly when inserting an inline image (no intermediate sheet).
private struct IOSInlineImagePickerModifier: ViewModifier {
    @Binding var isPresented: Bool
    var onPick: (UIImage) -> Void
    @State private var item: PhotosPickerItem?

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $isPresented, selection: $item, matching: .images)
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

extension View {
    func iosInlineImagePicker(isPresented: Binding<Bool>, onPick: @escaping (UIImage) -> Void) -> some View {
        modifier(IOSInlineImagePickerModifier(isPresented: isPresented, onPick: onPick))
    }
}

#endif
