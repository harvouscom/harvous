#if os(macOS)
import SwiftUI

/// Bridges main-window menu shortcuts to the sidebar note list’s `sortedFiltered` order without duplicating filter/sort in `MacRootView`.
@MainActor
final class MacNoteListSelectionCoordinator: ObservableObject {
    private var advance: ((Int) -> Void)?

    @Published private(set) var isListNavigationHandlerRegistered = false

    func registerAdvanceHandler(_ handler: @escaping (Int) -> Void) {
        advance = handler
        isListNavigationHandlerRegistered = true
    }

    func unregisterAdvanceHandler() {
        advance = nil
        isListNavigationHandlerRegistered = false
    }

    func nextNote() {
        advance?(1)
    }

    func previousNote() {
        advance?(-1)
    }
}

#endif
