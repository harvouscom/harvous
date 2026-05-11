import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Condensed add-link form — presented from `NoteEditorView` / `ComposeView`.
struct AddLinkSheetView: View {
    @ObservedObject var proxy: EditorProxy
    @FocusState private var focused: Field?
    @Environment(\.colorScheme) private var colorScheme

    private enum Field: Hashable {
        case linkTo
        case name
    }

    private let cornerOuter: CGFloat = 22
    private let fieldCorner: CGFloat = 10
    private let nameCorner: CGFloat = 999
    private var accent: Color { Color.harvousAccent }

    private var cardBackground: Color {
#if os(macOS)
        colorScheme == .dark ? Color(nsColor: .windowBackgroundColor).opacity(0.96) : Color(white: 0.99)
#else
        Color(uiColor: .secondarySystemGroupedBackground)
#endif
    }

    private var separatorStroke: Color {
#if os(macOS)
        Color(nsColor: .separatorColor).opacity(0.85)
#else
        Color(uiColor: .separator)
#endif
    }

    private var fieldFill: Color {
#if os(macOS)
        Color(nsColor: .textBackgroundColor).opacity(0.55)
#else
        Color(uiColor: .secondarySystemFill)
#endif
    }

    private var quaternaryFieldStroke: Color {
#if os(macOS)
        Color(nsColor: .separatorColor).opacity(0.6)
#else
        Color(uiColor: .opaqueSeparator).opacity(0.6)
#endif
    }

    private var nameBubbleFill: Color {
#if os(macOS)
        Color(nsColor: .quaternaryLabelColor).opacity(0.2)
#else
        Color(uiColor: .quaternaryLabel).opacity(0.2)
#endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Add Link")
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.bottom, 10)

            Text("Link To")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
                .padding(.bottom, 3)

            TextField("Enter a URL or note title", text: $proxy.addLinkTargetURL)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: fieldCorner, style: .continuous)
                        .strokeBorder(
                            (focused == .linkTo ? accent : separatorStroke),
                            lineWidth: focused == .linkTo ? 2.5 : 1
                        )
                )
                .background(
                    RoundedRectangle(cornerRadius: fieldCorner, style: .continuous)
                        .fill(fieldFill)
                )
                .focused($focused, equals: .linkTo)
                .submitLabel(.next)
                .onSubmit { focused = .name }
                .padding(.bottom, 8)

            Text("Name")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
                .padding(.bottom, 3)

            HStack(spacing: 6) {
                TextField("Visible label", text: $proxy.addLinkDisplayName)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(
                        RoundedRectangle(cornerRadius: nameCorner, style: .continuous)
                            .fill(nameBubbleFill)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: nameCorner, style: .continuous)
                            .strokeBorder(quaternaryFieldStroke, lineWidth: 1)
                    )
                    .focused($focused, equals: .name)
#if os(iOS)
                    .submitLabel(.done)
                    .onSubmit { proxy.applyAddLinkFromSheet() }
#endif
                if !proxy.addLinkDisplayName.isEmpty {
                    Button {
                        proxy.addLinkDisplayName = ""
                    } label: {
                        HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 14)
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
#if os(macOS)
                    .help("Clear")
#endif
                }
            }
            .padding(.bottom, 10)

            HStack(alignment: .center, spacing: 0) {
                if !proxy.addLinkIsInsertionPoint {
                    Button("Remove link") {
                        proxy.removeLinkFromAddLinkSheet()
                    }
                    .font(.system(size: 12, weight: .medium))
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Button("Cancel") {
                    proxy.cancelAddLinkSheet()
                }
#if os(macOS)
                .keyboardShortcut(.cancelAction)
#endif
                .buttonStyle(CondensedAddLinkButtonStyle(role: .cancel))
                Button("OK") {
                    proxy.applyAddLinkFromSheet()
                }
#if os(macOS)
                .keyboardShortcut(.defaultAction)
#endif
                .buttonStyle(CondensedAddLinkButtonStyle(role: .ok, accent: accent))
            }
        }
        .padding(16)
#if os(macOS)
        .frame(width: 300)
#endif
        .background(
            RoundedRectangle(cornerRadius: cornerOuter, style: .continuous)
                .fill(cardBackground)
#if os(macOS)
                .shadow(color: .black.opacity(0.12), radius: 20, y: 8)
#endif
        )
#if os(iOS)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
#endif
        .onAppear { focused = .linkTo }
    }
}

// MARK: - Button style (compact gray cancel / warm OK)

private struct CondensedAddLinkButtonStyle: ButtonStyle {
    enum Role { case cancel, ok }
    var role: Role
    var accent: Color = Color.harvousAccent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                Group {
                    switch role {
                    case .cancel:
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Self.cancelBacking)
                    case .ok:
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(accent)
                    }
                }
            )
            .foregroundStyle(role == .ok ? Color.white : Color.primary)
            .opacity(configuration.isPressed ? 0.88 : 1)
    }

    private static var cancelBacking: Color {
#if os(macOS)
        Color(nsColor: .quaternaryLabelColor).opacity(0.35)
#else
        Color(uiColor: .quaternaryLabel).opacity(0.35)
#endif
    }
}
