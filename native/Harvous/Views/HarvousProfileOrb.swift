import SwiftUI

/// Glyph styling when there is no Clerk profile photo.
enum HarvousProfileOrbIconStyle {
    /// Subtle disc + primary person icon (toolbar / account orbs; matches web `circle-user`).
    case neutral
    /// Thread palette from settings — reserved for a future name-and-color editor.
    case threadColor
}

/// Toolbar / menu profile disc: Clerk photo when set, else person glyph on a styled disc.
struct HarvousProfileOrb: View {
    var imageUrl: String?
    var size: CGFloat = 28
    /// When set (e.g. iOS toolbar), sizes the `UserFilled` glyph; macOS 28pt orbs omit this.
    var glyphEdgePt: CGFloat?
    /// Profile orbs default to neutral; thread colors are opt-in only.
    var iconStyle: HarvousProfileOrbIconStyle = .neutral

    @AppStorage(HarvousSettingsStorageKeys.avatarColor)
    private var avatarColorRaw: String = HarvousAvatarColorToken.paper.rawValue

    @Environment(\.colorScheme) private var colorScheme

    private var hasProfilePhoto: Bool {
        HarvousProfilePhotoLoader.validatedURL(from: imageUrl) != nil
    }

    var body: some View {
        Group {
            if let url = HarvousProfilePhotoLoader.validatedURL(from: imageUrl) {
                HarvousProfilePhotoView(url: url, size: size)
            } else {
                iconFallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            if !hasProfilePhoto {
                Circle()
                    .strokeBorder(
                        Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.18),
                        lineWidth: 0.75
                    )
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var iconFallback: some View {
        ZStack {
            Circle()
                .fill(avatarFill)
            if let glyphEdgePt {
                HarvousFAGlyph(assetName: "Harvous.UserFilled", edgePt: glyphEdgePt)
                    .foregroundStyle(iconTint)
            } else {
                HarvousFAGlyph(assetName: "Harvous.UserFilled")
                    .foregroundStyle(iconTint)
            }
        }
    }

    private var avatarFill: Color {
        switch iconStyle {
        case .neutral:
            return Self.neutralFill(colorScheme: colorScheme)
        case .threadColor:
            let token = HarvousAvatarColorToken(rawValue: avatarColorRaw) ?? .paper
            switch token {
            case .paper:
                return Self.neutralFill(colorScheme: colorScheme)
            default:
                return Color.thread(avatarColorRaw) ?? Color.harvousAccent.opacity(0.35)
            }
        }
    }

    private var iconTint: Color {
        switch iconStyle {
        case .neutral:
            return Self.neutralGlyphTint(colorScheme: colorScheme)
        case .threadColor:
            let token = HarvousAvatarColorToken(rawValue: avatarColorRaw) ?? .paper
            switch token {
            case .paper:
                return Self.neutralGlyphTint(colorScheme: colorScheme)
            default:
                return Color.threadGlyph(avatarColorRaw) ?? Color.harvousAccent
            }
        }
    }

    static func neutralFill(colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.07)
    }

    static func neutralGlyphTint(colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? Color.white.opacity(0.55) : Color.primary.opacity(0.55)
    }
}
