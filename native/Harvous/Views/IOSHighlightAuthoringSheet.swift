#if os(iOS)
import SwiftUI

/// iPhone highlight confirmation: standard form sheet (not the inline macOS-style capsule).
struct IOSHighlightAuthoringSheet: View {
    let excerptPreview: String
    @Binding var annotationText: String
    @Binding var titleText: String
    @Binding var selectedAccent: StudyHighlightAccentToken
    var onCancel: () -> Void
    var onSave: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(excerptPreview)
                        .font(HarvousTypography.body)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                } header: {
                    Text("Selected text")
                }

                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .center, spacing: 6) {
                            ForEach(StudyHighlightAccentToken.pickerChoices, id: \.rawValue) { token in
                                accentChoice(token)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
                } header: {
                    Text("Color")
                }

                Section {
                    TextField("Note (optional)", text: $annotationText, axis: .vertical)
                        .font(HarvousTypography.searchField)
                        .lineLimit(3, reservesSpace: true)
                        .textInputAutocapitalization(.sentences)
                    TextField("Title (optional)", text: $titleText)
                        .font(HarvousTypography.searchField)
                        .textInputAutocapitalization(.sentences)
                } header: {
                    Text("Details")
                }
            }
            .navigationTitle("New highlight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: onSave)
                        .fontWeight(.semibold)
                }
            }
        }
        // Neutral nav bar actions — parent shell uses `NavigationStack.tint(.harvousAccent)` (see `SpaceSwitcherView`, `YouRootView` sheet).
        .tint(.primary)
    }

    private func accentChoice(_ token: StudyHighlightAccentToken) -> some View {
        let picked = selectedAccent == token
        return Button {
            selectedAccent = token
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Color.primary.opacity(picked ? 0.55 : 0.12), lineWidth: picked ? 2.5 : 1)
                    .frame(width: 36, height: 36)
                swatch(token)
                    .frame(width: 26, height: 26)
                    .clipShape(Circle())
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(token.label) highlight color")
        .accessibilityAddTraits(picked ? .isSelected : [])
    }

    @ViewBuilder
    private func swatch(_ token: StudyHighlightAccentToken) -> some View {
        let isDark = colorScheme == .dark
        Color(uiColor: token.resolvedAccentUIColor(kind: .miniNote, isDark: isDark))
    }
}
#endif
