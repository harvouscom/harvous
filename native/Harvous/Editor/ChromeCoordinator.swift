import Combine
import SwiftUI

/// Mirrors the web prototype’s `prototypeNative` editor chrome transitions (`noteActions`, `format`, `scripture`).
@MainActor
final class ChromeCoordinator: ObservableObject {
    enum Mode: Equatable {
        /// Global orb row — list/search/compose shortcuts (matches web `noteActions`).
        case orbRow
        case format
        case scripture
    }

    @Published private(set) var mode: Mode = .orbRow

    private weak var proxy: EditorProxy?
    private var cancellable: AnyCancellable?

    func attach(proxy: EditorProxy) {
        if self.proxy === proxy, cancellable != nil { return }
        self.proxy = proxy
        cancellable?.cancel()
        cancellable = proxy.objectWillChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.recompute()
            }
        recompute()
    }

    func detach() {
        cancellable?.cancel()
        cancellable = nil
        proxy = nil
        mode = .orbRow
    }

    func recompute() {
        guard let proxy else {
            mode = .orbRow
            return
        }
        let next: Mode
        if proxy.activeScripturePill != nil {
            next = .scripture
        } else if proxy.shouldShowNoteToolbar {
            next = .format
        } else {
            next = .orbRow
        }
        if mode != next {
            mode = next
        }
    }
}
