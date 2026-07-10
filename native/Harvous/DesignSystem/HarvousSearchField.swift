import SwiftUI

/// Canonical search field — mirrors web `PrototypeSearchInput`.
struct HarvousSearchField: View {
    @Binding var text: String
    var placeholder: String = "Search"
    var onSubmit: (() -> Void)? = nil
    var isFocused: FocusState<Bool>.Binding? = nil

    @FocusState private var internalFocused: Bool

    var body: some View {
        HStack(spacing: HarvousSpacing.space2) {
            HarvousFAGlyph(assetName: "Harvous.MagnifyingGlass", edgePt: HarvousIconSize.sm)
                .foregroundStyle(.secondary)
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .font(HarvousFonts.font(size: 15, weight: .regular, design: .default))
                .focused(focusBinding)
                .onSubmit { onSubmit?() }
            if !text.isEmpty {
                Button {
                    text = ""
                    focusBinding.wrappedValue = true
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 15)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, HarvousSpacing.space3)
        .padding(.vertical, HarvousSpacing.space2)
        .background(
            RoundedRectangle(cornerRadius: HarvousRadius.button, style: .continuous)
                .fill(Color.primary.opacity(0.07))
        )
        .accessibilityElement(children: .contain)
    }

    private var focusBinding: FocusState<Bool>.Binding {
        isFocused ?? $internalFocused
    }
}
