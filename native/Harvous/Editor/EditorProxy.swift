import Combine
import Foundation
import SwiftUI

#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#elseif os(iOS)
import UIKit
#endif

#if os(macOS)
typealias HVTextView = NSTextView
#else
typealias HVTextView = UITextView
#endif

/// Attributes at the caret / in the selection, for toolbar toggle highlighting.
struct FormatToolbarState: Equatable {
    var isBold = false
    var isItalic = false
    var isStrikethrough = false
    /// Matched when the dominant font matches `HarvousFonts.headingFont` levels 2…4 (body only; title is separate).
    /// Suppressed when the selection includes a list paragraph so list toggles do not read as H4 (list markers were 15pt).
    var headingLevel: Int?
    var isIndented = false
    /// All covered paragraphs use the same list prefix (matches toggle logic).
    var isBulletList = false
    var isNumberedList = false
    var canUndo = false
    var canRedo = false
}

/// Observable proxy bridging SwiftUI toolbar buttons to the live NSTextView.
@MainActor
final class EditorProxy: ObservableObject {
    weak var textView: HVTextView?

    #if os(iOS)
    @Published var showIOSInlineImageImporter = false
    #endif

    @Published var hasSelection: Bool = false
    @Published var selectionContentPoint: CGPoint? = nil
    /// Selection anchor in NSScrollView / document-visible space (viewport-relative top-left origin) for inline UI (e.g. thread chip).
    @Published var selectionViewPoint: CGPoint? = nil
    /// First-line selection bounds in viewport space (aligned with `selectionViewPoint` coordinate system).
    @Published var selectionViewportRect: CGRect? = nil
    /// Caret-end (active end of selection) bounds in viewport space — thin vertical rect at the cursor.
    @Published var selectionCaretViewportRect: CGRect? = nil

    /// The rich-text `NSTextView` is key (excludes the title `TextField`, which has no formatting).
    @Published var isBodyFirstResponder: Bool = false

    /// Shown for recent typing, cursor in rich text, or when the pointer is over the bar (not selection).
    @Published var showFormatBarForActivity: Bool = false
    /// After closing the inline scripture dock, suppresses bottom format chrome until the user edits body text or selects a range (caret-only updates still flip `showFormatBarForActivity`).
    @Published var preferOrbChromeUntilNextFormatSignal: Bool = false
    @Published var isPointerOverFormatToolbar: Bool = false
    /// After loading/switching a note, stay false until the user types in the body or the body actually begins editing.
    /// Prevents the toolbar from appearing on layout-only `NSTextView` / selection updates.
    @Published var formatBarUnlocked: Bool = true

    /// Live traits for format toolbar button backgrounds (bold when selection is bold, etc.).
    @Published var formatToolbar: FormatToolbarState = .init()

    // MARK: - Add link sheet (SwiftUI)

    @Published var showAddLinkSheet: Bool = false
    @Published var addLinkTargetURL: String = ""
    @Published var addLinkDisplayName: String = ""
    var addLinkPendingRange: NSRange = .init(location: NSNotFound, length: 0)
    var addLinkIsInsertion: Bool = false
    var addLinkInitialSelectedText: String = ""
    /// Exposed for the add-link sheet (hide “Remove” when inserting at a caret).
    var addLinkIsInsertionPoint: Bool { addLinkIsInsertion }
    /// True if a link edit was started but not yet applied or fully cancelled (used to fix Esc / swipe dismiss).
    var hasActiveAddLinkSession: Bool { addLinkPendingRange.location != NSNotFound }

    // MARK: - Scripture pill focus (action bar)

    @Published var activeScripturePill: ActiveScripturePill? = nil

    /// Hover preview anchor for anchored study highlights (`harvousStudyHighlightUUID` spans).
    @Published var hoveredStudyHighlightUUID: UUID?
    private var studyHighlightHoverTask: Task<Void, Never>?

    /// HarvousEditor assigns this so `replaceActiveScripturePill` can refresh `EditorState` before the next platform update syncs stale `plainText` from SwiftUI and wipes the pill.
    var syncPlainTextBindingFromTextView: ((HVTextView) -> Void)?

    /// Floating selection pill + SwiftUI invokes these; coordinators forward to contextual-menu handlers.
    var triggerHighlightCapturePrompt: (() -> Void)?
    var triggerStandaloneNoteFromSelection: (() -> Void)?

    #if os(macOS)
    /// Invoked after keyboard cycling selects a pill (mirrors tap → opens dock).
    var onScripturePillKeyboardFocus: ((String, String, NSRange) -> Void)?

    /// Drives SwiftUI `.frame(height:)` for the macOS `HarvousEditor` bridge. Using explicit height avoids
    /// `NSScrollView.intrinsicContentSize` + `ensureLayout` during parent layout (nested `ScrollView` recursion).
    @Published var macBodyLayoutHeight: CGFloat = 400

    private var noteHeightCache: [UUID: CGFloat] = [:]
    private var currentNoteID: UUID?

    func resetMacBodyLayoutHeightForNoteTransition(noteID: UUID? = nil) {
        currentNoteID = noteID
        if let noteID, let cached = noteHeightCache[noteID] {
            macBodyLayoutHeight = cached
        } else {
            macBodyLayoutHeight = 400
        }
    }

    func updateMacBodyLayoutHeightIfNeeded(_ measured: CGFloat) {
        let clamped = max(400, measured)
        if let id = currentNoteID {
            noteHeightCache[id] = clamped
        }
        guard abs(macBodyLayoutHeight - clamped) > 0.5 else { return }
        macBodyLayoutHeight = clamped
    }
    #endif

    var shouldShowNoteToolbar: Bool {
        let base =
            isBodyFirstResponder
            && activeScripturePill == nil
            && formatBarUnlocked
            && (hasSelection || isPointerOverFormatToolbar || showFormatBarForActivity)
        if preferOrbChromeUntilNextFormatSignal { return false }
        return base
    }

    /// Clears bar-driving state when switching to another note (the same `NSTextView` can keep first responder).
    func resetFormatBarStateForNewNote() {
        hasSelection = false
        showFormatBarForActivity = false
        formatBarUnlocked = false
        selectionContentPoint = nil
        selectionViewPoint = nil
        selectionViewportRect = nil
        selectionCaretViewportRect = nil
        isPointerOverFormatToolbar = false
        showAddLinkSheet = false
        activeScripturePill = nil
        preferOrbChromeUntilNextFormatSignal = false
        hoveredStudyHighlightUUID = nil
        studyHighlightHoverTask?.cancel()
        studyHighlightHoverTask = nil
        triggerHighlightCapturePrompt = nil
        triggerStandaloneNoteFromSelection = nil
        cancelFormatBarHideAction?()
    }

    func setStudyHighlightHoverDebounced(_ uuid: UUID?) {
        studyHighlightHoverTask?.cancel()
        let captured = uuid
        studyHighlightHoverTask = Task { @MainActor in
            let ms: UInt64 = captured == nil ? 50 : 220
            try? await Task.sleep(for: .milliseconds(ms))
            guard !Task.isCancelled else { return }
            hoveredStudyHighlightUUID = captured
        }
    }

    /// `NSTextView.textStorage` is optional on macOS; `UITextView` always exposes storage.
    func textViewPair() -> (HVTextView, NSTextStorage)? {
        guard let tv = textView else { return nil }
#if os(macOS)
        guard let storage = tv.textStorage else { return nil }
#else
        let storage = tv.textStorage
#endif
        return (tv, storage)
    }

    /// The current body selection (or caret) as a UTF-16 NSRange in the text storage.
    var bodySelectedUTF16Range: NSRange {
        guard let tv = textView else { return NSRange(location: NSNotFound, length: 0) }
        return caretRange(for: tv)
    }

    /// Returns true if the current body selection overlaps any storage span of the given expanded-range highlight.
    /// Used to auto-unpin the highlight dock when the cursor moves outside a pinned highlight.
    func bodySelectionIsContainedInStudyHighlightStorageSpans(expandedPlainHighlightRange: NSRange) -> Bool {
        guard let (tv, storage) = textViewPair() else { return false }
        let sel = caretRange(for: tv)
        let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: expandedPlainHighlightRange, in: storage)
        return storRanges.contains {
            sel.length > 0
                ? NSIntersectionRange(sel, $0).length > 0
                : NSLocationInRange(sel.location, $0)
        }
    }

    /// Scrolls the first UTF-16 span of this **expanded-plain** anchor into the visible text viewport.
    func scrollExpandedStudyHighlightIntoView(expandedUTF16Range: NSRange, expandedPlain: String) {
        guard let (tv, storage) = textViewPair() else { return }
        let nsPlain = expandedPlain as NSString
        guard expandedUTF16Range.location >= 0,
              NSMaxRange(expandedUTF16Range) <= nsPlain.length
        else { return }
        let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: expandedUTF16Range, in: storage)
        guard let first = storRanges.first, first.location != NSNotFound, NSMaxRange(first) <= storage.length else { return }
        tv.scrollRangeToVisible(first)
    }

    func clearActiveScripturePill() {
        activeScripturePill = nil
    }

    /// Replaces the focused inline pill with a new reference + translation and keeps it selected.
    ///
    /// Accent is preserved across the replacement: if the original pill had a per-reference accent set
    /// we carry it over to the new reference so changing translation doesn't silently reset color.
    func replaceActiveScripturePill(reference: String, translation: String, theme: HarvousColors.ThemeVariant = .blue) {
        guard let (tv, storage) = textViewPair(), let active = activeScripturePill else { return }
        let range = active.attachmentRange
        guard range.location != NSNotFound, NSMaxRange(range) <= storage.length else { return }

        var carriedAccent: StudyHighlightAccentToken? = nil
        if let existing = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment {
            carriedAccent = existing.accent
        }
        let pill = ScripturePillAttachment(reference: reference, translation: translation, theme: theme, accent: carriedAccent)
        let pillStr = NSMutableAttributedString(attachment: pill)
        let bodyFont = HarvousFonts.system(size: 16, weight: 400)
        var pillAttrs: [NSAttributedString.Key: Any] = [.font: bodyFont]
        if range.location < storage.length,
           let ps = storage.attribute(.paragraphStyle, at: range.location, effectiveRange: nil) as? NSParagraphStyle {
            pillAttrs[.paragraphStyle] = ps
        }
        pillStr.addAttributes(pillAttrs, range: NSRange(location: 0, length: pillStr.length))

        storage.beginEditing()
        storage.replaceCharacters(in: range, with: pillStr)
        storage.endEditing()
        hvNotifyBodyChanged(tv)
        // Immediately push the new plain text so updateNSView doesn't see stale state and reset the storage.
        syncPlainTextBindingFromTextView?(tv)

        let newRange = NSRange(location: range.location, length: pillStr.length)
        activeScripturePill = ActiveScripturePill(attachmentRange: newRange, reference: reference, translation: translation)
        setCaret(for: tv, newRange)
        refreshFormatState()
    }

    /// Aligns with `window?.firstResponder` / `UITextView.isFirstResponder` so stale key state can’t make the title field look like the body is key.
    func syncBodyFirstResponderState(textView: HVTextView) {
#if os(macOS)
        isBodyFirstResponder = (textView.window?.firstResponder as AnyObject?) === (textView as AnyObject)
#else
        isBodyFirstResponder = textView.isFirstResponder
#endif
    }

    var cancelFormatBarHideAction: (() -> Void)?
    var scheduleFormatBarHideAction: (() -> Void)?

    func caretRange(for tv: HVTextView) -> NSRange {
#if os(macOS)
        tv.selectedRange()
#else
        tv.selectedRange
#endif
    }

    func setCaret(for tv: HVTextView, _ range: NSRange) {
#if os(macOS)
        tv.setSelectedRange(range)
#else
        tv.selectedRange = range
#endif
    }

    func hvNotifyBodyChanged(_ tv: HVTextView) {
#if os(macOS)
        tv.didChangeText()
#else
        NotificationCenter.default.post(name: UITextView.textDidChangeNotification, object: tv)
#endif
    }

    /// Pointer entered/left the format toolbar — cancels or restarts the idle hide timer.
    /// Defer: `onHover` can fire while SwiftUI is mid–view update; mutating here causes “Modifying state during view update”.
    func setFormatToolbarHover(_ isHovering: Bool) {
        Task { @MainActor in
            self.isPointerOverFormatToolbar = isHovering
            if isHovering {
                self.cancelFormatBarHideAction?()
            } else {
                self.scheduleFormatBarHideAction?()
            }
        }
    }

    func refocusTextView() {
        guard let tv = textView else { return }
#if os(macOS)
        guard let win = tv.window else { return }
        win.makeFirstResponder(tv)
#else
        tv.becomeFirstResponder()
#endif
    }

}
