import SwiftUI
import SwiftData
#if os(iOS)
import UIKit
#endif

/// Wrapper for linked-note marker IDs used in navigation / sheet presentation.
struct LinkedNoteDestination: Hashable, Identifiable {
    let id: UUID
}

/// Thin wrapper for iOS push navigation — owns the `@State` binding
/// so NoteEditorView's @Binding var note works correctly.
struct StatefulNoteEditorView: View {
    #if os(iOS)
    @State private var linkedNoteSheet: LinkedNoteDestination?
    @Environment(\.dismiss) private var dismiss
    @State private var iosNavBarBackChevronSubstitution = HarvousIOSNavBarBackChevronSubstitution()
    #endif

    @State private var note: Note?

    init(note: Note) {
        _note = State(initialValue: note)
    }

    var body: some View {
        #if os(iOS)
        NoteEditorView(
            note: $note,
            onNavigateToLinkedNotes: { id in
                linkedNoteSheet = LinkedNoteDestination(id: id)
            },
            onRequestDismissEditor: { dismiss() }
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .background {
            HarvousIOSNavBarBackChevronHost(substitution: iosNavBarBackChevronSubstitution)
        }
        .onDisappear {
            iosNavBarBackChevronSubstitution.restoreIfNeeded()
        }
        .sheet(item: $linkedNoteSheet) { dest in
            NavigationStack {
                LinkedNotesView(linkedNoteMarkerId: dest.id)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { linkedNoteSheet = nil }
                        }
                    }
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        #else
        NoteEditorView(note: $note)
        #endif
    }
}

#if os(iOS)
/// Swaps only the navigation bar **back-indicator** glyph for the Harvous FA chevron while this editor is shown,
/// preserving the system back control chrome and layout beside `NoteTopBar`.
@MainActor
final class HarvousIOSNavBarBackChevronSubstitution {
    private var snapshot: HarvousNavBarAppearanceSnapshot?
    private weak var navigationBarUnderSubstitution: UINavigationBar?

    /// True after `applyIfNeeded` has installed the FA glyph (until `restoreIfNeeded`).
    fileprivate var isBackSubstitutionInstalled: Bool { navigationBarUnderSubstitution != nil }

    func applyIfNeeded(from navigationBar: UINavigationBar) {
        guard navigationBarUnderSubstitution == nil else { return }
        guard let img = HarvousFAGlyph.rasterTemplateUIImage(named: "Harvous.ChevronLeft", edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt)
        else { return }

        let captured = HarvousNavBarAppearanceSnapshot.capture(from: navigationBar)
        navigationBarUnderSubstitution = navigationBar
        snapshot = captured
        captured.patched(with: img).apply(to: navigationBar)
    }

    func restoreIfNeeded() {
        guard let navigationBarUnderSubstitution, let snapshot else { return }
        snapshot.restore(to: navigationBarUnderSubstitution)
        self.navigationBarUnderSubstitution = nil
        self.snapshot = nil
    }
}

@MainActor
private struct HarvousNavBarAppearanceSnapshot {
    let standard: UINavigationBarAppearance
    let compact: UINavigationBarAppearance?
    let scrollEdge: UINavigationBarAppearance?
    let compactScrollEdge: UINavigationBarAppearance?

    static func capture(from bar: UINavigationBar) -> HarvousNavBarAppearanceSnapshot {
        HarvousNavBarAppearanceSnapshot(
            standard: bar.standardAppearance.copy(),
            compact: bar.compactAppearance.map { $0.copy() },
            scrollEdge: bar.scrollEdgeAppearance.map { $0.copy() },
            compactScrollEdge: bar.compactScrollEdgeAppearance.map { $0.copy() }
        )
    }

    func restore(to bar: UINavigationBar) {
        bar.standardAppearance = standard
        bar.compactAppearance = compact
        bar.scrollEdgeAppearance = scrollEdge
        bar.compactScrollEdgeAppearance = compactScrollEdge
    }

    func patched(with image: UIImage) -> HarvousNavBarAppearanceSnapshot {
        func patch(_ a: UINavigationBarAppearance) -> UINavigationBarAppearance {
            let copy = a.copy()
            copy.setBackIndicatorImage(image, transitionMaskImage: image)
            return copy
        }
        return HarvousNavBarAppearanceSnapshot(
            standard: patch(standard),
            compact: compact.map(patch),
            scrollEdge: scrollEdge.map(patch),
            compactScrollEdge: compactScrollEdge.map(patch)
        )
    }

    func apply(to bar: UINavigationBar) {
        bar.standardAppearance = standard
        bar.compactAppearance = compact
        bar.scrollEdgeAppearance = scrollEdge
        bar.compactScrollEdgeAppearance = compactScrollEdge
    }
}

private struct HarvousIOSNavBarBackChevronHost: UIViewControllerRepresentable {
    let substitution: HarvousIOSNavBarBackChevronSubstitution

    func makeUIViewController(context: Context) -> HarvousIOSNavBarBackChevronHostController {
        HarvousIOSNavBarBackChevronHostController(substitution: substitution)
    }

    func updateUIViewController(_ uiViewController: HarvousIOSNavBarBackChevronHostController, context: Context) {
        uiViewController.substitution = substitution
    }
}

private final class HarvousIOSNavBarBackChevronHostController: UIViewController {
    var substitution: HarvousIOSNavBarBackChevronSubstitution

    init(substitution: HarvousIOSNavBarBackChevronSubstitution) {
        self.substitution = substitution
        super.init(nibName: nil, bundle: nil)
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        dispatchApplyIfEmbedded()
    }

    override func didMove(toParent parent: UIViewController?) {
        super.didMove(toParent: parent)
        if parent != nil {
            dispatchApplyIfEmbedded()
        }
    }

    private func dispatchApplyIfEmbedded() {
        guard !substitution.isBackSubstitutionInstalled else { return }
        Task { @MainActor [weak self] in
            guard let self, let nav = self.navigationController else { return }
            self.substitution.applyIfNeeded(from: nav.navigationBar)
        }
    }
}
#endif
