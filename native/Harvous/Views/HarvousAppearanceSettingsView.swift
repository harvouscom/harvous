import SwiftUI
import PhotosUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct SettingsAppearanceView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(HarvousAppearanceStore.self) private var store

    @State private var showPhotoPicker = false
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                colorSchemeSection

                Text("Choose a canvas color or photo—the shell glass tints to match. Saved on this device.")
                    .font(HarvousTypography.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(orderedOptions()) { option in
                            switch option {
                            case let .preset(preset):
                                HarvousAppearancePreviewTile(
                                    label: preset.displayLabel(for: colorScheme),
                                    selected: preset.matches(store.activeBackground),
                                    canvasColor: Color(hex: preset.swatchHex(for: colorScheme))
                                        ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme),
                                    glassMode: .preset,
                                    onSelect: {
                                        errorMessage = nil
                                        store.selectPreset(preset, colorScheme: colorScheme)
                                    }
                                )
                            case .photo:
                                HarvousAppearancePreviewTile(
                                    label: "Photo",
                                    selected: store.isPhotoSelected(),
                                    canvasColor: nil,
                                    thumbnailImage: store.hasSavedWallpaper ? store.savedWallpaperThumbnail() : nil,
                                    photoEmpty: !store.hasSavedWallpaper,
                                    glassMode: store.hasSavedWallpaper ? .image : .preset,
                                    onSelect: pickPhoto
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }

                if store.hasSavedWallpaper {
                    VStack(spacing: 0) {
                        Button(action: { showPhotoPicker = true }) {
                            HStack(spacing: 10) {
                                if let thumb = store.savedWallpaperThumbnail() {
                                    #if os(macOS)
                                    Image(nsImage: thumb)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 36, height: 36)
                                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                    #else
                                    Image(uiImage: thumb)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 36, height: 36)
                                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                    #endif
                                }
                                Text("Replace image")
                                    .font(HarvousTypography.settingsListRow)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(12)
                        }
                        .buttonStyle(.plain)

                        Divider()

                        Button(role: .destructive, action: {
                            errorMessage = nil
                            store.removeSavedWallpaper()
                        }) {
                            Text("Remove image")
                                .font(HarvousTypography.settingsListRow)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                        }
                        .buttonStyle(.plain)
                    }
                    .background(settingsRowBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .padding(.horizontal, 16)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 16)
                }
            }
            .padding(.vertical, 12)
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoPickerItem, matching: .images)
        .onChange(of: photoPickerItem) { _, item in
            guard let item else { return }
            Task { await handlePickedPhoto(item) }
        }
        .onChange(of: colorScheme) { _, scheme in
            store.refreshAppearanceForColorScheme(scheme)
        }
    }

    @ViewBuilder
    private var colorSchemeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Color scheme")
                .font(HarvousTypography.footnote)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)

            VStack(spacing: 0) {
                ForEach(Array(HarvousColorSchemePreference.allCases.enumerated()), id: \.element) { index, pref in
                    if index > 0 { Divider() }
                    Button(action: { store.setColorSchemePreference(pref) }) {
                        HStack {
                            Text(pref.label)
                                .font(HarvousTypography.settingsListRow)
                                .foregroundStyle(Color.primary)
                            Spacer()
                            if store.colorSchemePreference == pref {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Color.harvousAccent)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(settingsRowBackground)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .padding(.horizontal, 16)
        }
    }

    private var settingsRowBackground: Color {
        #if os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color(uiColor: .secondarySystemGroupedBackground)
        #endif
    }

    private enum CarouselOption: Identifiable {
        case preset(HarvousAppearancePreset)
        case photo

        var id: String {
            switch self {
            case let .preset(p): return p.id
            case .photo: return "photo"
            }
        }
    }

    private func orderedOptions() -> [CarouselOption] {
        var options: [CarouselOption] = HarvousAppearancePreset.catalog.map { .preset($0) }
        options.append(.photo)
        let activeIndex = options.firstIndex { option in
            switch option {
            case let .preset(p): return p.matches(store.activeBackground)
            case .photo: return store.isPhotoSelected()
            }
        } ?? 0
        guard activeIndex > 0 else { return options }
        let active = options[activeIndex]
        var rest = options
        rest.remove(at: activeIndex)
        return [active] + rest
    }

    private func pickPhoto() {
        errorMessage = nil
        if store.hasSavedWallpaper {
            store.selectSavedWallpaper()
        } else {
            showPhotoPicker = true
        }
    }

    private func handlePickedPhoto(_ item: PhotosPickerItem) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                await MainActor.run { errorMessage = HarvousAppearanceError.processingFailed.localizedDescription }
                await MainActor.run { photoPickerItem = nil }
                return
            }
            #if os(macOS)
            guard let image = NSImage(data: data) else {
                await MainActor.run { errorMessage = HarvousAppearanceError.processingFailed.localizedDescription }
                await MainActor.run { photoPickerItem = nil }
                return
            }
            #else
            guard let image = UIImage(data: data) else {
                await MainActor.run { errorMessage = HarvousAppearanceError.processingFailed.localizedDescription }
                await MainActor.run { photoPickerItem = nil }
                return
            }
            #endif
            try await MainActor.run {
                _ = try store.saveUploadedImage(image, colorScheme: colorScheme)
                errorMessage = nil
                photoPickerItem = nil
            }
        } catch let error as HarvousAppearanceError {
            await MainActor.run {
                errorMessage = error.localizedDescription
                photoPickerItem = nil
            }
        } catch {
            await MainActor.run {
                errorMessage = HarvousAppearanceError.processingFailed.localizedDescription
                photoPickerItem = nil
            }
        }
    }
}
