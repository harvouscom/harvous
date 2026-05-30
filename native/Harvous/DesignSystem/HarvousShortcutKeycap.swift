import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

// MARK: - Keycap styling (settings + floating hints)

enum HarvousShortcutKeycapMetrics {
    static let settingsFontSize: CGFloat = 12.5
    static let settingsMinWidth: CGFloat = 24
    static let settingsMinHeight: CGFloat = 22

    static let hintFontSize: CGFloat = 9
    static let hintMinWidth: CGFloat = 16
    static let hintMinHeight: CGFloat = 16
}

struct HarvousShortcutKeycap: View {
    let symbol: String
    var compact: Bool = false

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.harvousGlassTint) private var glassTint
    @Environment(HarvousAppearanceStore.self) private var appearanceStore

    var body: some View {
        keycapLabel
            .multilineTextAlignment(.center)
            .frame(
                minWidth: compact ? HarvousShortcutKeycapMetrics.hintMinWidth : HarvousShortcutKeycapMetrics.settingsMinWidth,
                minHeight: compact ? HarvousShortcutKeycapMetrics.hintMinHeight : HarvousShortcutKeycapMetrics.settingsMinHeight
            )
            .padding(.horizontal, compact ? 3 : 5)
            .padding(.vertical, compact ? 1 : 3)
            .background {
                RoundedRectangle(cornerRadius: compact ? 4 : 8, style: .continuous)
                    .fill(keyCapFill)
            }
            .overlay {
                RoundedRectangle(cornerRadius: compact ? 4 : 8, style: .continuous)
                    .strokeBorder(keyCapBorder, lineWidth: 1)
            }
            .shadow(color: keyCapShadow, radius: 0, x: 0, y: compact ? 0 : 1)
    }

    @ViewBuilder
    private var keycapLabel: some View {
        if isShiftSymbol {
            Image("Harvous.CircleUp")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: compact ? 9 : 11, height: compact ? 9 : 11)
                .foregroundStyle(.primary.opacity(compact ? 1 : 0.88))
                .accessibilityLabel("Shift")
        } else {
            Text(symbol)
                .font(
                    HarvousFonts.font(
                        size: compact ? HarvousShortcutKeycapMetrics.hintFontSize : HarvousShortcutKeycapMetrics.settingsFontSize,
                        weight: compact ? .semibold : .medium,
                        design: .rounded
                    )
                )
                .foregroundStyle(.primary.opacity(compact ? 1 : 0.88))
        }
    }

    private var keyCapFill: Color {
        if compact {
            #if os(macOS)
            return Color(nsColor: .windowBackgroundColor)
            #else
            return Color(uiColor: .systemBackground)
            #endif
        }
        #if os(macOS)
        return Color(nsColor: .controlBackgroundColor)
        #else
        return Color(uiColor: .secondarySystemGroupedBackground)
        #endif
    }

    private var isShiftSymbol: Bool {
        symbol == "⇧" || symbol == "\u{21E7}"
    }

    private var resolvedCanvasColor: Color {
        glassTint ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme)
    }

    private var keyCapBorder: Color {
        HarvousAppearanceBorders.keycapBorder(
            canvasColor: resolvedCanvasColor,
            isPhotoWallpaper: appearanceStore.isPhotoSelected(),
            colorScheme: colorScheme,
            compact: compact
        )
    }

    private var keyCapShadow: Color {
        guard !compact else { return .clear }
        return HarvousAppearanceBorders.keycapShadow(
            canvasColor: resolvedCanvasColor,
            isPhotoWallpaper: appearanceStore.isPhotoSelected(),
            colorScheme: colorScheme
        )
    }
}

struct HarvousShortcutKeycapsRow: View {
    let keys: String

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(keys.enumerated()), id: \.offset) { _, ch in
                HarvousShortcutKeycap(symbol: String(ch))
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}

/// Single-letter badge at the bottom center of a toolbar control (Shift implied while visible).
struct HarvousShortcutHintBadge: View {
    let key: String

    private var pageRingColor: Color {
        #if os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color(uiColor: .systemBackground)
        #endif
    }

    var body: some View {
        HarvousShortcutKeycap(symbol: key, compact: true)
            .overlay {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .strokeBorder(pageRingColor, lineWidth: 1.5)
            }
    }
}

private struct HarvousToolbarShortcutHintModifier: ViewModifier {
    @EnvironmentObject private var shiftHints: HarvousShiftHintsMonitor
    let shortcutKey: String?

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if shiftHints.hintsVisible, let shortcutKey, !shortcutKey.isEmpty {
                HarvousShortcutHintBadge(key: shortcutKey)
                    .offset(y: 7)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
    }
}

extension View {
    /// Overlay a letter keycap when Shift-hold hints are active.
    func harvousToolbarShortcutHint(_ key: String?) -> some View {
        modifier(HarvousToolbarShortcutHintModifier(shortcutKey: key))
    }
}

// MARK: - Shift-hold hint monitor + prototype Shift shortcuts

enum HarvousShiftShortcut: Equatable {
    case newNote
    case search
    case settings
    case toggleSidebar
    case focusNoteList
    case findInNote
    case lockNote
    case toggleInspector
    case cycleListMode(step: Int)
}

@MainActor
final class HarvousShiftHintsMonitor: ObservableObject {
    static let holdDurationMs: UInt64 = 400

    @Published private(set) var hintsVisible = false

    /// When true, Shift+letter shortcuts are suppressed (editor body focused).
    var isEditorBodyFocused = false

    /// When true, Shift+letter shortcuts are suppressed (note title field focused).
    var isTitleFieldFocused = false

    /// When false, monitoring is paused (e.g. iPhone).
    var isEnabled = true

    /// When false, note-scoped shortcuts (F/L/D) are unavailable.
    var isNoteRouteActive = false

    var onShortcut: ((HarvousShiftShortcut) -> Void)?

    #if os(macOS)
    private var eventMonitor: Any?
    #endif
    #if os(iOS)
    private var keyMonitorView: ShiftHoldKeyMonitorView?
    #endif
    private var holdTask: Task<Void, Never>?
    private var shiftAloneHeld = false

    func install() {
        guard isEnabled else { return }
        #if os(macOS)
        guard eventMonitor == nil else { return }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown, .keyUp]) { [weak self] event in
            guard let self else { return event }
            return self.handle(event: event)
        }
        #endif
    }

    func uninstall() {
        clearHints()
        #if os(macOS)
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
        #endif
        #if os(iOS)
        keyMonitorView = nil
        #endif
    }

    #if os(iOS)
    func makeKeyMonitorRepresentable() -> some View {
        ShiftHoldKeyMonitorRepresentable(monitor: self)
    }
    #endif

    #if os(macOS)
    private func handle(event: NSEvent) -> NSEvent? {
        switch event.type {
        case .flagsChanged:
            let shiftDown = event.modifierFlags.contains(.shift)
            let otherMods = event.modifierFlags.intersection([.command, .control, .option])
            if shiftDown && otherMods.isEmpty {
                if !shiftAloneHeld {
                    shiftAloneHeld = true
                    scheduleHoldTimer()
                }
            } else {
                shiftAloneHeld = false
                clearHints()
            }
            return event

        case .keyDown:
            if holdTask != nil {
                holdTask?.cancel()
                holdTask = nil
            }
            if hintsVisible, event.keyCode != 56, event.keyCode != 60 {
                clearHints()
            }
            if tryHandleShortcut(event: event) {
                return nil
            }
            return event

        case .keyUp:
            if event.keyCode == 56 || event.keyCode == 60 {
                shiftAloneHeld = false
                clearHints()
            }
            return event

        default:
            return event
        }
    }

    private func tryHandleShortcut(event: NSEvent) -> Bool {
        guard isEnabled else { return false }
        guard event.modifierFlags.contains(.shift) else { return false }
        guard !event.modifierFlags.contains(.command),
              !event.modifierFlags.contains(.control),
              !event.modifierFlags.contains(.option) else { return false }
        guard !isEditorBodyFocused, !isTitleFieldFocused else { return false }

        guard let chars = event.charactersIgnoringModifiers?.lowercased(), let first = chars.first else {
            if event.keyCode == 123 {
                onShortcut?(.cycleListMode(step: -1))
                return true
            }
            if event.keyCode == 124 {
                onShortcut?(.cycleListMode(step: 1))
                return true
            }
            return false
        }

        switch first {
        case "n":
            onShortcut?(.newNote)
            return true
        case "k":
            onShortcut?(.search)
            return true
        case ",":
            onShortcut?(.settings)
            return true
        case "b":
            onShortcut?(.toggleSidebar)
            return true
        case "j":
            onShortcut?(.focusNoteList)
            return true
        default:
            guard isNoteRouteActive else { return false }
            switch first {
            case "f":
                onShortcut?(.findInNote)
                return true
            case "d":
                onShortcut?(.toggleInspector)
                return true
            default:
                return false
            }
        }
    }
    #endif

    fileprivate func handleShiftPressBegan() {
        guard isEnabled else { return }
        shiftAloneHeld = true
        scheduleHoldTimer()
    }

    fileprivate func handleShiftPressEnded() {
        shiftAloneHeld = false
        clearHints()
    }

    fileprivate func handleNonShiftKeyDuringHold() {
        holdTask?.cancel()
        holdTask = nil
        if hintsVisible {
            clearHints()
        }
    }

    private func scheduleHoldTimer() {
        holdTask?.cancel()
        holdTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: Self.holdDurationMs * 1_000_000)
            guard !Task.isCancelled, let self, self.shiftAloneHeld else { return }
            self.hintsVisible = true
        }
    }

    private func clearHints() {
        holdTask?.cancel()
        holdTask = nil
        hintsVisible = false
    }
}

#if os(iOS)
private struct ShiftHoldKeyMonitorRepresentable: UIViewRepresentable {
    let monitor: HarvousShiftHintsMonitor

    func makeUIView(context: Context) -> ShiftHoldKeyMonitorView {
        let view = ShiftHoldKeyMonitorView()
        view.monitor = monitor
        return view
    }

    func updateUIView(_ uiView: ShiftHoldKeyMonitorView, context: Context) {
        uiView.monitor = monitor
    }
}

final class ShiftHoldKeyMonitorView: UIView {
    weak var monitor: HarvousShiftHintsMonitor?

    override var canBecomeFirstResponder: Bool { monitor?.isEnabled == true }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        becomeFirstResponder()
    }

    override var keyCommands: [UIKeyCommand]? {
        guard monitor?.isEnabled == true else { return nil }
        return [
            UIKeyCommand(input: "n", modifierFlags: .shift, action: #selector(shiftN)),
            UIKeyCommand(input: "k", modifierFlags: .shift, action: #selector(shiftK)),
            UIKeyCommand(input: ",", modifierFlags: .shift, action: #selector(shiftComma)),
            UIKeyCommand(input: "b", modifierFlags: .shift, action: #selector(shiftB)),
            UIKeyCommand(input: "j", modifierFlags: .shift, action: #selector(shiftJ)),
            UIKeyCommand(input: "f", modifierFlags: .shift, action: #selector(shiftF)),
            UIKeyCommand(input: "d", modifierFlags: .shift, action: #selector(shiftD)),
            UIKeyCommand(input: UIKeyCommand.inputLeftArrow, modifierFlags: .shift, action: #selector(shiftLeft)),
            UIKeyCommand(input: UIKeyCommand.inputRightArrow, modifierFlags: .shift, action: #selector(shiftRight)),
        ]
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var sawShift = false
        for press in presses {
            if press.key?.keyCode == .keyboardLeftShift || press.key?.keyCode == .keyboardRightShift {
                sawShift = true
            } else {
                monitor?.handleNonShiftKeyDuringHold()
            }
        }
        if sawShift {
            monitor?.handleShiftPressBegan()
        }
        super.pressesBegan(presses, with: event)
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            if press.key?.keyCode == .keyboardLeftShift || press.key?.keyCode == .keyboardRightShift {
                monitor?.handleShiftPressEnded()
            }
        }
        super.pressesEnded(presses, with: event)
    }

    @objc private func shiftN() { fire(.newNote) }
    @objc private func shiftK() { fire(.search) }
    @objc private func shiftComma() { fire(.settings) }
    @objc private func shiftB() { fire(.toggleSidebar) }
    @objc private func shiftJ() { fire(.focusNoteList) }
    @objc private func shiftF() { fire(.findInNote) }
    @objc private func shiftD() { fire(.toggleInspector) }
    @objc private func shiftLeft() { fire(.cycleListMode(step: -1)) }
    @objc private func shiftRight() { fire(.cycleListMode(step: 1)) }

    private func fire(_ shortcut: HarvousShiftShortcut) {
        guard let monitor, monitor.isEnabled, !monitor.isEditorBodyFocused, !monitor.isTitleFieldFocused else { return }
        switch shortcut {
        case .findInNote, .lockNote, .toggleInspector:
            guard monitor.isNoteRouteActive else { return }
        default:
            break
        }
        monitor.onShortcut?(shortcut)
    }
}
#endif
