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
    private var addLinkPendingRange: NSRange = .init(location: NSNotFound, length: 0)
    private var addLinkIsInsertion: Bool = false
    private var addLinkInitialSelectedText: String = ""
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

    var shouldShowNoteToolbar: Bool {
        isBodyFirstResponder
            && activeScripturePill == nil
            && formatBarUnlocked
            && (hasSelection || isPointerOverFormatToolbar || showFormatBarForActivity)
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
    private func textViewPair() -> (HVTextView, NSTextStorage)? {
        guard let tv = textView else { return nil }
#if os(macOS)
        guard let storage = tv.textStorage else { return nil }
#else
        let storage = tv.textStorage
#endif
        return (tv, storage)
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
        pillStr.addAttributes([.font: bodyFont], range: NSRange(location: 0, length: pillStr.length))

        storage.beginEditing()
        storage.replaceCharacters(in: range, with: pillStr)
        storage.endEditing()
        hvNotifyBodyChanged(tv)

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

    private func caretRange(for tv: HVTextView) -> NSRange {
#if os(macOS)
        tv.selectedRange()
#else
        tv.selectedRange
#endif
    }

    private func setCaret(for tv: HVTextView, _ range: NSRange) {
#if os(macOS)
        tv.setSelectedRange(range)
#else
        tv.selectedRange = range
#endif
    }

    private func hvNotifyBodyChanged(_ tv: HVTextView) {
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

    /// Re-reads typing attributes / selection so toolbar buttons can show active states.
    func refreshFormatState() {
        let next = computeFormatToolbarState()
        if next != formatToolbar { formatToolbar = next }
    }

    // MARK: - Inline formatting

    func bold() {
        toggleTrait(rawValue: 2)   // NSBoldFontMask
        refocusTextView()
        refreshFormatState()
    }

    func italic() {
        toggleTrait(rawValue: 1)   // NSItalicFontMask
        refocusTextView()
        refreshFormatState()
    }

    func strikethrough() {
        guard let (tv, storage) = textViewPair() else { return }
        let range = caretRange(for: tv)
        if range.length == 0 {
            var attrs = tv.typingAttributes
            let current = (attrs[.strikethroughStyle] as? Int) ?? 0
            let next = current == 0 ? NSUnderlineStyle.single.rawValue : 0
            if next == 0 { attrs.removeValue(forKey: .strikethroughStyle) }
            else { attrs[.strikethroughStyle] = next }
            tv.typingAttributes = attrs
            refocusTextView()
            refreshFormatState()
            return
        }
        storage.beginEditing()
        let current = storage.attribute(.strikethroughStyle, at: range.location, effectiveRange: nil) as? Int ?? 0
        let next = current == 0 ? NSUnderlineStyle.single.rawValue : 0
        if next == 0 { storage.removeAttribute(.strikethroughStyle, range: range) }
        else         { storage.addAttribute(.strikethroughStyle, value: next, range: range) }
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    // MARK: - Headings

    private func headingLevelActive(for tv: HVTextView, storage: NSTextStorage) -> Int? {
        let range = caretRange(for: tv)
#if os(macOS)
        return headingLevelActiveMac(range: range, tv: tv, storage: storage)
#else
        return headingLevelActiveIOS(range: range, tv: tv, storage: storage)
#endif
    }

    func heading(_ level: Int) {
        guard let (tv, storage) = textViewPair() else { return }
        let lv = max(2, min(level, 4))
        // Tap active heading again => return to default body style.
        if headingLevelActive(for: tv, storage: storage) == lv {
            bodyText()
            return
        }
        let font = HarvousFonts.headingFont(level: lv)
        let paraRange = (storage.string as NSString).paragraphRange(for: caretRange(for: tv))
        storage.beginEditing()
        if paraRange.length > 0 {
            storage.addAttribute(.font, value: font, range: paraRange)
        }
        storage.endEditing()
        var typing = tv.typingAttributes
        typing[.font] = font
        tv.typingAttributes = typing
        refocusTextView()
        refreshFormatState()
    }

    func bodyText() {
        guard let (tv, storage) = textViewPair() else { return }
        let bodyFont = HarvousFonts.system(size: 16, weight: 400)
        let paraRange = (storage.string as NSString).paragraphRange(for: caretRange(for: tv))
        storage.beginEditing()
        if paraRange.length > 0 {
            storage.addAttribute(.font, value: bodyFont, range: paraRange)
        }
        storage.endEditing()
        var typing = tv.typingAttributes
        typing[.font] = bodyFont
        tv.typingAttributes = typing
        refocusTextView()
        refreshFormatState()
    }

    // MARK: - Block inserts

    func insertBullet() { toggleBulletList() }

    func insertNumbered() { toggleNumberedList() }

    /// Persists canonical body min/max line height while adjusting indents—avoids overwriting implicit line metrics with zeros.
    private func mergedBodyParagraphStyleForIndentChange(existingAttr: Any?, firstLineDelta: CGFloat, headDelta: CGFloat) -> NSParagraphStyle {
        let m = noteBodyParagraphStyleForInserts().mutableCopy() as! NSMutableParagraphStyle
        guard let existing = existingAttr as? NSParagraphStyle else {
            m.firstLineHeadIndent = max(0, firstLineDelta)
            m.headIndent = max(0, headDelta)
            return m
        }
        m.firstLineHeadIndent = max(0, existing.firstLineHeadIndent + firstLineDelta)
        m.headIndent = max(0, existing.headIndent + headDelta)
        m.alignment = existing.alignment
        if existing.lineSpacing != 0 { m.lineSpacing = existing.lineSpacing }
        m.baseWritingDirection = existing.baseWritingDirection
        if existing.tailIndent != 0 { m.tailIndent = existing.tailIndent }
        return m
    }

    func indent() {
        guard let (tv, storage) = textViewPair() else { return }
        let paraRange = (storage.string as NSString).paragraphRange(for: caretRange(for: tv))
        let existing = storage.attribute(.paragraphStyle, at: paraRange.location, effectiveRange: nil)
        let next = mergedBodyParagraphStyleForIndentChange(existingAttr: existing, firstLineDelta: 20, headDelta: 20)
        storage.beginEditing()
        storage.addAttribute(.paragraphStyle, value: next, range: paraRange)
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    /// Decreases paragraph indent (paired with `indent`); does not remove list prefixes.
    func outdent() {
        guard let (tv, storage) = textViewPair() else { return }
        let paraRange = (storage.string as NSString).paragraphRange(for: caretRange(for: tv))
        let existing = storage.attribute(.paragraphStyle, at: paraRange.location, effectiveRange: nil)
        let next = mergedBodyParagraphStyleForIndentChange(existingAttr: existing, firstLineDelta: -20, headDelta: -20)
        storage.beginEditing()
        storage.addAttribute(.paragraphStyle, value: next, range: paraRange)
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    func undoEdit() {
        guard let tv = textView, let undo = tv.undoManager, undo.canUndo else { return }
        undo.undo()
        refocusTextView()
        refreshFormatState()
    }

    func redoEdit() {
        guard let tv = textView, let undo = tv.undoManager, undo.canRedo else { return }
        undo.redo()
        refocusTextView()
        refreshFormatState()
    }

    func insertCode() {
        guard let (tv, storage) = textViewPair() else { return }
        let range = caretRange(for: tv)
#if os(macOS)
        let mono = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        let bg = NSColor.quaternaryLabelColor.withAlphaComponent(0.25)
#else
        let mono = UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        let bg = UIColor.quaternaryLabel.withAlphaComponent(0.25)
#endif
        storage.beginEditing()
        if range.length > 0 {
            storage.addAttribute(.font, value: mono, range: range)
            storage.addAttribute(.backgroundColor, value: bg, range: range)
        } else {
            let snippet = NSAttributedString(string: "code", attributes: [.font: mono, .backgroundColor: bg])
            storage.replaceCharacters(in: range, with: snippet)
            setCaret(for: tv,NSRange(location: range.location, length: 4))
        }
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    /// Inserts an Obsidian-style `[[Note title]]` at the caret (plain body styling).
    func insertNoteWikilink(title rawTitle: String) {
        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        guard let (tv, storage) = textViewPair() else { return }
        let range = caretRange(for: tv)
        let snippet = "[[\(title)]]"
#if os(macOS)
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: NSColor.labelColor
        ]
#else
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: UIColor.label
        ]
#endif
        storage.beginEditing()
        storage.replaceCharacters(in: range, with: NSAttributedString(string: snippet, attributes: body))
        storage.endEditing()
        setCaret(for: tv, NSRange(location: range.location + snippet.count, length: 0))
        hvNotifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    func insertDivider() {
        guard let (tv, storage) = textViewPair() else { return }
        let range = caretRange(for: tv)
        let para = noteBodyParagraphStyleForInserts()
#if os(macOS)
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: para
        ]
#else
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: UIColor.label,
            .paragraphStyle: para
        ]
#endif
        let rule = NSAttributedString(attachment: HorizontalRuleAttachment())
        let full = NSMutableAttributedString(string: "\n", attributes: body)
        full.append(rule)
        full.append(NSAttributedString(string: "\n", attributes: body))
        storage.beginEditing()
        storage.replaceCharacters(in: range, with: full)
        storage.endEditing()
        setCaret(for: tv,NSRange(location: range.location + full.length, length: 0))
        hvNotifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    /// Presents the compact “Add link” sheet (URL + display name). Call `applyAddLinkFromSheet` / `removeLinkFromAddLinkSheet` / `cancelAddLinkSheet` from the sheet.
    func addOrEditLink() {
        guard let (tv, storage) = textViewPair() else { return }
        var range = caretRange(for: tv)
        if storage.length == 0, range.length == 0 { return }
        if range.length == 0, range.location > 0 {
            var w = NSRange()
            if storage.attribute(.link, at: range.location - 1, effectiveRange: &w) != nil { range = w }
        }
        if range.length == 0, range.location < storage.length {
            var w = NSRange()
            if storage.attribute(.link, at: range.location, effectiveRange: &w) != nil { range = w }
        }
        var existingURL = ""
        if range.length > 0, let link = storage.attribute(.link, at: range.location, effectiveRange: nil) {
            if let u = link as? URL { existingURL = u.absoluteString }
            else if let s = link as? String { existingURL = s }
        }
        let ns = storage.string as NSString
        if range.length > 0 {
            addLinkInitialSelectedText = ns.substring(with: range)
            addLinkDisplayName = addLinkInitialSelectedText
        } else {
            addLinkInitialSelectedText = ""
            addLinkDisplayName = "link"
        }
        addLinkTargetURL = existingURL.isEmpty ? "" : existingURL
        if addLinkTargetURL.isEmpty { addLinkTargetURL = "https://" }
        addLinkPendingRange = range
        addLinkIsInsertion = range.length == 0
        Task { @MainActor in
            self.showAddLinkSheet = true
        }
    }

    func cancelAddLinkSheet() {
        addLinkPendingRange = .init(location: NSNotFound, length: 0)
        showAddLinkSheet = false
    }

    /// Applies URL + name from the sheet. Empty URL removes the link; name replaces the selection (or is inserted at the caret).
    func applyAddLinkFromSheet() {
        guard let (tv, storage) = textViewPair() else { cancelAddLinkSheet(); return }
        let range = addLinkPendingRange
        guard range.location != NSNotFound else { cancelAddLinkSheet(); return }
        if addLinkIsInsertion {
            guard range.location >= 0, range.location <= storage.length else { cancelAddLinkSheet(); return }
        } else {
            guard range.length > 0, range.location < storage.length, NSMaxRange(range) <= storage.length else { cancelAddLinkSheet(); return }
        }
        let loc = range.location

        var urlT = (addLinkTargetURL as NSString).trimmingCharacters(in: .whitespacesAndNewlines)
        if urlT == "https://" || urlT == "http://" { urlT = "" }
        let nameRaw = (addLinkDisplayName as NSString).trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedName: String = {
            if !nameRaw.isEmpty { return nameRaw }
            if addLinkIsInsertion { return "link" }
            return addLinkInitialSelectedText
        }()

        let attrIndex = min(loc, max(storage.length - 1, 0))
        storage.beginEditing()
        if addLinkIsInsertion {
            if urlT.isEmpty {
                let attrs = defaultBodyTypingAttributes(in: storage, at: attrIndex)
                storage.insert(NSAttributedString(string: resolvedName, attributes: attrs), at: loc)
            } else {
                var attrs = defaultBodyTypingAttributes(in: storage, at: attrIndex)
                if let u = Self.urlForLink(urlT) { attrs[.link] = u }
                else { attrs[.link] = urlT as NSString }
                storage.insert(NSAttributedString(string: resolvedName, attributes: attrs), at: loc)
            }
            let newLen = (resolvedName as NSString).length
            setCaret(for: tv,NSRange(location: loc + newLen, length: 0))
        } else {
            let r = range
            if urlT.isEmpty {
                if resolvedName == addLinkInitialSelectedText {
                    storage.removeAttribute(.link, range: r)
                } else {
                    var attrs = storage.attributes(at: r.location, effectiveRange: nil)
                    attrs[.link] = nil
                    storage.replaceCharacters(in: r, with: NSAttributedString(string: resolvedName, attributes: attrs))
                }
            } else {
                var base = defaultBodyTypingAttributes(in: storage, at: r.location)
                if let u = Self.urlForLink(urlT) { base[.link] = u } else { base[.link] = urlT as NSString }
                storage.replaceCharacters(in: r, with: NSAttributedString(string: resolvedName, attributes: base))
            }
            let newLen = (resolvedName as NSString).length
            setCaret(for: tv,NSRange(location: r.location, length: newLen))
        }
        storage.endEditing()
        addLinkPendingRange = .init(location: NSNotFound, length: 0)
        showAddLinkSheet = false
        hvNotifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    func removeLinkFromAddLinkSheet() {
        guard let (tv, storage) = textViewPair() else { return }
        let range = addLinkPendingRange
        guard range.location != NSNotFound, !addLinkIsInsertion, range.length > 0, NSMaxRange(range) <= storage.length else { cancelAddLinkSheet(); return }
        storage.beginEditing()
        storage.removeAttribute(.link, range: range)
        storage.endEditing()
        addLinkPendingRange = .init(location: NSNotFound, length: 0)
        showAddLinkSheet = false
        hvNotifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    func insertImage() {
#if os(macOS)
        guard let (tv, storage) = textViewPair() else { return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canCreateDirectories = false
        panel.allowedContentTypes = [.image, .png, .jpeg, .tiff, .gif, .heic, .webP]
        guard panel.runModal() == .OK, let url = panel.url,
              let data = try? Data(contentsOf: url), let image = NSImage(data: data) else { return }
        insertInlineNSImageAttachment(image: image, tv: tv, storage: storage)
#elseif os(iOS)
        guard textView != nil else { return }
        showIOSInlineImageImporter = true
#endif
    }

#if os(iOS)
    /// Called after the user selects a photo in `IOSInlineImagePickSheet`.
    func insertPhotoLibraryImage(_ picked: UIImage) {
        guard let (tv, storage) = textViewPair() else { return }
        showIOSInlineImageImporter = false
        insertInlineUIImageAttachment(image: picked, tv: tv, storage: storage)
    }

    private func insertInlineUIImageAttachment(image picked: UIImage, tv: UITextView, storage: NSTextStorage) {
        let att = NSAttributedString(attachment: NoteInlineImageAttachment(image: picked))
        let range = caretRange(for: tv)
        storage.beginEditing()
        storage.replaceCharacters(in: range, with: att)
        storage.endEditing()
        setCaret(for: tv, NSRange(location: range.location + att.length, length: 0))
        hvNotifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
        syncPlainTextBindingFromTextView?(tv)
    }
#endif

#if os(macOS)
    private func insertInlineNSImageAttachment(image picked: NSImage, tv: NSTextView, storage: NSTextStorage) {
        let att = NSAttributedString(attachment: NoteInlineImageAttachment(image: picked))
        let range = caretRange(for: tv)
        storage.beginEditing()
        storage.replaceCharacters(in: range, with: att)
        storage.endEditing()
        setCaret(for: tv, NSRange(location: range.location + att.length, length: 0))
        hvNotifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
        syncPlainTextBindingFromTextView?(tv)
    }
#endif

    // MARK: - Private helpers

    private static func urlForLink(_ raw: String) -> URL? {
        let t = (raw as NSString).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        if let u = URL(string: t), u.scheme != nil { return u }
        return URL(string: "https://" + t)
    }

    /// Matches `noteBodyParagraphStyle` in `HarvousEditor` so inserted blocks match the body.
    private func noteBodyParagraphStyleForInserts() -> NSParagraphStyle {
        let p = NSMutableParagraphStyle()
        let f = HarvousFonts.system(size: 16, weight: 400)
        let natural = f.ascender - f.descender + f.leading
        let target = max(ceil(natural * 1.2), f.pointSize * 1.2)
        p.minimumLineHeight = target
        p.maximumLineHeight = target
        return p
    }

    private func defaultBodyTypingAttributes(in storage: NSTextStorage, at loc: Int) -> [NSAttributedString.Key: Any] {
        let para = noteBodyParagraphStyleForInserts()
#if os(macOS)
        let labelColorAttr: Any = NSColor.labelColor
#elseif os(iOS)
        let labelColorAttr: Any = UIColor.label
#endif
        if storage.length == 0 {
            return [
                .font: HarvousFonts.system(size: 16, weight: 400),
                .foregroundColor: labelColorAttr,
                .paragraphStyle: para
            ]
        }
        let i = min(max(loc, 0), max(storage.length - 1, 0))
        return storage.attributes(at: i, effectiveRange: nil)
    }

    private func listPrefixAttributes() -> [NSAttributedString.Key: Any] {
#if os(macOS)
        [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: NSColor.labelColor
        ]
#elseif os(iOS)
        [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: UIColor.label
        ]
#endif
    }

    /// Font trait toggling: avoid `enumerateAttribute` (its closure is `@Sendable` and trips Swift 6 actor checks).
    private func toggleTrait(rawValue: UInt) {
        guard let (tv, storage) = textViewPair() else { return }
        defer { syncPlainTextBindingFromTextView?(tv) }
#if os(macOS)
        let range = caretRange(for: tv)
        let mask = NSFontTraitMask(rawValue: rawValue)
        let manager = NSFontManager.shared
        if range.length == 0 {
            let base = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
            let hasTrait = manager.traits(of: base).contains(mask)
            let newFont = hasTrait ? manager.convert(base, toNotHaveTrait: mask) : manager.convert(base, toHaveTrait: mask)
            var attrs = tv.typingAttributes
            attrs[.font] = newFont
            tv.typingAttributes = attrs
            return
        }
        let rangeEnd = NSMaxRange(range)
        storage.beginEditing()
        var idx = range.location
        while idx < rangeEnd {
            var eff = NSRange()
            let value = storage.attribute(.font, at: idx, effectiveRange: &eff)
            let font = (value as? NSFont) ?? HarvousFonts.system(size: 15, weight: 400)
            let sub = NSIntersectionRange(eff, range)
            if sub.length > 0 {
                let hasTrait = manager.traits(of: font).contains(mask)
                let newFont = hasTrait
                    ? manager.convert(font, toNotHaveTrait: mask)
                    : manager.convert(font, toHaveTrait: mask)
                storage.addAttribute(.font, value: newFont, range: sub)
            }
            let next = NSMaxRange(eff)
            if next <= idx { break }
            idx = next
        }
        storage.endEditing()
#elseif os(iOS)
        let symbolic: UIFontDescriptor.SymbolicTraits
        switch rawValue {
        case 2: symbolic = .traitBold
        case 1: symbolic = .traitItalic
        default: return
        }
        let range = caretRange(for: tv)
        if range.length == 0 {
            let base = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.system(size: 16, weight: 400)
            let has = base.fontDescriptor.symbolicTraits.contains(symbolic)
            let updated = iosFontApplyingSymbolicTrait(symbolic, to: base, add: !has)
            var attrs = tv.typingAttributes
            attrs[.font] = updated
            tv.typingAttributes = attrs
        } else {
            storage.beginEditing()
            let rangeEnd = NSMaxRange(range)
            var idx = range.location
            while idx < rangeEnd {
                var eff = NSRange()
                let existing = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? UIFont)
                    ?? HarvousFonts.system(size: 16, weight: 400)
                let sub = NSIntersectionRange(eff, range)
                if sub.length > 0 {
                    let hasTrait = existing.fontDescriptor.symbolicTraits.contains(symbolic)
                    storage.addAttribute(.font, value: iosFontApplyingSymbolicTrait(symbolic, to: existing, add: !hasTrait), range: sub)
                }
                let next = NSMaxRange(eff)
                if next <= idx { break }
                idx = next
            }
            storage.endEditing()
        }
#endif
    }

#if os(iOS)
    private func iosFontApplyingSymbolicTrait(_ trait: UIFontDescriptor.SymbolicTraits, to font: UIFont, add: Bool) -> UIFont {
        var traits = font.fontDescriptor.symbolicTraits
        if add { traits.insert(trait) } else { traits.remove(trait) }
        guard let desc = font.fontDescriptor.withSymbolicTraits(traits) else { return font }
        return UIFont(descriptor: desc, size: font.pointSize)
    }
#endif

    /// Paragraph ranges from the paragraph containing the caret through every paragraph intersecting the selection.
    private func paragraphRangesCovering(selection: NSRange, ns: NSString) -> [NSRange] {
        guard ns.length > 0 else { return [] }
        if selection.length == 0 {
            return [ns.paragraphRange(for: selection)]
        }
        let startIdx = min(selection.location, ns.length - 1)
        let endIdx = max(selection.location, NSMaxRange(selection) - 1)
        let startPara = ns.paragraphRange(for: NSRange(location: startIdx, length: 0))
        let endPara = ns.paragraphRange(for: NSRange(location: min(endIdx, ns.length - 1), length: 0))
        let stop = NSMaxRange(endPara)
        var result: [NSRange] = []
        var loc = startPara.location
        while loc < stop {
            let pr = ns.paragraphRange(for: NSRange(location: loc, length: 0))
            result.append(pr)
            let next = NSMaxRange(pr)
            if next <= loc { break }
            loc = next
        }
        return result
    }

    private func bulletPrefixLength(ns: NSString, para: NSRange) -> Int? {
        guard para.length >= 2 else { return nil }
        let bulletScalar: unichar = 0x2022
        if ns.character(at: para.location) == bulletScalar, ns.character(at: para.location + 1) == 32 {
            return 2
        }
        return nil
    }

    private func numberedPrefixLength(ns: NSString, para: NSRange) -> Int? {
        guard para.length >= 3 else { return nil }
        var i = para.location
        let end = NSMaxRange(para)
        let digitStart = i
        while i < end {
            let c = ns.character(at: i)
            if c >= 48 && c <= 57 {
                i += 1
                if i - digitStart > 4 { return nil }
                continue
            }
            break
        }
        guard i > digitStart else { return nil }
        guard i < end, ns.character(at: i) == 46 else { return nil }
        i += 1
        guard i < end, ns.character(at: i) == 32 else { return nil }
        return i - para.location + 1
    }

    private func toggleBulletList() {
        guard let (tv, storage) = textViewPair() else { return }
        let ns = storage.string as NSString
        let paras = paragraphRangesCovering(selection: caretRange(for: tv), ns: ns)
        guard !paras.isEmpty else { return }

        let allBulleted = paras.allSatisfy { bulletPrefixLength(ns: ns, para: $0) != nil }
        let sorted = paras.sorted { $0.location > $1.location }

        storage.beginEditing()
        for pr in sorted {
            let live = storage.string as NSString
            let bLen = bulletPrefixLength(ns: live, para: pr)
            let nLen = numberedPrefixLength(ns: live, para: pr)
            if allBulleted {
                if let len = bLen {
                    storage.deleteCharacters(in: NSRange(location: pr.location, length: len))
                }
            } else {
                if bLen != nil { continue }
                let stripLen = nLen ?? 0
                let insert = NSAttributedString(string: "• ", attributes: listPrefixAttributes())
                storage.replaceCharacters(in: NSRange(location: pr.location, length: stripLen), with: insert)
            }
        }
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    private func toggleNumberedList() {
        guard let (tv, storage) = textViewPair() else { return }
        let ns = storage.string as NSString
        let paras = paragraphRangesCovering(selection: caretRange(for: tv), ns: ns)
        guard !paras.isEmpty else { return }

        let allNumbered = paras.allSatisfy { numberedPrefixLength(ns: ns, para: $0) != nil }
        let sorted = paras.sorted { $0.location > $1.location }

        storage.beginEditing()
        if allNumbered {
            for pr in sorted {
                let live = storage.string as NSString
                if let len = numberedPrefixLength(ns: live, para: pr) {
                    storage.deleteCharacters(in: NSRange(location: pr.location, length: len))
                }
            }
        } else {
            let forward = paras.sorted { $0.location < $1.location }
            let numberedFromBottom = forward.enumerated().map { ($0.offset + 1, $0.element) }.reversed()
            for (num, pr) in numberedFromBottom {
                let live = storage.string as NSString
                let bLen = bulletPrefixLength(ns: live, para: pr)
                let nLen = numberedPrefixLength(ns: live, para: pr)
                let stripLen = max(bLen ?? 0, nLen ?? 0)
                let prefix = "\(num). "
                let insert = NSAttributedString(string: prefix, attributes: listPrefixAttributes())
                storage.replaceCharacters(in: NSRange(location: pr.location, length: stripLen), with: insert)
            }
        }
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    // MARK: - Toolbar state (active formatting)

    private func computeFormatToolbarState() -> FormatToolbarState {
        guard let (tv, storage) = textViewPair() else { return FormatToolbarState() }
        let range = caretRange(for: tv)
#if os(macOS)
        let mgr = NSFontManager.shared
        let bold = traitActiveMac(mask: .boldFontMask, range: range, tv: tv, storage: storage, mgr: mgr)
        let italic = traitActiveMac(mask: .italicFontMask, range: range, tv: tv, storage: storage, mgr: mgr)
        let headingLevel = headingLevelActiveMac(range: range, tv: tv, storage: storage)
#elseif os(iOS)
        let bold = iosBoldToolbarActive(range: range, tv: tv, storage: storage)
        let italic = iosItalicToolbarActive(range: range, tv: tv, storage: storage)
        let headingLevel = headingLevelActiveIOS(range: range, tv: tv, storage: storage)
#endif
        let strike = strikethroughActiveHV(range: range, tv: tv, storage: storage)
        let lists = listToolbarFlags(selection: range, storage: storage)
        let indent = indentActiveHV(tv: tv, storage: storage)
        let undo = tv.undoManager
        return FormatToolbarState(
            isBold: bold,
            isItalic: italic,
            isStrikethrough: strike,
            headingLevel: headingLevel,
            isIndented: indent,
            isBulletList: lists.bullet,
            isNumberedList: lists.numbered,
            canUndo: undo?.canUndo ?? false,
            canRedo: undo?.canRedo ?? false
        )
    }

    /// Highlight list buttons the same way toggling applies: all covered paragraphs share that list kind.
    private func listToolbarFlags(selection: NSRange, storage: NSTextStorage) -> (bullet: Bool, numbered: Bool) {
        let ns = storage.string as NSString
        guard ns.length > 0 else { return (false, false) }
        let paras = paragraphRangesCovering(selection: selection, ns: ns)
        guard !paras.isEmpty else { return (false, false) }
        let live = storage.string as NSString
        let allBullet = paras.allSatisfy { bulletPrefixLength(ns: live, para: $0) != nil }
        let allNumbered = paras.allSatisfy { numberedPrefixLength(ns: live, para: $0) != nil }
        return (allBullet, allNumbered)
    }

#if os(macOS)
    private func traitActiveMac(
        mask: NSFontTraitMask,
        range: NSRange,
        tv: NSTextView,
        storage: NSTextStorage,
        mgr: NSFontManager
    ) -> Bool {
        if mask == .boldFontMask {
            if range.length == 0 {
                let font = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
                if HarvousFonts.bodyHeadingLevel(matching: font) != nil { return false }
                return mgr.traits(of: font).contains(mask)
            }
            let end = NSMaxRange(range)
            var idx = range.location
            var foundNonHeading = false
            while idx < end {
                var eff = NSRange()
                let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
                let sub = NSIntersectionRange(eff, range)
                if sub.length > 0 {
                    if HarvousFonts.bodyHeadingLevel(matching: font) != nil {
                        let next = NSMaxRange(eff)
                        if next <= idx { return false }
                        idx = next
                        continue
                    }
                    foundNonHeading = true
                    if !mgr.traits(of: font).contains(mask) { return false }
                }
                let next = NSMaxRange(eff)
                if next <= idx { return false }
                idx = next
            }
            return foundNonHeading
        }

        if range.length == 0 {
            let font = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
            return mgr.traits(of: font).contains(mask)
        }
        let end = NSMaxRange(range)
        var idx = range.location
        while idx < end {
            var eff = NSRange()
            let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
            let sub = NSIntersectionRange(eff, range)
            if sub.length > 0, !mgr.traits(of: font).contains(mask) { return false }
            let next = NSMaxRange(eff)
            if next <= idx { return false }
            idx = next
        }
        return true
    }

    private func headingLevelActiveMac(range: NSRange, tv: NSTextView, storage: NSTextStorage) -> Int? {
        let ns = storage.string as NSString
        guard storage.length > 0 else { return nil }
        let paras = paragraphRangesCovering(selection: range, ns: ns)
        let live = storage.string as NSString
        for pr in paras {
            if bulletPrefixLength(ns: live, para: pr) != nil || numberedPrefixLength(ns: live, para: pr) != nil {
                return nil
            }
        }
        if range.length == 0 {
            let font = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
            return HarvousFonts.bodyHeadingLevel(matching: font)
        }
        let loc = min(max(range.location, 0), storage.length - 1)
        let font = (storage.attribute(.font, at: loc, effectiveRange: nil) as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
        return HarvousFonts.bodyHeadingLevel(matching: font)
    }
#elseif os(iOS)
    private func iosBoldToolbarActive(range: NSRange, tv: UITextView, storage: NSTextStorage) -> Bool {
        if range.length == 0 {
            let font = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.system(size: 16, weight: 400)
            if HarvousFonts.bodyHeadingLevel(matching: font) != nil { return false }
            return font.fontDescriptor.symbolicTraits.contains(.traitBold)
        }
        let end = NSMaxRange(range)
        var idx = range.location
        var foundNonHeading = false
        while idx < end {
            var eff = NSRange()
            let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? UIFont) ?? HarvousFonts.system(size: 16, weight: 400)
            let sub = NSIntersectionRange(eff, range)
            if sub.length > 0 {
                if HarvousFonts.bodyHeadingLevel(matching: font) != nil {
                    let next = NSMaxRange(eff)
                    if next <= idx { return false }
                    idx = next
                    continue
                }
                foundNonHeading = true
                if !font.fontDescriptor.symbolicTraits.contains(.traitBold) { return false }
            }
            let next = NSMaxRange(eff)
            if next <= idx { return false }
            idx = next
        }
        return foundNonHeading
    }

    private func iosItalicToolbarActive(range: NSRange, tv: UITextView, storage: NSTextStorage) -> Bool {
        if range.length == 0 {
            let font = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.system(size: 16, weight: 400)
            return font.fontDescriptor.symbolicTraits.contains(.traitItalic)
        }
        let end = NSMaxRange(range)
        var idx = range.location
        while idx < end {
            var eff = NSRange()
            let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? UIFont) ?? HarvousFonts.system(size: 16, weight: 400)
            let sub = NSIntersectionRange(eff, range)
            if sub.length > 0, !font.fontDescriptor.symbolicTraits.contains(.traitItalic) { return false }
            let next = NSMaxRange(eff)
            if next <= idx { return false }
            idx = next
        }
        return true
    }

    private func headingLevelActiveIOS(range: NSRange, tv: UITextView, storage: NSTextStorage) -> Int? {
        guard storage.length > 0 else { return nil }
        let paras = paragraphRangesCovering(selection: range, ns: storage.string as NSString)
        let live = storage.string as NSString
        for pr in paras {
            if bulletPrefixLength(ns: live, para: pr) != nil || numberedPrefixLength(ns: live, para: pr) != nil {
                return nil
            }
        }
        if range.length == 0 {
            let font = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.system(size: 16, weight: 400)
            return HarvousFonts.bodyHeadingLevel(matching: font)
        }
        let loc = min(max(range.location, 0), storage.length - 1)
        let font = (storage.attribute(.font, at: loc, effectiveRange: nil) as? UIFont) ?? HarvousFonts.system(size: 16, weight: 400)
        return HarvousFonts.bodyHeadingLevel(matching: font)
    }
#endif

    private func strikethroughActiveHV(range: NSRange, tv: HVTextView, storage: NSTextStorage) -> Bool {
        if range.length == 0 {
            let v = (tv.typingAttributes[.strikethroughStyle] as? Int) ?? 0
            return v != 0
        }
        let end = NSMaxRange(range)
        var idx = range.location
        while idx < end {
            var eff = NSRange()
            let v = storage.attribute(.strikethroughStyle, at: idx, effectiveRange: &eff) as? Int ?? 0
            let sub = NSIntersectionRange(eff, range)
            if sub.length > 0, v == 0 { return false }
            let next = NSMaxRange(eff)
            if next <= idx { return false }
            idx = next
        }
        return true
    }

    private func indentActiveHV(tv: HVTextView, storage: NSTextStorage) -> Bool {
        let sel = caretRange(for: tv)
        let para = (storage.string as NSString).paragraphRange(for: sel)
        guard para.length > 0 else { return false }
        let style = storage.attribute(.paragraphStyle, at: para.location, effectiveRange: nil) as? NSParagraphStyle
        return (style?.firstLineHeadIndent ?? 0) > 0.5 || (style?.headIndent ?? 0) > 0.5
    }

}

