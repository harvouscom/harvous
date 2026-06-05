#if os(macOS)
import SwiftUI

/// Bridges main-window menu shortcuts to the sidebar note list’s `sortedFiltered` order without duplicating filter/sort in `MacRootView`.
@MainActor
final class MacNoteListSelectionCoordinator: ObservableObject {
    private var advance: ((Int) -> Void)?
    /// `true` jumps to the last row, `false` to the first.
    private var jumpToEnd: ((Bool) -> Void)?

    @Published private(set) var isListNavigationHandlerRegistered = false

    func registerNavigationHandlers(
        advance: @escaping (Int) -> Void,
        jumpToEnd: @escaping (Bool) -> Void
    ) {
        self.advance = advance
        self.jumpToEnd = jumpToEnd
        isListNavigationHandlerRegistered = true
    }

    func unregisterAdvanceHandler() {
        advance = nil
        jumpToEnd = nil
        isListNavigationHandlerRegistered = false
    }

    func nextNote() {
        advance?(1)
    }

    func previousNote() {
        advance?(-1)
    }

    func firstNote() {
        jumpToEnd?(false)
    }

    func lastNote() {
        jumpToEnd?(true)
    }
}

#endif
