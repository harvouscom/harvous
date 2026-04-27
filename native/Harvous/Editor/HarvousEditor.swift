import SwiftUI

// MARK: - Shared binding type

struct EditorState {
    var plainText: String = ""
    var detectedRefs: [String] = []
}

/// `NSTextStorage.string` uses the object replacement character (U+FFFC) for each `NSTextAttachment`, so
/// blind `string` reads omit visible scripture. Walk storage and inline each `ScripturePillAttachment`’s
/// text so `note.body` and list excerpts match the pill.
fileprivate func plainBodyStringByExpandingPillAttachments(in storage: NSTextStorage) -> String {
    let len = storage.length
    if len == 0 { return "" }
    if !storage.string.contains("\u{FFFC}") { return storage.string }
    let ns = storage.string as NSString
    var i = 0
    var out = ""
    out.reserveCapacity(len)
    while i < len {
        var eff = NSRange()
        if let att = storage.attribute(.attachment, at: i, effectiveRange: &eff) {
            if let pill = att as? ScripturePillAttachment {
                var piece = pill.reference
                if !pill.translation.isEmpty { piece += " " + pill.translation }
                out += piece
                i = NSMaxRange(eff)
            } else {
#if os(macOS)
                if att is HorizontalRuleAttachment {
                    out += "\n---\n"
                    i = NSMaxRange(eff)
                } else if let imgAtt = att as? NoteInlineImageAttachment {
                    if let png = pngDataForInlineImageAttachment(imgAtt) {
                        out += "\n[Image:\(png.base64EncodedString())]\n"
                    } else {
                        out += "\n[Image]\n"
                    }
                    i = NSMaxRange(eff)
                } else {
                    let r = ns.rangeOfComposedCharacterSequence(at: i)
                    out += ns.substring(with: r)
                    i = NSMaxRange(r)
                }
#else
                let r = ns.rangeOfComposedCharacterSequence(at: i)
                out += ns.substring(with: r)
                i = NSMaxRange(r)
#endif
            }
        } else {
            let r = ns.rangeOfComposedCharacterSequence(at: i)
            out += ns.substring(with: r)
            i = NSMaxRange(r)
        }
    }
    return out
}

/// Ranges of `ScripturePillAttachment` in document order (mirrors `Coordinator.collectPillAttachmentRanges` scan).
fileprivate func rangesOfScripturePillAttachments(in storage: NSTextStorage) -> [NSRange] {
    var ranges: [NSRange] = []
    let end = storage.length
    var idx = 0
    while idx < end {
        var eff = NSRange()
        let value = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
        if value is ScripturePillAttachment { ranges.append(eff) }
        let next = NSMaxRange(eff)
        if next <= idx { break }
        idx = next
    }
    return ranges
}

/// After saving `reference` + " " + `translation` as plain text, reload matches only the ref; remove the
/// following duplicate translation span so the chip isn’t immediately followed by plain “ ESV”.
/// Document-ordered `(reference, translation)` for each `ScripturePillAttachment` (used when re-detecting so translations aren’t reset to default).
fileprivate func scripturePillRefTransPairs(in storage: NSTextStorage) -> [(reference: String, translation: String)] {
    rangesOfScripturePillAttachments(in: storage).compactMap { range -> (String, String)? in
        guard let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment else { return nil }
        return (pill.reference, pill.translation)
    }
}

func removeDuplicateTranslationAfterPillAttachments(in storage: NSTextStorage) {
    for range in rangesOfScripturePillAttachments(in: storage).reversed() {
        guard let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment
        else { continue }
        let after = NSMaxRange(range)
        guard after < storage.length, !pill.translation.isEmpty else { continue }
        let toStrip = " " + pill.translation
        let ns = storage.string as NSString
        if ns.length >= after + toStrip.utf16.count,
           ns.substring(with: NSRange(location: after, length: toStrip.utf16.count)) == toStrip {
            storage.replaceCharacters(in: NSRange(location: after, length: toStrip.utf16.count), with: "")
        }
    }
}

/// Same reference for queue matching when `pill.reference` and regex `displayText` differ by abbreviation or casing.
fileprivate func scriptureReferencesMatchForTranslationQueue(_ stored: String, _ detected: String) -> Bool {
    if stored == detected { return true }
    guard let a = ScriptureReferenceParser.parse(stored), let b = ScriptureReferenceParser.parse(detected) else {
        return stored.caseInsensitiveCompare(detected) == .orderedSame
    }
    return a.bookIndex == b.bookIndex
        && a.chapter == b.chapter
        && a.verseStart == b.verseStart
        && a.verseEnd == b.verseEnd
}

/// `note.body` stores `reference + " " + translation` per pill; on load there are no attachments yet, so recover the code after each detector match.
fileprivate func scriptureTrailingTranslationAfterReference(
    match: ScriptureDetector.Match,
    in plain: String
) -> (translation: String, suffixUTF16Length: Int)? {
    let ns = plain as NSString
    let matchEnd = NSMaxRange(match.range)
    let len = ns.length
    guard matchEnd < len else { return nil }
    var pos = matchEnd
    var foundWhitespace = false
    while pos < len {
        let u = ns.character(at: pos)
        guard let scalar = UnicodeScalar(u) else { return nil }
        if CharacterSet.whitespacesAndNewlines.contains(scalar) {
            foundWhitespace = true
            pos += 1
        } else {
            break
        }
    }
    guard foundWhitespace, pos < len else { return nil }
    let tail = ns.substring(from: pos)
    for code in ScriptureReference.availableTranslations.sorted(by: { $0.utf16.count > $1.utf16.count }) {
        let opts: NSString.CompareOptions = [.anchored, .caseInsensitive]
        let r = (tail as NSString).range(of: code, options: opts)
        guard r.location == 0, r.length == (code as NSString).length else { continue }
        let codeUTF16 = code.utf16.count
        let idxAfter = pos + codeUTF16
        if idxAfter < len {
            let nextU = ns.character(at: idxAfter)
            if let s = UnicodeScalar(nextU), CharacterSet.letters.contains(s) { continue }
        }
        let suffixLen = idxAfter - matchEnd
        return (code, suffixLen)
    }
    return nil
}

/// Body copy line height for `NSTextView` / `UITextView` — use explicit min/max line height instead of
/// `lineHeightMultiple` alone, which can desync the line fragment from the insertion point and clip the caret.
private func noteBodyParagraphStyle() -> NSParagraphStyle {
    let p = NSMutableParagraphStyle()
    let f = HarvousFonts.system(size: 16, weight: 400)
    let natural = f.ascender - f.descender + f.leading
    let target = max(ceil(natural * 1.2), f.pointSize * 1.2)
    p.minimumLineHeight = target
    p.maximumLineHeight = target
    return p
}

#if os(macOS)
@MainActor
private func applyDefaultBodyTypingAttributes(to textView: NSTextView) {
    textView.typingAttributes = [
        .font: HarvousFonts.system(size: 16, weight: 400),
        .foregroundColor: NSColor.labelColor,
        .paragraphStyle: noteBodyParagraphStyle(),
    ]
}
#else
@MainActor
private func applyDefaultBodyTypingAttributes(to textView: UITextView) {
    textView.typingAttributes = [
        .font: HarvousFonts.system(size: 16, weight: 400),
        .foregroundColor: UIColor.label,
        .paragraphStyle: noteBodyParagraphStyle(),
    ]
}
#endif

// MARK: - Cross-platform wrapper

#if os(macOS)
import AppKit

/// Single-clicks on `ScripturePillAttachment` activate scripture editing after normal `NSTextView` handling so the I-beam/caret still appears.
private final class HarvousNoteTextView: NSTextView {
    /// UTF-16 attachment range in storage.
    var pillTapHandler: ((String, String, NSRange) -> Void)?

    /// Ensures `mouseMoved` / `cursorUpdate` fire for this view while hovering, not only when it is first responder.
    private var pillHoverTracking: NSTrackingArea?

    override func mouseDown(with event: NSEvent) {
        guard event.clickCount == 1,
              let storage = textStorage,
              storage.length > 0
        else {
            super.mouseDown(with: event)
            return
        }
        let point = convert(event.locationInWindow, from: nil)

        // Direct rect hit-test against rendered pill bounds — more reliable than
        // characterIndex for clicks that land in the pill image below the baseline.
        if let (pill, eff) = scripturePillAtPoint(point, in: storage) {
            super.mouseDown(with: event)
            pillTapHandler?(pill.reference, pill.translation, eff)
            return
        }

        // Fallback: nearest character ± 1 (handles clicks at the pill's text baseline)
        let charIdx = characterIndex(for: point)
        guard charIdx != NSNotFound,
              let (pill, eff) = scripturePillNearCharacterIndexWithRange(charIdx, in: storage)
        else {
            super.mouseDown(with: event)
            return
        }
        super.mouseDown(with: event)
        pillTapHandler?(pill.reference, pill.translation, eff)
    }

    private func scripturePillNearCharacterIndexWithRange(_ charIdx: Int, in storage: NSTextStorage) -> (ScripturePillAttachment, NSRange)? {
        var eff = NSRange()
        if charIdx < storage.length,
           let p = storage.attribute(.attachment, at: charIdx, effectiveRange: &eff) as? ScripturePillAttachment {
            return (p, eff)
        }
        if charIdx > 0,
           let p = storage.attribute(.attachment, at: charIdx - 1, effectiveRange: &eff) as? ScripturePillAttachment {
            return (p, eff)
        }
        if charIdx + 1 < storage.length,
           let p = storage.attribute(.attachment, at: charIdx + 1, effectiveRange: &eff) as? ScripturePillAttachment {
            return (p, eff)
        }
        return nil
    }

    /// Returns the scripture pill whose rendered rect contains `point` (view-local coords).
    /// Uses `firstRect(forCharacterRange:)` which works with both TextKit 1 and 2.
    private func scripturePillAtPoint(_ point: NSPoint, in storage: NSTextStorage) -> (ScripturePillAttachment, NSRange)? {
        guard let win = window else { return nil }
        let end = storage.length
        var idx = 0
        while idx < end {
            var eff = NSRange()
            let val = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
            if let pill = val as? ScripturePillAttachment {
                var actual = NSRange()
                let screenRect = firstRect(forCharacterRange: eff, actualRange: &actual)
                if screenRect != .zero {
                    let viewRect = convert(win.convertFromScreen(screenRect), from: nil)
                    if viewRect.contains(point) { return (pill, eff) }
                }
            }
            let next = NSMaxRange(eff)
            if next <= idx { break }
            idx = next
        }
        return nil
    }

    /// True when the pointer is over a rendered scripture pill (same logic as click hit-testing).
    private func isPointOverScripturePill(_ pointInView: NSPoint) -> Bool {
        guard let storage = textStorage, storage.length > 0 else { return false }
        if scripturePillAtPoint(pointInView, in: storage) != nil { return true }
        let charIdx = characterIndex(for: pointInView)
        if charIdx != NSNotFound, scripturePillNearCharacterIndexWithRange(charIdx, in: storage) != nil { return true }
        return false
    }

    /// NSTextView’s I-beam cursor rects win unless we re-apply the pointing hand *after* `super`
    /// (and on `mouseMoved` / `scrollWheel`, since `cursorUpdate` often does not fire over text).
    private func applyPillCursorAfterSuper(for event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if isPointOverScripturePill(point) {
            NSCursor.pointingHand.set()
        }
    }

    override func cursorUpdate(with event: NSEvent) {
        super.cursorUpdate(with: event)
        applyPillCursorAfterSuper(for: event)
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        applyPillCursorAfterSuper(for: event)
    }

    override func scrollWheel(with event: NSEvent) {
        super.scrollWheel(with: event)
        applyPillCursorAfterSuper(for: event)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let pillHoverTracking {
            removeTrackingArea(pillHoverTracking)
        }
        let opts: NSTrackingArea.Options = [.mouseMoved, .activeInKeyWindow, .inVisibleRect, .cursorUpdate]
        let area = NSTrackingArea(rect: bounds, options: opts, owner: self, userInfo: nil)
        addTrackingArea(area)
        pillHoverTracking = area
    }
}

/// Caret on/beside a `ScripturePillAttachment`, or a single-glyph selection of that attachment. Larger selections return nil.
@MainActor
private func activeScripturePillFromNSTextViewSelection(_ tv: NSTextView) -> ActiveScripturePill? {
    guard let storage = tv.textStorage, storage.length > 0 else { return nil }
    let r = tv.selectedRange()
    if r.length > 1 { return nil }
    if r.length == 1 {
        var eff = NSRange()
        guard let pill = storage.attribute(.attachment, at: r.location, effectiveRange: &eff) as? ScripturePillAttachment else { return nil }
        return ActiveScripturePill(attachmentRange: eff, reference: pill.reference, translation: pill.translation)
    }
    let loc = r.location
    if loc > 0 {
        var eff = NSRange()
        if let pill = storage.attribute(.attachment, at: loc - 1, effectiveRange: &eff) as? ScripturePillAttachment,
           loc == NSMaxRange(eff) {
            return ActiveScripturePill(attachmentRange: eff, reference: pill.reference, translation: pill.translation)
        }
    }
    if loc < storage.length {
        var eff = NSRange()
        if let pill = storage.attribute(.attachment, at: loc, effectiveRange: &eff) as? ScripturePillAttachment {
            return ActiveScripturePill(attachmentRange: eff, reference: pill.reference, translation: pill.translation)
        }
    }
    return nil
}

fileprivate func pngDataForInlineImageAttachment(_ attachment: NoteInlineImageAttachment) -> Data? {
    guard let img = attachment.image else { return nil }
    guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
    return rep.representation(using: .png, properties: [:])
}

/// Restores `HorizontalRuleAttachment` and `NoteInlineImageAttachment` after loading `note.body` as plain text.
@MainActor
fileprivate func rehydrateNativeInlineBlocks(in textView: NSTextView) {
    guard let storage = textView.textStorage else { return }
    let para = noteBodyParagraphStyle()
    let bodyAttrs: [NSAttributedString.Key: Any] = [
        .font: HarvousFonts.system(size: 16, weight: 400),
        .foregroundColor: NSColor.labelColor,
        .paragraphStyle: para
    ]

    storage.beginEditing()
    defer { storage.endEditing() }

    // 0. Legacy image placeholder (no payload) from older builds — strip so it doesn’t sit as raw text.
    while true {
        let ns = storage.string as NSString
        let legacy = ns.range(of: "\n[Image]\n")
        if legacy.location == NSNotFound { break }
        storage.replaceCharacters(in: legacy, with: "\n")
    }

    // 1. [Image:base64] markers (reverse search; remove invalid tokens so we don’t loop forever).
    let marker = "[Image:"
    var guardCount = 0
    while guardCount < 5_000 {
        guardCount += 1
        let fullStr = storage.string as NSString
        let r = fullStr.range(of: marker, options: .backwards)
        if r.location == NSNotFound { break }
        let after = NSMaxRange(r)
        if after >= fullStr.length { break }
        let tail = fullStr.range(of: "]", options: [], range: NSRange(location: after, length: fullStr.length - after))
        if tail.location == NSNotFound { break }
        let b64 = fullStr.substring(with: NSRange(location: after, length: tail.location - after))
        let tokenRange = NSRange(location: r.location, length: tail.location + 1 - r.location)
        if b64.isEmpty || b64.count >= 25_000_000 {
            storage.replaceCharacters(in: tokenRange, with: NSAttributedString(string: "", attributes: bodyAttrs))
            continue
        }
        if let data = Data(base64Encoded: b64), let img = NSImage(data: data) {
            let attach = NSAttributedString(attachment: NoteInlineImageAttachment(image: img))
            storage.replaceCharacters(in: tokenRange, with: attach)
        } else {
            storage.replaceCharacters(in: tokenRange, with: NSAttributedString(string: "", attributes: bodyAttrs))
        }
    }

    // 2. Horizontal rules (serialized as `\n---\n`).
    let patterns = ["\n---\n", "\r\n---\r\n"]
    for p in patterns {
        while true {
            let rr = (storage.string as NSString).range(of: p)
            if rr.location == NSNotFound { break }
            let full = NSMutableAttributedString()
            full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
            full.append(NSAttributedString(attachment: HorizontalRuleAttachment()))
            full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
            storage.replaceCharacters(in: rr, with: full)
        }
    }

    // Document begins with "---\n" (divider first).
    let head = storage.string as NSString
    if head.length >= 4 {
        let prefix = head.substring(with: NSRange(location: 0, length: 4))
        if prefix == "---\n" {
            let full = NSMutableAttributedString()
            full.append(NSAttributedString(attachment: HorizontalRuleAttachment()))
            full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
            storage.replaceCharacters(in: NSRange(location: 0, length: 4), with: full)
        }
    }

    // Only a divider, no surrounding newlines (older round-trips).
    if storage.string == "---" {
        let full = NSMutableAttributedString(attachment: HorizontalRuleAttachment())
        storage.replaceCharacters(in: NSRange(location: 0, length: 3), with: full)
    }
}

struct HarvousEditor: NSViewRepresentable {
    @Binding var state: EditorState
    var proxy: EditorProxy? = nil
    /// When set, a change forces body text to match `state` (e.g. switching notes while the view is still “editing”).
    var noteID: UUID? = nil
    /// Persisted body for the selected note. Use this when `noteID` changes, not `state` alone: `@State` can lag one frame and would load the previous note’s text.
    var documentBody: String = ""
    var placeholder: String = "What are you studying?"
    var font: NSFont = HarvousFonts.system(size: 16, weight: 400)
    /// `(reference, translation, attachmentUTF16Range)` when the user clicks a scripture pill.
    var onScripturePillTap: ((String, String, NSRange) -> Void)? = nil

    func makeCoordinator() -> Coordinator { Coordinator(state: $state) }

    @MainActor
    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        let template = scrollView.documentView as! NSTextView
        let textView = HarvousNoteTextView()
        textView.frame = template.frame
        textView.minSize = template.minSize
        textView.maxSize = template.maxSize
        textView.autoresizingMask = template.autoresizingMask
        scrollView.documentView = textView
        textView.pillTapHandler = onScripturePillTap
        scrollView.drawsBackground = false
        // `NoteEditorView` wraps this in a SwiftUI `ScrollView`; nested AppKit scrollers steal clicks/coordinates.
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        // Typography — keep line height close to the font’s natural metrics so the caret
        // and selection highlight match the text (a high multiple inflates the line box).
        let para = noteBodyParagraphStyle()
        textView.defaultParagraphStyle = para
        textView.typingAttributes = [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: para
        ]

        textView.isRichText = true       // rich text so formatting attributes stick
        textView.font = font
        textView.textColor = NSColor.labelColor
        textView.drawsBackground = false
        textView.backgroundColor = .clear
        textView.isEditable = true
        textView.isSelectable = true
        textView.allowsUndo = true
        textView.isContinuousSpellCheckingEnabled = true
        textView.isAutomaticSpellingCorrectionEnabled = true
        // Horizontal inset comes from SwiftUI padding; keep TextKit leading flush with title TextField.
        textView.textContainerInset = NSSize(width: 0, height: 8)
        if let tc = textView.textContainer {
            tc.widthTracksTextView = true
            tc.heightTracksTextView = false
            // Slight leading inset keeps the I-beam from sitting on the view edge where it can look clipped.
            tc.lineFragmentPadding = 2
        }
        textView.delegate = context.coordinator
        context.coordinator.textView = textView
        context.coordinator.proxy = proxy
        context.coordinator.placeholderText = placeholder
        proxy?.textView = textView   // wire proxy for toolbar actions
        context.coordinator.wireFormatBarToProxy(proxy)

        // Placeholder
        if state.plainText.isEmpty {
            textView.string = ""
            context.coordinator.showPlaceholder(in: textView, text: placeholder)
        }

        return scrollView
    }

    @MainActor
    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        let textView = scrollView.documentView as! HarvousNoteTextView
        textView.pillTapHandler = onScripturePillTap
        context.coordinator.proxy = proxy
        context.coordinator.wireFormatBarToProxy(proxy)
        let coord = context.coordinator
        if let p = proxy {
            p.syncPlainTextBindingFromTextView = { tv in
                coord.pushPlainTextAndRefsFromTextView(tv)
            }
        }

        var didSyncBodyFromState = false

        if let noteID, context.coordinator.boundNoteID != noteID {
            context.coordinator.boundNoteID = noteID
            context.coordinator.isEditing = false
            context.coordinator.suppressFormatBarOnNextBodyCaretUpdate = true
            let textViewToSync = textView
            // Load from the model, not from `state` (binding can still hold the previous note for one pass).
            syncTextViewToDocumentBody(textView, body: documentBody, context: context)
            if !documentBody.isEmpty {
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            }
            // `resetFormatBarStateForNewNote` mutates many @Published properties; it must not run inside
            // `updateNSView` or SwiftUI warns ("Publishing changes from within view updates").
            if let p = proxy {
                DispatchQueue.main.async {
                    p.resetFormatBarStateForNewNote()
                    p.syncBodyFirstResponderState(textView: textViewToSync)
                }
            }
            // Do not set `isEditing` from “body still first responder” here: it made `textViewDidChangeSelection`
            // think the user was already editing and showed the format bar on layout.
            return
        }

        // Only update if the source of truth changed externally (not from the user typing).
        // After a note switch, `state` can still hold the previous note until `syncFromNote` runs; the
        // text view was already loaded from `documentBody`. Do not clobber with stale binding text.
        if !context.coordinator.isEditing,
           let st = textView.textStorage {
            let plainStorage = plainBodyStringByExpandingPillAttachments(in: st)
            if plainStorage != state.plainText {
                let storageMatchesModel = plainStorage == documentBody
                let bindingBehindModel = state.plainText != documentBody
                if storageMatchesModel, bindingBehindModel {
                    didSyncBodyFromState = false
                } else {
                    syncTextViewDocument(textView, context: context)
                    didSyncBodyFromState = !state.plainText.isEmpty
                }
            }
        }

        if !context.coordinator.isEditing, !state.plainText.isEmpty, let st = textView.textStorage {
            if didSyncBodyFromState {
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            } else if !st.string.contains("\u{FFFC}"), !ScriptureDetector.detect(in: st.string).isEmpty {
                // Same plain `body` and `state` (no sync) but pills never applied, e.g. first layout.
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            }
        }
    }

    /// Replace the text view contents from `state` (plain string + placeholder when empty).
    private func syncTextViewDocument(_ textView: NSTextView, context: Context) {
        context.coordinator.withProgrammaticBodyMutation {
            if state.plainText.isEmpty {
                textView.string = ""
                context.coordinator.showPlaceholder(in: textView, text: placeholder)
            } else {
                context.coordinator.markNotPlaceholder()
                textView.string = state.plainText
                textView.textColor = NSColor.labelColor
                textView.font = HarvousFonts.system(size: 16, weight: 400)
                rehydrateNativeInlineBlocks(in: textView)
            }
        }
    }

    private func syncTextViewToDocumentBody(_ textView: NSTextView, body: String, context: Context) {
        context.coordinator.withProgrammaticBodyMutation {
            if body.isEmpty {
                textView.string = ""
                context.coordinator.showPlaceholder(in: textView, text: placeholder)
            } else {
                context.coordinator.markNotPlaceholder()
                textView.string = body
                textView.textColor = NSColor.labelColor
                textView.font = HarvousFonts.system(size: 16, weight: 400)
                rehydrateNativeInlineBlocks(in: textView)
            }
        }
    }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        @Binding var state: EditorState
        weak var textView: NSTextView?
        var proxy: EditorProxy?
        var boundNoteID: UUID?
        var isEditing = false
        var placeholderText = "What are you studying?"
        /// True when the body shows placeholder copy (see `showPlaceholder`). The view’s `textColor` cannot be used: placeholder uses attributed `.foregroundColor` only.
        private var isDisplayingPlaceholder: Bool = false
        private var debounceTask: Task<Void, Never>?
        private var formatBarHideTask: Task<Void, Never>?
        /// Dismisses a stray caret `selectionUpdate` after we replace the document (note switch) so the bar does not show until the user changes selection again.
        /// `fileprivate` so `HarvousEditor.updateNSView` can set it when `boundNoteID` changes (nested `private` is not visible to the outer type).
        fileprivate var suppressFormatBarOnNextBodyCaretUpdate: Bool = false
        /// `textDidChange` fires for programmatic loads, pill rewrites, etc. — suppress the format bar until user typing.
        private var programmaticBodyMutationDepth: Int = 0
        private var isProgrammaticBodyMutation: Bool { programmaticBodyMutationDepth > 0 }

        init(state: Binding<EditorState>) { _state = state }

        fileprivate func withProgrammaticBodyMutation(_ work: () -> Void) {
            programmaticBodyMutationDepth += 1
            work()
            programmaticBodyMutationDepth -= 1
        }

        /// Pushes the text view’s expanded plain body and detected refs into SwiftUI immediately (e.g. after scripture Apply) so `updateNSView` does not restore stale `plainText` and erase the pill.
        @MainActor
        func pushPlainTextAndRefsFromTextView(_ tv: NSTextView) {
            guard let storage = tv.textStorage else { return }
            let plain = plainBodyStringByExpandingPillAttachments(in: storage)
            state.plainText = plain
            state.detectedRefs = ScriptureDetector.detect(in: plain).map(\.displayText)
        }

        /// Re-run pill detection (e.g. after `syncTextViewDocument` loads saved plain text with no `NSTextAttachment`s).
        @MainActor
        func reapplyScripturePillsToBody(in textView: NSTextView) {
            detectAndInsertPills(in: textView, text: state.plainText)
        }

        /// Hooks so `EditorProxy` can cancel/restart the idle dismiss timer when the pointer enters/leaves the toolbar.
        func wireFormatBarToProxy(_ p: EditorProxy?) {
            guard let p else { return }
            p.cancelFormatBarHideAction = { [weak self] in self?.cancelFormatBarHide() }
            p.scheduleFormatBarHideAction = { [weak self] in self?.scheduleFormatBarHide() }
        }

        private func cancelFormatBarHide() {
            formatBarHideTask?.cancel()
            formatBarHideTask = nil
        }

        private func scheduleFormatBarHide() {
            formatBarHideTask?.cancel()
            formatBarHideTask = Task { @MainActor in
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled else { return }
                self.applyFormatBarHideIfNeeded()
            }
        }

        private func applyFormatBarHideIfNeeded() {
            guard let tv = textView, let p = proxy else { return }
            if p.hasSelection { return }
            if p.isPointerOverFormatToolbar { return }
            if isRichContextAtCaret(tv) { return }
            p.showFormatBarForActivity = false
        }

        /// True when the caret sits in text that is not plain body (font traits, size, list indent, code bg, link, etc.).
        private func isRichContextAtCaret(_ tv: NSTextView) -> Bool {
            guard let storage = tv.textStorage else { return false }
            let r = tv.selectedRange()
            guard r.length == 0 else { return false }
            if storage.length == 0 {
                return isRichAttributeDictionary(tv.typingAttributes, emptyStorage: true)
            }
            let before = min(r.location, storage.length) - 1
            let i = before >= 0 ? before : 0
            let attrs = storage.attributes(at: i, effectiveRange: nil)
            return isRichAttributeDictionary(attrs, emptyStorage: false)
        }

        private func isRichAttributeDictionary(_ attributes: [NSAttributedString.Key: Any], emptyStorage: Bool) -> Bool {
            if attributes[.link] != nil { return true }
            if (attributes[.strikethroughStyle] as? Int ?? 0) != 0 { return true }
            if attributes[.backgroundColor] is NSColor { return true }

            if let p = attributes[.paragraphStyle] as? NSParagraphStyle {
                if p.firstLineHeadIndent > 0.5 || p.headIndent > 0.5 { return true }
            }

            let font = (attributes[.font] as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
            let manager = NSFontManager.shared
            if HarvousFonts.bodyHeadingLevel(matching: font) != nil { return true }
            if manager.traits(of: font).contains(.boldFontMask) { return true }
            if manager.traits(of: font).contains(.italicFontMask) { return true }
            if font.pointSize >= 19 { return true }
            if emptyStorage { return false }
            let diff16 = abs(font.pointSize - 16.0)
            let diff15 = abs(font.pointSize - 15.0)
            if diff16 > 0.4 && diff15 > 0.4 { return true }
            return false
        }

        /// Collect ranges with `ScripturePillAttachment` without `enumerateAttribute` (avoids Swift 6 `@Sendable` closure / MainActor warnings).
        private func collectPillAttachmentRanges(in storage: NSTextStorage) -> [NSRange] {
            var ranges: [NSRange] = []
            let fullRange = NSRange(location: 0, length: storage.length)
            var idx = fullRange.location
            let end = NSMaxRange(fullRange)
            while idx < end {
                var eff = NSRange()
                let value = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
                if value is ScripturePillAttachment { ranges.append(eff) }
                let next = NSMaxRange(eff)
                if next <= idx { break }
                idx = next
            }
            return ranges
        }

        /// Call when the document is real body text, not the placeholder string.
        func markNotPlaceholder() {
            isDisplayingPlaceholder = false
        }

        func showPlaceholder(in textView: NSTextView, text: String) {
            // Simple placeholder via text storage (tertiary label reads lighter than .placeholderTextColor in the canvas)
            if textView.string.isEmpty {
                let attrs: [NSAttributedString.Key: Any] = [
                    .foregroundColor: NSColor.tertiaryLabelColor,
                    .font: HarvousFonts.system(size: 16, weight: 400)
                ]
                textView.textStorage?.setAttributedString(NSAttributedString(string: text, attributes: attrs))
                isDisplayingPlaceholder = true
                textView.setSelectedRange(NSRange(location: 0, length: 0))
            }
        }

        /// Clears placeholder and leaves an empty, typed body. `NSTextView.textColor` is not reliable when the
        /// placeholder is applied only on `textStorage` (the view can still report `labelColor`).
        private func clearPlaceholderForEditingIfNeeded(_ tv: NSTextView) {
            guard isDisplayingPlaceholder else { return }
            isDisplayingPlaceholder = false
            let para = noteBodyParagraphStyle()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: HarvousFonts.system(size: 16, weight: 400),
                .foregroundColor: NSColor.labelColor,
                .paragraphStyle: para
            ]
            tv.textStorage?.setAttributedString(NSAttributedString(string: "", attributes: attrs))
            tv.typingAttributes = attrs
            tv.font = HarvousFonts.system(size: 16, weight: 400)
            tv.textColor = NSColor.labelColor
            tv.setSelectedRange(NSRange(location: 0, length: 0))
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            // Placeholder is decorative; clicks often land at the end of the string. Keep the caret at
            // the start until editing begins so the first typed character isn’t “after” the hint text.
            if isDisplayingPlaceholder, !isEditing {
                let r = tv.selectedRange()
                if r.location != 0 || r.length != 0 {
                    tv.setSelectedRange(NSRange(location: 0, length: 0))
                    return
                }
            }
            let range = tv.selectedRange()
            let hasSelection = range.length > 0

            // Compute selection rect while we still have the text view in scope
            var contentPoint: CGPoint? = nil
            if hasSelection,
               let window = tv.window,
               let contentView = window.contentView {
                var actualRange = NSRange()
                let screenRect = tv.firstRect(forCharacterRange: range, actualRange: &actualRange)
                let windowRect = window.convertFromScreen(screenRect)
                let cvRect     = contentView.convert(windowRect, from: nil)
                let swiftUIX   = cvRect.midX
                let swiftUIY   = contentView.bounds.height - cvRect.maxY
                contentPoint   = CGPoint(x: swiftUIX, y: swiftUIY)
            }

            // Defer @Published-equivalent writes to the next run-loop pass so they
            // don't fire while SwiftUI is mid-update ("Publishing from view update" warning).
            let capturedProxy = proxy
            Task { @MainActor in
                capturedProxy?.syncBodyFirstResponderState(textView: tv)
                capturedProxy?.hasSelection = hasSelection
                capturedProxy?.selectionContentPoint = contentPoint
                capturedProxy?.refreshFormatState()
                capturedProxy?.activeScripturePill = activeScripturePillFromNSTextViewSelection(tv)
                guard let p = capturedProxy else { return }
                if hasSelection {
                    self.cancelFormatBarHide()
                } else {
                    if self.suppressFormatBarOnNextBodyCaretUpdate {
                        self.suppressFormatBarOnNextBodyCaretUpdate = false
                    } else {
                        // A click/tap in the body to place the caret does not re-send `textDidBeginEditing` if the
                        // `NSTextView` was already key, so we key off the window’s first responder as well as `isEditing`.
                        // A programmatic selection while the title field is first responder still has `body` not key.
                        let bodyIsKey = (tv.window?.firstResponder as AnyObject?) === (tv as AnyObject)
                        guard self.isEditing || bodyIsKey else { return }
                        p.showFormatBarForActivity = true
                        self.scheduleFormatBarHide()
                    }
                }
            }
        }

        func textDidBeginEditing(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            isEditing = true
            suppressFormatBarOnNextBodyCaretUpdate = false
            let skipFormatBar = isProgrammaticBodyMutation
            clearPlaceholderForEditingIfNeeded(tv)
            // Defer: AppKit can call this in the same turn as layout/SwiftUI updates; publishing in-body triggers warnings.
            Task { @MainActor in
                self.proxy?.isBodyFirstResponder = true
                // First click can deliver selection before the coordinator observed `isEditing` in
                // `textViewDidChangeSelection`; this keeps the bar in sync for a caret in body text.
                if !skipFormatBar,
                   let p = self.proxy, tv.selectedRange().length == 0 {
                    p.formatBarUnlocked = true
                    p.showFormatBarForActivity = true
                    self.scheduleFormatBarHide()
                }
            }
        }

        func textDidEndEditing(_ notification: Notification) {
            isEditing = false
            cancelFormatBarHide()
            guard let tv = notification.object as? NSTextView else { return }
            let placeholder = placeholderText
            Task { @MainActor in
                self.proxy?.isBodyFirstResponder = false
                self.proxy?.showFormatBarForActivity = false
                if tv.string.isEmpty {
                    self.showPlaceholder(in: tv, text: placeholder)
                }
            }
        }

        func textDidChange(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView,
                  let storage = tv.textStorage else { return }
            let plain = plainBodyStringByExpandingPillAttachments(in: storage)
            // Capture before the deferred `Task`: mutation scope may end before the task runs.
            let isProgrammatic = isProgrammaticBodyMutation

            // Debounced scripture detection
            debounceTask?.cancel()
            debounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                self.detectAndInsertPills(in: tv, text: plain)
            }

            // Defer binding + proxy so this isn’t the same run loop as TextKit/NSView layout.
            Task { @MainActor in
                self.state.plainText = plain
                if !isProgrammatic {
                    self.proxy?.formatBarUnlocked = true
                    self.proxy?.showFormatBarForActivity = true
                    self.scheduleFormatBarHide()
                }
                self.proxy?.refreshFormatState()
            }
        }

        @MainActor
        private func detectAndInsertPills(in textView: NSTextView, text: String) {
            withProgrammaticBodyMutation {
                self.detectAndInsertPillsImpl(in: textView, text: text)
            }
        }

        @MainActor
        private func detectAndInsertPillsImpl(in textView: NSTextView, text: String) {
            _ = text

            guard let storage = textView.textStorage else { return }
            var translationQueue = scripturePillRefTransPairs(in: storage)
            // Remove existing pill attachments first
            let pillRanges = collectPillAttachmentRanges(in: storage)
            // Replace in reverse order to preserve offsets
            for range in pillRanges.reversed() {
                // Recover the plain reference text before removing
                if let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment {
                    storage.replaceCharacters(in: range, with: pill.reference)
                }
            }

            // Re-detect on the now-plain text and insert pills
            let plainNow = storage.string
            let freshMatches = ScriptureDetector.detect(in: plainNow)
            let sortedAsc = freshMatches.sorted { $0.range.location < $1.range.location }
            var pillInserts: [(range: NSRange, translation: String, displayRef: String)] = []
            pillInserts.reserveCapacity(sortedAsc.count)
            for match in sortedAsc {
                let suffixPair = scriptureTrailingTranslationAfterReference(match: match, in: plainNow)
                let trans: String
                if sortedAsc.count == 1, translationQueue.count == 1 {
                    trans = translationQueue.removeFirst().translation
                } else if let idx = translationQueue.firstIndex(where: { scriptureReferencesMatchForTranslationQueue($0.reference, match.displayText) }) {
                    trans = translationQueue.remove(at: idx).translation
                } else if let (code, _) = suffixPair {
                    trans = code
                } else {
                    trans = ScriptureReference.defaultTranslation
                }
                var replaceRange = match.range
                if let (code, sufLen) = suffixPair, code.caseInsensitiveCompare(trans) == .orderedSame {
                    replaceRange = NSRange(location: match.range.location, length: match.range.length + sufLen)
                }
                pillInserts.append((replaceRange, trans, match.displayText))
            }

            for item in pillInserts.sorted(by: { $0.range.location > $1.range.location }) {
                let pill = ScripturePillAttachment(reference: item.displayRef, translation: item.translation)
                let pillStr = NSMutableAttributedString(attachment: pill)
                let bodyFont: NSFont = HarvousFonts.system(size: 16, weight: 400)
                pillStr.addAttributes([.font: bodyFont], range: NSRange(location: 0, length: pillStr.length))
                storage.replaceCharacters(in: item.range, with: pillStr)
            }

            // Do not reset fonts on the full document here — that stripped headings/bold after scripture detection.
            // Pills already get body font when inserted above.
            removeDuplicateTranslationAfterPillAttachments(in: storage)
            applyDefaultBodyTypingAttributes(to: textView)

            // `textDidChange` is not always sent when `textStorage` is edited programmatically. Sync
            // the binding with real reference text, not U+FFFC per attachment, or `updateNSView` will
            // clobber pills with stale plain text and the visible scripture is lost.
            // Never assign `state` synchronously from here: `reapplyScripturePillsToBody` runs inside
            // `updateNSView` and would trigger "Modifying state during view update".
            let plainOut = plainBodyStringByExpandingPillAttachments(in: storage)
            let refsOut = freshMatches.map(\.displayText)
            Task { @MainActor in
                self.state.plainText = plainOut
                self.state.detectedRefs = refsOut
            }
        }
    }
}

#else
import UIKit

@MainActor
private func activeScripturePillFromUITextViewSelection(_ tv: UITextView) -> ActiveScripturePill? {
    let storage = tv.textStorage
    guard storage.length > 0 else { return nil }
    let r = tv.selectedRange
    if r.length > 1 { return nil }
    if r.length == 1 {
        var eff = NSRange()
        guard let pill = storage.attribute(.attachment, at: r.location, effectiveRange: &eff) as? ScripturePillAttachment else { return nil }
        return ActiveScripturePill(attachmentRange: eff, reference: pill.reference, translation: pill.translation)
    }
    let loc = r.location
    if loc > 0 {
        var eff = NSRange()
        if let pill = storage.attribute(.attachment, at: loc - 1, effectiveRange: &eff) as? ScripturePillAttachment,
           loc == NSMaxRange(eff) {
            return ActiveScripturePill(attachmentRange: eff, reference: pill.reference, translation: pill.translation)
        }
    }
    if loc < storage.length {
        var eff = NSRange()
        if let pill = storage.attribute(.attachment, at: loc, effectiveRange: &eff) as? ScripturePillAttachment {
            return ActiveScripturePill(attachmentRange: eff, reference: pill.reference, translation: pill.translation)
        }
    }
    return nil
}

struct HarvousEditor: UIViewRepresentable {
    @Binding var state: EditorState
    var noteID: UUID? = nil
    var documentBody: String = ""
    var placeholder: String = "What are you studying?"
    var scriptureProxy: IOSNoteBodyProxy? = nil
    var onScripturePillTap: ((String, String, NSRange) -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        let c = Coordinator(state: $state)
        c.placeholderText = placeholder
        c.scriptureProxy = scriptureProxy
        return c
    }

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        let para = noteBodyParagraphStyle()
        let bodyFont = HarvousFonts.system(size: 16, weight: 400)
        tv.font = bodyFont
        tv.textColor = .label
        tv.backgroundColor = .clear
        tv.isEditable = true
        tv.isSelectable = true
        tv.allowsEditingTextAttributes = false
        tv.autocorrectionType = .yes
        tv.spellCheckingType = .yes
        tv.autocapitalizationType = .sentences
        tv.typingAttributes = [
            .font: bodyFont,
            .foregroundColor: UIColor.label,
            .paragraphStyle: para
        ]
        tv.delegate = context.coordinator
        context.coordinator.textView = tv
        context.coordinator.placeholderText = placeholder
        context.coordinator.scriptureProxy = scriptureProxy
        scriptureProxy?.textView = tv
        tv.textContainer.lineFragmentPadding = 2
        tv.textContainerInset = UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePillTap(_:)))
        tap.cancelsTouchesInView = false
        tap.delegate = context.coordinator
        tv.addGestureRecognizer(tap)
        if state.plainText.isEmpty {
            tv.text = placeholder
            tv.textColor = .tertiaryLabel
            tv.selectedTextRange = tv.textRange(from: tv.beginningOfDocument, to: tv.beginningOfDocument)
        }
        return tv
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        var didSyncBodyFromState = false
        context.coordinator.placeholderText = placeholder
        context.coordinator.onScripturePillTap = onScripturePillTap
        context.coordinator.scriptureProxy = scriptureProxy
        scriptureProxy?.textView = textView
        let coord = context.coordinator
        if let sp = scriptureProxy {
            sp.syncPlainTextBindingFromTextView = { tv in
                coord.pushPlainTextAndRefsFromTextView(tv)
            }
        }

        if let noteID, context.coordinator.boundNoteID != noteID {
            context.coordinator.boundNoteID = noteID
            context.coordinator.isEditing = false
            if documentBody.isEmpty {
                textView.text = placeholder
                textView.textColor = .tertiaryLabel
                textView.selectedTextRange = textView.textRange(from: textView.beginningOfDocument, to: textView.beginningOfDocument)
            } else {
                textView.text = documentBody
                textView.textColor = .label
            }
            if !documentBody.isEmpty {
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            }
            return
        }
        if !context.coordinator.isEditing {
            let plainStorage = plainBodyStringByExpandingPillAttachments(in: textView.textStorage)
            if plainStorage != state.plainText {
                let storageMatchesModel = plainStorage == documentBody
                let bindingBehindModel = state.plainText != documentBody
                if storageMatchesModel, bindingBehindModel {
                    didSyncBodyFromState = false
                } else {
                    textView.text = state.plainText
                    if !state.plainText.isEmpty { textView.textColor = .label }
                    didSyncBodyFromState = !state.plainText.isEmpty
                }
            }
        }
        if !context.coordinator.isEditing, !state.plainText.isEmpty {
            let st = textView.textStorage
            if didSyncBodyFromState {
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            } else if !st.string.contains("\u{FFFC}"), !ScriptureDetector.detect(in: st.string).isEmpty {
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            }
        }
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate, UIGestureRecognizerDelegate {
        @Binding var state: EditorState
        weak var textView: UITextView?
        weak var scriptureProxy: IOSNoteBodyProxy?
        var boundNoteID: UUID?
        var isEditing = false
        var placeholderText: String = "What are you studying?"
        var onScripturePillTap: ((String, String, NSRange) -> Void)?
        private var debounceTask: Task<Void, Never>?

        init(state: Binding<EditorState>) { _state = state }

        @MainActor
        func pushPlainTextAndRefsFromTextView(_ tv: UITextView) {
            let storage = tv.textStorage
            let plain = plainBodyStringByExpandingPillAttachments(in: storage)
            state.plainText = plain
            state.detectedRefs = ScriptureDetector.detect(in: plain).map(\.displayText)
        }

        /// `UITextViewDelegate` attachment callbacks are unreliable for custom `NSTextAttachment`; use a tap gesture instead.
        @objc func handlePillTap(_ gesture: UITapGestureRecognizer) {
            guard gesture.state == .ended, let tv = textView, tv.textColor != .tertiaryLabel else { return }
            let point = gesture.location(in: tv)
            guard let pos = tv.closestPosition(to: point) else { return }
            let offset = tv.offset(from: tv.beginningOfDocument, to: pos)
            let storage = tv.textStorage
            guard storage.length > 0 else { return }
            guard let (pill, eff) = Self.pillAttachmentRange(containingUTF16: offset, in: storage) else { return }
            onScripturePillTap?(pill.reference, pill.translation, eff)
        }

        private static func pillAttachmentRange(containingUTF16 utf16: Int, in storage: NSTextStorage) -> (ScripturePillAttachment, NSRange)? {
            for idx in [utf16, utf16 - 1, utf16 + 1] {
                guard idx >= 0, idx < storage.length else { continue }
                var eff = NSRange()
                if let pill = storage.attribute(.attachment, at: idx, effectiveRange: &eff) as? ScripturePillAttachment {
                    return (pill, eff)
                }
            }
            return nil
        }

        // MARK: UIGestureRecognizerDelegate

        /// Allow our recognizer to fire alongside UITextView's internal cursor-placement recognizer.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            return true
        }

        /// Only activate when the tap lands on a scripture pill; normal text taps pass through to UITextView.
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let tv = textView,
                  tv.textColor != .tertiaryLabel,
                  let tap = gestureRecognizer as? UITapGestureRecognizer else { return false }
            let point = tap.location(in: tv)
            guard let pos = tv.closestPosition(to: point) else { return false }
            let offset = tv.offset(from: tv.beginningOfDocument, to: pos)
            let storage = tv.textStorage
            guard storage.length > 0 else { return false }
            return Self.pillAttachmentRange(containingUTF16: offset, in: storage) != nil
        }

        @MainActor
        func reapplyScripturePillsToBody(in textView: UITextView) {
            detectAndInsertPills(in: textView, text: state.plainText)
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            isEditing = true
            if textView.textColor == .tertiaryLabel {
                textView.text = ""
                textView.textColor = .label
                textView.selectedRange = NSRange(location: 0, length: 0)
            }
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            if !isEditing, textView.textColor == .tertiaryLabel {
                let len = (textView.text as NSString).length
                let r = textView.selectedRange
                if r.location != 0 || r.length != 0, len > 0 {
                    textView.selectedRange = NSRange(location: 0, length: 0)
                }
                return
            }
            let captured = scriptureProxy
            Task { @MainActor in
                captured?.activeScripturePill = activeScripturePillFromUITextViewSelection(textView)
            }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            isEditing = false
            let hint = placeholderText
            if textView.text.isEmpty {
                textView.text = hint
                textView.textColor = .tertiaryLabel
                textView.selectedRange = NSRange(location: 0, length: 0)
            }
        }

        func textViewDidChange(_ textView: UITextView) {
            guard textView.textColor != .tertiaryLabel else { return }
            let plain = plainBodyStringByExpandingPillAttachments(in: textView.textStorage)
            Task { @MainActor in
                self.state.plainText = plain
            }

            debounceTask?.cancel()
            debounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                self.detectAndInsertPills(in: textView, text: plain)
            }
        }

        @MainActor
        private func detectAndInsertPills(in textView: UITextView, text: String) {
            _ = text

            let storage = textView.textStorage
            var translationQueue = scripturePillRefTransPairs(in: storage)
            let fullRange = NSRange(location: 0, length: storage.length)

            var pillRanges: [NSRange] = []
            storage.enumerateAttribute(.attachment, in: fullRange) { value, range, _ in
                if value is ScripturePillAttachment { pillRanges.append(range) }
            }
            for range in pillRanges.reversed() {
                if let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment {
                    storage.replaceCharacters(in: range, with: pill.reference)
                }
            }

            let plainNow = storage.string
            let freshMatches = ScriptureDetector.detect(in: plainNow)
            let sortedAsc = freshMatches.sorted { $0.range.location < $1.range.location }
            var pillInserts: [(range: NSRange, translation: String, displayRef: String)] = []
            pillInserts.reserveCapacity(sortedAsc.count)
            for match in sortedAsc {
                let suffixPair = scriptureTrailingTranslationAfterReference(match: match, in: plainNow)
                let trans: String
                if sortedAsc.count == 1, translationQueue.count == 1 {
                    trans = translationQueue.removeFirst().translation
                } else if let idx = translationQueue.firstIndex(where: { scriptureReferencesMatchForTranslationQueue($0.reference, match.displayText) }) {
                    trans = translationQueue.remove(at: idx).translation
                } else if let (code, _) = suffixPair {
                    trans = code
                } else {
                    trans = ScriptureReference.defaultTranslation
                }
                var replaceRange = match.range
                if let (code, sufLen) = suffixPair, code.caseInsensitiveCompare(trans) == .orderedSame {
                    replaceRange = NSRange(location: match.range.location, length: match.range.length + sufLen)
                }
                pillInserts.append((replaceRange, trans, match.displayText))
            }

            for item in pillInserts.sorted(by: { $0.range.location > $1.range.location }) {
                let pill = ScripturePillAttachment(reference: item.displayRef, translation: item.translation)
                let pillStr = NSMutableAttributedString(attachment: pill)
                pillStr.addAttributes([.font: HarvousFonts.system(size: 16, weight: 400)], range: NSRange(location: 0, length: pillStr.length))
                storage.replaceCharacters(in: item.range, with: pillStr)
            }
            removeDuplicateTranslationAfterPillAttachments(in: storage)
            applyDefaultBodyTypingAttributes(to: textView)

            // Programmatic `textStorage` edits may not call `textViewDidChange`; keep binding in sync
            // (expand pills to real text) or `updateUIView` can reset the text view and remove pills.
            // Defer `state` writes so `updateUIView` never mutates SwiftUI bindings synchronously.
            let plainOut = plainBodyStringByExpandingPillAttachments(in: storage)
            let refsOut = freshMatches.map(\.displayText)
            Task { @MainActor in
                self.state.plainText = plainOut
                self.state.detectedRefs = refsOut
            }
        }
    }
}
#endif
