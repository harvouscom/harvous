import SwiftUI

// MARK: - Theme / keyword tag (hashtag)

struct ThemeTagChip: View {
    let text: String

    var body: some View {
        Text("#\(text)")
            .font(HarvousTypography.subheadline)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.secondary.opacity(0.12), in: Capsule())
    }
}

// MARK: - Scripture (matches inline `ScripturePillAttachment` — system blue fill + stroke, rounded rect)

struct ScriptureRefChip: View {
    let reference: String
    var onTap: (() -> Void)? = nil

    var body: some View {
        let chip = HStack(spacing: 4) {
            Image(systemName: "bookmark.fill")
                .font(.system(size: 9, weight: .semibold))
            Text(reference)
                .font(HarvousTypography.inspectorCompactMedium)
        }
        .foregroundStyle(HarvousColors.scripturePillForeground)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(HarvousColors.scripturePillBackground, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .strokeBorder(HarvousColors.scripturePillBorder, lineWidth: 0.5)
        )

        if let onTap {
            Button(action: onTap) {
                chip
            }
            .buttonStyle(.plain)
        } else {
            chip
        }
    }
}
