#if os(iOS)
import PhotosUI
import SwiftUI
import UIKit
import Vision
import VisionKit

// MARK: - Full-screen compose flow (live scanner or photo OCR fallback)

struct IOSTextCaptureComposeFlow: View {
    let onCapture: (String) -> Void
    let onCancel: () -> Void

    private var useLiveScanner: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    var body: some View {
        Group {
            if useLiveScanner {
                IOSTextCaptureLiveScannerScreen(onCapture: onCapture, onCancel: onCancel)
            } else {
                IOSTextCapturePhotoOCRFallback(onCapture: onCapture, onCancel: onCancel)
            }
        }
    }
}

// MARK: - VisionKit live scanner

private struct IOSTextCaptureLiveScannerScreen: View {
    let onCapture: (String) -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                IOSTextCaptureDataScannerRepresentable(onTextCaptured: onCapture, onScannerUnavailable: onCancel)
                    .ignoresSafeArea()
            }
            .navigationTitle("Scan text")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
            }
        }
    }
}

private struct IOSTextCaptureDataScannerRepresentable: UIViewControllerRepresentable {
    var onTextCaptured: (String) -> Void
    var onScannerUnavailable: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onTextCaptured: onTextCaptured, onScannerUnavailable: onScannerUnavailable)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.text()],
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isHighlightingEnabled: true
        )
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
        context.coordinator.onTextCaptured = onTextCaptured
        context.coordinator.onScannerUnavailable = onScannerUnavailable
        guard !context.coordinator.didAttemptStart else { return }
        context.coordinator.didAttemptStart = true
        DispatchQueue.main.async {
            do {
                try uiViewController.startScanning()
            } catch {
                context.coordinator.onScannerUnavailable()
            }
        }
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onTextCaptured: (String) -> Void
        var onScannerUnavailable: () -> Void
        var didAttemptStart = false

        init(onTextCaptured: @escaping (String) -> Void, onScannerUnavailable: @escaping () -> Void) {
            self.onTextCaptured = onTextCaptured
            self.onScannerUnavailable = onScannerUnavailable
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            if case .text(let textItem) = item {
                let t = textItem.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                dataScanner.stopScanning()
                onTextCaptured(t)
            }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, becameUnavailableWithError error: Error) {
            onScannerUnavailable()
        }
    }
}

// MARK: - Photo library + Vision (simulator / unsupported devices)

private struct IOSTextCapturePhotoOCRFallback: View {
    let onCapture: (String) -> Void
    let onCancel: () -> Void

    @State private var pickerItem: PhotosPickerItem?
    @State private var isProcessing = false
    @State private var hint: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text(
                    "Live camera scanning isn’t available on this device. Choose a photo that contains text to copy it into a new note."
                )
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

                if let hint {
                    Text(hint)
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                if isProcessing {
                    ProgressView()
                        .padding(.vertical, 8)
                } else {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("Choose Photo", systemImage: "photo")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.horizontal, 24)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Import text")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
            }
            .onChange(of: pickerItem) { _, newVal in
                guard let newVal else { return }
                Task {
                    await runOCR(on: newVal)
                }
            }
        }
    }

    @MainActor
    private func runOCR(on item: PhotosPickerItem) async {
        isProcessing = true
        hint = nil
        defer {
            isProcessing = false
            pickerItem = nil
        }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            hint = "Could not load that image."
            return
        }
        let text = await Self.recognizeText(in: image)
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            hint = "No text found in that image."
            return
        }
        onCapture(trimmed)
    }

    private nonisolated static func recognizeText(in image: UIImage) async -> String {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                guard let cgImage = image.cgImage else {
                    continuation.resume(returning: "")
                    return
                }
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = true
                let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                do {
                    try handler.perform([request])
                    let observations = request.results ?? []
                    let pairs: [(CGFloat, String)] = observations.compactMap { obs in
                        guard let c = obs.topCandidates(1).first else { return nil }
                        return (obs.boundingBox.minY, c.string)
                    }
                    let sorted = pairs.sorted { $0.0 > $1.0 }
                    continuation.resume(returning: sorted.map(\.1).joined(separator: "\n"))
                } catch {
                    continuation.resume(returning: "")
                }
            }
        }
    }
}

#endif
