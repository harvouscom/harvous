import SwiftUI
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

// MARK: - Shared editor model

/// Reference type (was a value `struct`) so a per-keystroke `plainText` write no longer invalidates
/// the **entire** `NoteEditorView` body via `@State`. As an `@Observable` class, SwiftUI tracks reads
/// per-property, so only the small scopes that actually read `plainText` re-evaluate — the
/// `HarvousEditor` representable (which reads `documentBody`/`note.body`, not `plainText`) is no longer
/// recreated on every keystroke. Coordinators hold the instance directly and re-point it each
/// `update{NS,UI}View` so it never goes stale after a note-switch `EditorState(...)` reassignment.
@Observable
final class EditorState {
    var plainText: String = ""
    var detectedRefs: [String] = []

    init(plainText: String = "", detectedRefs: [String] = []) {
        self.plainText = plainText
        self.detectedRefs = detectedRefs
    }
}

/// `NSTextStorage.string` uses the object replacement character (U+FFFC) for each `NSTextAttachment`, so
/// blind `string` reads omit visible scripture. Walk storage and inline each `ScripturePillAttachment`’s
/// text so `note.body` and list excerpts match the pill.
/// Expands scripture pill attachments (and macOS inline blocks) to plain text for persistence and thread snippets.
func harvousExpandedPlainText(in storage: NSTextStorage) -> String {
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
            } else if let urlPill = att as? URLLinkPillAttachment {
                // Labeled pills serialize as `[label](href)` so the round-trip detector can rebuild
                // the pill with its label. Auto-detected pills (no label) round-trip as bare href —
                // unchanged from the URL-pill v1 shape so existing notes don't get rewritten.
                if let label = urlPill.label, !label.isEmpty {
                    out += "[\(label)](\(urlPill.href))"
                } else {
                    out += urlPill.href
                }
                i = NSMaxRange(eff)
            } else if att is HorizontalRuleAttachment {
                // insertDivider wraps the attachment in `\n…\n`; collapse those so save emits canonical `\n---\n` once.
                while out.hasSuffix("\n") {
                    out.removeLast()
                }
                out += "\n---\n"
                i = NSMaxRange(eff)
                while i < len {
                    let r = ns.rangeOfComposedCharacterSequence(at: i)
                    if ns.substring(with: r) == "\n" {
                        i = NSMaxRange(r)
                    } else {
                        break
                    }
                }
            } else if let imgAtt = att as? NoteInlineImageAttachment {
                if let payload = NoteInlineImageSerialization.inlineImagePayload(from: imgAtt) {
                    out += NoteInlineImageSerialization.inlineImageMarker(forPayload: payload)
                } else {
                    out += NoteInlineImageSerialization.legacyPlaceholder
                }
                i = NSMaxRange(eff)
            } else {
                let r = ns.rangeOfComposedCharacterSequence(at: i)
                out += ns.substring(with: r)
                i = NSMaxRange(r)
            }
        } else {
            let r = ns.rangeOfComposedCharacterSequence(at: i)
            out += ns.substring(with: r)
            i = NSMaxRange(r)
        }
    }
    return out
}

/// Returns the body paragraph style.
private func noteBodyParagraphStyle() -> NSParagraphStyle {
    NSMutableParagraphStyle()
}

private func noteBodyTypingAttributes() -> [NSAttributedString.Key: Any] {
    let para = noteBodyParagraphStyle()
#if os(macOS)
    return [
        .font: HarvousFonts.noteComposeBodyPlatformFont(),
        .foregroundColor: NSColor.labelColor,
        .paragraphStyle: para
    ]
#else
    return [
        .font: HarvousFonts.noteComposeBodyPlatformFont(),
        .foregroundColor: UIColor.label,
        .paragraphStyle: para
    ]
#endif
}

/// UTF-16 newline scalar in plain body strings.
private let horizontalRulePlainNewline: unichar = 10

/// Finds the next `---` divider marker, absorbing adjacent blank lines from legacy double-newline saves.
private func horizontalRuleMarkerRange(in ns: NSString) -> NSRange? {
    let length = ns.length
    if length == 0 { return nil }

    if length == 3, ns.substring(with: NSRange(location: 0, length: 3)) == "---" {
        return NSRange(location: 0, length: 3)
    }

    if length >= 4, ns.substring(with: NSRange(location: 0, length: 4)) == "---\n" {
        var end = 4
        while end < length, ns.character(at: end) == horizontalRulePlainNewline {
            end += 1
        }
        return NSRange(location: 0, length: end)
    }

    let patterns = ["\n---\n", "\r\n---\r\n"]
    for pattern in patterns {
        let core = ns.range(of: pattern)
        if core.location == NSNotFound { continue }
        var start = core.location
        var end = NSMaxRange(core)
        while start > 0, ns.character(at: start - 1) == horizontalRulePlainNewline {
            start -= 1
        }
        while end < length, ns.character(at: end) == horizontalRulePlainNewline {
            end += 1
        }
        return NSRange(location: start, length: end - start)
    }
    return nil
}

/// Horizontal rules only — safe to run synchronously on note open.
@MainActor
func rehydrateHorizontalRules(in storage: NSTextStorage) {
    let bodyAttrs = noteBodyTypingAttributes()
    storage.beginEditing()
    defer { storage.endEditing() }

    while true {
        let ns = storage.string as NSString
        guard let rr = horizontalRuleMarkerRange(in: ns) else { break }

        let full = NSMutableAttributedString()
        if rr.location == 0 {
            full.append(NSAttributedString(attachment: HorizontalRuleAttachment()))
            full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
        } else {
            full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
            full.append(NSAttributedString(attachment: HorizontalRuleAttachment()))
            full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
        }
        storage.replaceCharacters(in: rr, with: full)
    }
}

/// Swap `\n[Image]\n` placeholders with decoded attachments (main actor, after async decode).
@MainActor
fileprivate func applyInlineImagePlaceholders(in storage: NSTextStorage, payloads: [Data]) {
    guard !payloads.isEmpty else { return }
    let bodyAttrs = noteBodyTypingAttributes()
    let placeholder = NoteInlineImageSerialization.legacyPlaceholder
    storage.beginEditing()
    defer { storage.endEditing() }

    var payloadIndex = 0
    while payloadIndex < payloads.count {
        let ns = storage.string as NSString
        let r = ns.range(of: placeholder)
        if r.location == NSNotFound { break }
#if os(macOS)
        if let img = NoteInlineImageSerialization.imageFromInlinePayload(payloads[payloadIndex]) {
            let attach = NSAttributedString(attachment: NoteInlineImageAttachment(image: img))
            storage.replaceCharacters(in: r, with: attach)
        } else {
            storage.replaceCharacters(in: r, with: NSAttributedString(string: "", attributes: bodyAttrs))
        }
#else
        if let img = NoteInlineImageSerialization.imageFromInlinePayload(payloads[payloadIndex]) {
            let attach = NSAttributedString(attachment: NoteInlineImageAttachment(image: img))
            storage.replaceCharacters(in: r, with: attach)
        } else {
            storage.replaceCharacters(in: r, with: NSAttributedString(string: "", attributes: bodyAttrs))
        }
#endif
        payloadIndex += 1
    }

    // Strip orphan placeholders left from failed decodes.
    while true {
        let ns = storage.string as NSString
        let legacy = ns.range(of: placeholder)
        if legacy.location == NSNotFound { break }
        storage.replaceCharacters(in: legacy, with: "\n")
    }
}

/// Synchronous image marker decode — used only when the body has no payload markers to strip.
@MainActor
fileprivate func rehydrateInlineImagesSync(in storage: NSTextStorage) {
    let bodyAttrs = noteBodyTypingAttributes()
    let marker = "[Image:"
    storage.beginEditing()
    defer { storage.endEditing() }

    while true {
        let ns = storage.string as NSString
        let legacy = ns.range(of: NoteInlineImageSerialization.legacyPlaceholder)
        if legacy.location == NSNotFound { break }
        storage.replaceCharacters(in: legacy, with: "\n")
    }

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
#if os(macOS)
        if let data = Data(base64Encoded: b64), let img = NoteInlineImageSerialization.imageFromInlinePayload(data) {
            let attach = NSAttributedString(attachment: NoteInlineImageAttachment(image: img))
            storage.replaceCharacters(in: tokenRange, with: attach)
        } else {
            storage.replaceCharacters(in: tokenRange, with: NSAttributedString(string: "", attributes: bodyAttrs))
        }
#else
        if let data = Data(base64Encoded: b64), let img = NoteInlineImageSerialization.imageFromInlinePayload(data) {
            let attach = NSAttributedString(attachment: NoteInlineImageAttachment(image: img))
            storage.replaceCharacters(in: tokenRange, with: attach)
        } else {
            storage.replaceCharacters(in: tokenRange, with: NSAttributedString(string: "", attributes: bodyAttrs))
        }
#endif
    }
}

/// Restores inline blocks after loading `note.body` as plain text.
/// - `asyncImagePayloads == nil`: decode any `[Image:…]` markers synchronously (legacy / no async path).
/// - `asyncImagePayloads == []`: placeholders already in storage; async decode will swap them in.
/// - `asyncImagePayloads` non-empty: apply pre-validated payloads synchronously.
@MainActor
fileprivate func rehydrateNativeInlineBlocks(in storage: NSTextStorage, asyncImagePayloads: [Data]? = nil) {
    rehydrateHorizontalRules(in: storage)
    if let payloads = asyncImagePayloads {
        if !payloads.isEmpty {
            applyInlineImagePlaceholders(in: storage, payloads: payloads)
        }
    } else {
        rehydrateInlineImagesSync(in: storage)
    }
}

#if os(macOS)
@MainActor
fileprivate func rehydrateNativeInlineBlocks(in textView: NSTextView, asyncImagePayloads: [Data]? = nil) {
    guard let storage = textView.textStorage else { return }
    rehydrateNativeInlineBlocks(in: storage, asyncImagePayloads: asyncImagePayloads)
}
#else
@MainActor
fileprivate func rehydrateNativeInlineBlocks(in textView: UITextView, asyncImagePayloads: [Data]? = nil) {
    rehydrateNativeInlineBlocks(in: textView.textStorage, asyncImagePayloads: asyncImagePayloads)
}
#endif

/// Loads persisted body: strip base64 markers synchronously, decode images on a background task.
@MainActor
fileprivate func assignDocumentBody<Coordinator: InlineImageRehydrateScheduling>(
    to textView: HVTextView,
    body: String,
    coordinator: Coordinator,
    withProgrammaticMutation: (_ work: () -> Void) -> Void
) {
    let payloads = NoteInlineImageSerialization.orderedPayloads(from: body)
    let displayBody = payloads.isEmpty ? body : NoteInlineImageSerialization.stripPayloadMarkersForPlainLoad(body)

    withProgrammaticMutation {
#if os(macOS)
        if let tv = textView as? NSTextView {
            tv.string = displayBody
            tv.textColor = NSColor.labelColor
            tv.font = HarvousFonts.noteComposeBodyPlatformFont()
            applyBodyParagraphStyleToFullStorage(tv)
            rehydrateNativeInlineBlocks(in: tv, asyncImagePayloads: payloads.isEmpty ? nil : [])
        }
#else
        if let tv = textView as? UITextView {
            tv.text = displayBody
            tv.textColor = .label
            applyBodyParagraphStyleToFullStorage(tv)
            rehydrateNativeInlineBlocks(in: tv, asyncImagePayloads: payloads.isEmpty ? nil : [])
        }
#endif
    }

    if !payloads.isEmpty {
        coordinator.scheduleAsyncInlineImageRehydrate(on: textView, payloads: payloads)
    }
}

/// Coordinator types that can schedule deferred inline-image decode (Mac + iOS editors).
@MainActor
protocol InlineImageRehydrateScheduling: AnyObject {
    var noteBindingGeneration: UInt64 { get }
    func withProgrammaticBodyMutation(_ work: () -> Void)
    func scheduleAsyncInlineImageRehydrate(on textView: HVTextView, payloads: [Data])
}

/// Stamps `noteBodyParagraphStyle()` on the entire storage so notes written before the 1.6
/// spacing change pick up the updated line height when loaded.  Called after `textView.string = body`
/// sets plain text (which strips all paragraph-style attributes) and before `rehydrateNativeInlineBlocks`.
#if os(macOS)
@MainActor
private func applyBodyParagraphStyleToFullStorage(_ textView: NSTextView) {
    guard let storage = textView.textStorage, storage.length > 0 else { return }
    storage.addAttribute(.paragraphStyle, value: noteBodyParagraphStyle(),
                         range: NSRange(location: 0, length: storage.length))
}
#else
@MainActor
private func applyBodyParagraphStyleToFullStorage(_ textView: UITextView) {
    let storage = textView.textStorage
    guard storage.length > 0 else { return }
    storage.addAttribute(.paragraphStyle, value: noteBodyParagraphStyle(),
                         range: NSRange(location: 0, length: storage.length))
}
#endif

#if os(macOS)
@MainActor
private func applyDefaultBodyTypingAttributes(to textView: NSTextView) {
    textView.typingAttributes = [
        .font: HarvousFonts.noteComposeBodyPlatformFont(),
        .foregroundColor: NSColor.labelColor,
        .paragraphStyle: noteBodyParagraphStyle(),
    ]
}
#else
@MainActor
private func applyDefaultBodyTypingAttributes(to textView: UITextView) {
    textView.typingAttributes = [
        .font: HarvousFonts.noteComposeBodyPlatformFont(),
        .foregroundColor: UIColor.label,
        .paragraphStyle: noteBodyParagraphStyle(),
    ]
}
#endif

// MARK: - List marker syntax helpers (shared iOS/macOS)

/// Pure helpers for detecting and writing `• ` / `N. ` list prefixes at paragraph starts.
/// Used by the macOS HVTextView class and the iOS UITextViewDelegate alike.
enum HVListSyntax {

    static func listMarkerAttributes() -> [NSAttributedString.Key: Any] {
#if os(macOS)
        return [
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: NSColor.labelColor,
        ]
#else
        return [
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: UIColor.label,
        ]
#endif
    }

    static func bulletPrefixLength(ns: NSString, para: NSRange) -> Int? {
        guard para.length >= 2 else { return nil }
        let bulletScalar: unichar = 0x2022
        if ns.character(at: para.location) == bulletScalar, ns.character(at: para.location + 1) == 32 {
            return 2
        }
        return nil
    }

    static func numberedPrefixLength(ns: NSString, para: NSRange) -> Int? {
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

    /// `1.` … `9999.` immediately before the caret at paragraph start (caret right after `.`).
    static func numberedDigitDotPrefixLength(ns: NSString, paraStart: Int, caret: Int) -> Int? {
        guard caret > paraStart else { return nil }
        let len = caret - paraStart
        guard len >= 2, len <= 6 else { return nil }
        var i = paraStart
        let end = caret
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
        guard i > digitStart, i < end, ns.character(at: i) == 46 else { return nil }
        guard i + 1 == end else { return nil }
        return len
    }

    static func numberedListStartValue(ns: NSString, para: NSRange, prefixLength: Int) -> Int? {
        var acc = 0
        var i = para.location
        let stop = para.location + prefixLength
        while i < stop {
            let c = ns.character(at: i)
            if c >= 48 && c <= 57 {
                acc = acc * 10 + Int(c - 48)
                i += 1
            } else if c == 46 {
                return acc
            } else {
                return nil
            }
        }
        return nil
    }

    /// Rewrites `N. ` prefixes for one contiguous numbered block (blank line or non-numbered paragraph ends the run).
    static func renumberNumberedListRun(storage: NSTextStorage, anchorLocation: Int) {
        let ns = storage.string as NSString
        guard ns.length > 0 else { return }
        let anchor = min(max(0, anchorLocation), ns.length - 1)
        var runStart = ns.paragraphRange(for: NSRange(location: anchor, length: 0)).location
        while runStart > 0 {
            let prevPara = ns.paragraphRange(for: NSRange(location: runStart - 1, length: 0))
            guard numberedPrefixLength(ns: ns, para: prevPara) != nil else { break }
            runStart = prevPara.location
        }
        var segments: [(start: Int, oldLen: Int)] = []
        var loc = runStart
        while loc < ns.length {
            let pr = ns.paragraphRange(for: NSRange(location: loc, length: 0))
            guard let plen = numberedPrefixLength(ns: ns, para: pr) else { break }
            segments.append((pr.location, plen))
            let next = NSMaxRange(pr)
            if next <= loc { break }
            loc = next
        }
        guard segments.count >= 2 else { return }
        for i in stride(from: segments.count - 1, through: 0, by: -1) {
            let newNum = i + 1
            let seg = segments[i]
            let replacement = NSAttributedString(string: "\(newNum). ", attributes: listMarkerAttributes())
            storage.replaceCharacters(in: NSRange(location: seg.start, length: seg.oldLen), with: replacement)
        }
    }
}

// MARK: - Cross-platform wrapper

#if os(macOS)
import AppKit

/// Keeps indents/layout from the saved paragraph but reapplies canonical body line spacing (list hard-newline continuation).
private func mergedParagraphStyleWithCanonicalLineMetrics(_ saved: NSParagraphStyle) -> NSParagraphStyle {
    let m = saved.mutableCopy() as! NSMutableParagraphStyle
    let canonical = noteBodyParagraphStyle()
    m.lineSpacing = canonical.lineSpacing
    return m
}

/// Study highlights finalize on `mouseUp` (or a narrow salvage path) so click-drag selections that start on an
/// underline do not open the dock mid-gesture. **`mouseUp`** can return before NSTextView applies the caret
/// selection for the tracking session; when the first finalize pass fails the selection veto, one main-queue
/// retry runs before clearing the pending gesture.
///
/// Scripture pills fire on **`mouseDown`** (after `super`): deferring pills to `mouseUp` broke single clicks
/// when the editor lives in a SwiftUI `ScrollView` — the first `mouseUp` often never reaches this `NSTextView`,
/// so highlights also register a delayed check + `mouseMoved` release detection to recover the open action when
/// `mouseUp` is swallowed.
/// Boundary keystrokes that may materialize a scripture pill (web prototype parity).
fileprivate enum HarvousScriptureBoundaryTrigger {
    case space, comma, period, enterBeforeNewline
}

private final class HarvousNoteTextView: NSTextView {
    var onScriptureBoundaryTyped: (() -> Void)?

    /// UTF-16 attachment range in storage.
    var pillTapHandler: ((String, String, NSRange) -> Void)?
    /// URL pill tap → mirrors `pillTapHandler` but for `URLLinkPillAttachment`. Args are
    /// `(href, cached title or nil, user-label or nil, attachment UTF-16 range)`. The host is
    /// responsible for presenting the contextual dock; no in-process browser open happens here.
    var urlPillTapHandler: ((String, String?, String?, NSRange) -> Void)?
    /// Tap on an un-saved inline reference suggestion (dotted underline). Args: `(slug, word UTF-16 range)`.
    /// Host saves the reference + opens the Easton's dock (reuses the selection-bar look-up path).
    var referenceSuggestionTapHandler: ((String, NSRange) -> Void)?

    /// Single-click on highlighted prose opens the anchored thread target (pill hits take precedence).
    var onStudyHighlightClick: ((UUID) -> Void)?

    /// Canonical paint list (mirrored from the coordinator) — used as the source of truth for hit testing
    /// instead of reading `.harvousStudyHighlightUUID` off storage, since custom attributes can be flaky
    /// under TextKit 2 and miss at boundary character offsets. Set from `wireStudyHighlightInteractions`.
    var studyHighlightPaints: [StudyHighlightPaint] = []

    /// Coordinator wires this so `activeScripturePill` republishes after a deferred primary-button gesture finishes.
    var onPrimaryMouseGestureEndedForSelectionSync: (() -> Void)?

    /// When non-nil, a study-highlight click is pending until `mouseUp` (see class comment).
    private var pendingStudyHighlightActivation: UUID?
    private var primaryMouseGestureStartPoint: NSPoint = .zero
    private var primaryMouseGestureExceededDragThreshold = false
    /// True when the current primary-button gesture began on a rendered scripture pill rect (strict hit-test).
    private var primaryMouseGestureHitScripturePillRect = false
    /// When `mouseUp` never reaches this view (SwiftUI `ScrollView`), a short delayed + `mouseMoved` path may finalize.
    private var studyHighlightClickSalvageWorkItem: DispatchWorkItem?

    var isDeferringActiveScripturePillFromMouseGesture: Bool { pendingStudyHighlightActivation != nil }

    /// Ensures `mouseMoved` / `cursorUpdate` fire for this view while hovering, not only when it is first responder.
    private var pillHoverTracking: NSTrackingArea?
    /// Avoids spawning duplicate prefetch tasks on every mouse-moved pixel over a pill.
    private var lastScriptureHoverPrefetchKey: String?
    /// UTF-16 range of the pill showing pointer-hover label emphasis (macOS).
    private var scripturePillHoverRange: NSRange?

    private func scripturePillHoverRangesEqual(_ a: NSRange?, _ b: NSRange?) -> Bool {
        switch (a, b) {
        case (nil, nil): return true
        case (nil, _), (_, nil): return false
        case let (x?, y?): return NSEqualRanges(x, y)
        }
    }

    /// Attachment glyph range under the pointer (strict rendered-rect hit-test; matches pill click path).
    private func scripturePillAttachmentRangeContainingPointer(_ viewPoint: NSPoint, storage: NSTextStorage) -> NSRange? {
        scripturePillAtPoint(viewPoint, in: storage)?.1
    }

    private func invalidateScripturePillGlyphDisplay(characterRange range: NSRange) {
        guard let lm = layoutManager else { return }
        let glyphRange = lm.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
        lm.invalidateDisplay(forGlyphRange: glyphRange)
    }

    private func clearScripturePillPointerHoverVisual() {
        guard let storage = textStorage else {
            scripturePillHoverRange = nil
            return
        }
        if let old = scripturePillHoverRange, old.length > 0, old.location < storage.length {
            var eff = NSRange()
            if let pill = storage.attribute(.attachment, at: old.location, effectiveRange: &eff) as? ScripturePillAttachment {
                pill.setPointerHovered(false)
                invalidateScripturePillGlyphDisplay(characterRange: eff)
            }
        }
        scripturePillHoverRange = nil
    }

    /// Call after pill storage is rebuilt so we never retain a stale UTF-16 range.
    func resetScripturePillPointerHoverAfterDocumentMutation() {
        scripturePillHoverRange = nil
    }

    private func syncScripturePillPointerHover(at viewPoint: NSPoint) {
        guard let storage = textStorage, storage.length > 0 else {
            clearScripturePillPointerHoverVisual()
            return
        }
        let newRange = scripturePillAttachmentRangeContainingPointer(viewPoint, storage: storage)
        if scripturePillHoverRangesEqual(scripturePillHoverRange, newRange) { return }

        if let old = scripturePillHoverRange, old.length > 0, old.location < storage.length {
            var eff = NSRange()
            if let pill = storage.attribute(.attachment, at: old.location, effectiveRange: &eff) as? ScripturePillAttachment {
                pill.setPointerHovered(false)
                invalidateScripturePillGlyphDisplay(characterRange: eff)
            }
        }

        scripturePillHoverRange = newRange

        if let nr = newRange, nr.length > 0, nr.location < storage.length {
            var eff = NSRange()
            if let pill = storage.attribute(.attachment, at: nr.location, effectiveRange: &eff) as? ScripturePillAttachment {
                pill.setPointerHovered(true)
                invalidateScripturePillGlyphDisplay(characterRange: eff)
            }
        }
    }

    /// Matches `EditorProxy` list marker font (body size) so toolbar list detection stays consistent.
    private static func noteListMarkerPrefixAttributes() -> [NSAttributedString.Key: Any] {
        [
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: NSColor.labelColor,
        ]
    }

    /// `1.` … `9999.` immediately before a typed space at paragraph start (caret after `.`).
    private static func numberedDigitDotPrefixLength(ns: NSString, paraStart: Int, caret: Int) -> Int? {
        guard caret > paraStart else { return nil }
        let len = caret - paraStart
        guard len >= 2, len <= 6 else { return nil }
        var i = paraStart
        let end = caret
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
        guard i > digitStart, i < end, ns.character(at: i) == 46 else { return nil }
        guard i + 1 == end else { return nil }
        return len
    }

    /// Same rules as `EditorProxy.bulletPrefixLength` / `numberedPrefixLength` (list toolbar + toggles).
    private static func bulletPrefixLength(ns: NSString, para: NSRange) -> Int? {
        guard para.length >= 2 else { return nil }
        let bulletScalar: unichar = 0x2022
        if ns.character(at: para.location) == bulletScalar, ns.character(at: para.location + 1) == 32 {
            return 2
        }
        return nil
    }

    private static func numberedPrefixLength(ns: NSString, para: NSRange) -> Int? {
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

    private static func numberedListStartValue(ns: NSString, para: NSRange, prefixLength: Int) -> Int? {
        var acc = 0
        var i = para.location
        let stop = para.location + prefixLength
        while i < stop {
            let c = ns.character(at: i)
            if c >= 48 && c <= 57 {
                acc = acc * 10 + Int(c - 48)
                i += 1
            } else if c == 46 {
                return acc
            } else {
                return nil
            }
        }
        return nil
    }

    /// Rewrites `N. ` prefixes for one contiguous numbered block (blank line or non-numbered paragraph ends the run).
    /// Applies replacements from the last paragraph toward the first so UTF-16 indices stay valid.
    private static func renumberNumberedListRun(storage: NSTextStorage, anchorLocation: Int) {
        let ns = storage.string as NSString
        guard ns.length > 0 else { return }
        let anchor = min(max(0, anchorLocation), ns.length - 1)
        var runStart = ns.paragraphRange(for: NSRange(location: anchor, length: 0)).location
        while runStart > 0 {
            let prevPara = ns.paragraphRange(for: NSRange(location: runStart - 1, length: 0))
            guard Self.numberedPrefixLength(ns: ns, para: prevPara) != nil else { break }
            runStart = prevPara.location
        }
        var segments: [(start: Int, oldLen: Int)] = []
        var loc = runStart
        while loc < ns.length {
            let pr = ns.paragraphRange(for: NSRange(location: loc, length: 0))
            guard let plen = Self.numberedPrefixLength(ns: ns, para: pr) else { break }
            segments.append((pr.location, plen))
            let next = NSMaxRange(pr)
            if next <= loc { break }
            loc = next
        }
        guard segments.count >= 2 else { return }
        for i in stride(from: segments.count - 1, through: 0, by: -1) {
            let newNum = i + 1
            let seg = segments[i]
            let replacement = NSAttributedString(string: "\(newNum). ", attributes: Self.noteListMarkerPrefixAttributes())
            storage.replaceCharacters(in: NSRange(location: seg.start, length: seg.oldLen), with: replacement)
        }
    }

    /// Return / Option-Return in list body: hard newline + list marker; numbered blocks get a full sequential renumber.
    private func tryApplyListContinuationOnHardNewline(sender: Any?) -> Bool {
        guard let storage = textStorage else { return false }
        let sel = selectedRange()
        guard sel.length == 0 else { return false }
        let loc = sel.location
        let ns = storage.string as NSString
        guard ns.length > 0 else { return false }

        let paraAnchor = min(max(0, loc), ns.length - 1)
        let pr = ns.paragraphRange(for: NSRange(location: paraAnchor, length: 0))
        if storage.attribute(.attachment, at: pr.location, effectiveRange: nil) != nil {
            return false
        }

        let bLen = Self.bulletPrefixLength(ns: ns, para: pr)
        let nLen = Self.numberedPrefixLength(ns: ns, para: pr)
        let prefixLen = bLen ?? nLen
        guard let plen = prefixLen, loc >= pr.location + plen else { return false }

        let savedParaStyle = storage.attribute(.paragraphStyle, at: pr.location, effectiveRange: nil) as? NSParagraphStyle
        let wasNumbered = nLen != nil

        let listInsert: NSAttributedString?
        if bLen != nil {
            listInsert = NSAttributedString(string: "\u{2022} ", attributes: Self.noteListMarkerPrefixAttributes())
        } else if let nln = nLen, let v = Self.numberedListStartValue(ns: ns, para: pr, prefixLength: nln) {
            listInsert = NSAttributedString(string: "\(v + 1). ", attributes: Self.noteListMarkerPrefixAttributes())
        } else {
            listInsert = nil
        }
        guard let insert = listInsert else { return false }

        super.insertNewline(sender)

        let newSel = selectedRange()
        let newLoc = newSel.location
        let live = storage.string as NSString
        guard newLoc <= live.length else { return true }
        let prNew = live.paragraphRange(for: NSRange(location: min(newLoc, max(0, live.length - 1)), length: 0))
        if Self.bulletPrefixLength(ns: live, para: prNew) != nil || Self.numberedPrefixLength(ns: live, para: prNew) != nil {
            return true
        }

        storage.beginEditing()
        storage.insert(insert, at: prNew.location)
        if let ps = savedParaStyle {
            let after = storage.string as NSString
            let fullNew = after.paragraphRange(for: NSRange(location: prNew.location, length: 0))
            storage.addAttribute(.paragraphStyle, value: mergedParagraphStyleWithCanonicalLineMetrics(ps), range: fullNew)
        }
        if wasNumbered {
            Self.renumberNumberedListRun(storage: storage, anchorLocation: prNew.location)
        }
        storage.endEditing()
        didChangeText()
        let finalNs = storage.string as NSString
        guard finalNs.length > 0 else { return true }
        let caretPara = finalNs.paragraphRange(for: NSRange(location: min(prNew.location, finalNs.length - 1), length: 0))
        let prefixUTF16 = Self.bulletPrefixLength(ns: finalNs, para: caretPara)
            ?? Self.numberedPrefixLength(ns: finalNs, para: caretPara)
            ?? insert.length
        let caretPos = min(caretPara.location + prefixUTF16, storage.length)
        setSelectedRange(NSRange(location: caretPos, length: 0))
        return true
    }

    private func notifyScriptureBoundaryTyped() {
        onScriptureBoundaryTyped?()
    }

    private static func scriptureBoundaryTrigger(for insertString: Any) -> HarvousScriptureBoundaryTrigger? {
        if let s = insertString as? String {
            switch s {
            case " ": return .space
            case ",": return .comma
            case ".": return .period
            default: return nil
            }
        }
        if let a = insertString as? NSAttributedString, a.length == 1 {
            return scriptureBoundaryTrigger(for: a.string)
        }
        return nil
    }

    /// Markdown-style list triggers at paragraph start: `- ` / `* ` / `+ ` / `1. ` (space typed to confirm).
    override func insertText(_ insertString: Any, replacementRange: NSRange) {
        if hasMarkedText() {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        if let boundary = Self.scriptureBoundaryTrigger(for: insertString), boundary != .space {
            super.insertText(insertString, replacementRange: replacementRange)
            notifyScriptureBoundaryTyped()
            return
        }

        let isPlainSpace: Bool = {
            if let s = insertString as? String { return s == " " }
            if let a = insertString as? NSAttributedString {
                return a.length == 1 && a.string == " "
            }
            return false
        }()

        if !isPlainSpace {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        guard let storage = textStorage else {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        let sel = selectedRange()
        guard sel.length == 0 else {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        let loc = sel.location
        guard loc > 0, loc <= storage.length else {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        let ns = storage.string as NSString
        let paraRange = ns.paragraphRange(for: NSRange(location: loc - 1, length: 0))
        let p = paraRange.location
        guard loc > p else {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        if storage.attribute(.attachment, at: p, effectiveRange: nil) != nil {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        let prefixLen = loc - p
        let first = ns.character(at: p)
        let bulletScalar: unichar = 0x2022
        if prefixLen >= 2, first == bulletScalar, ns.character(at: p + 1) == 32 {
            super.insertText(insertString, replacementRange: replacementRange)
            return
        }

        if prefixLen == 1 {
            let c = first
            if c == 45 || c == 42 || c == 43 {
                let bullet = NSAttributedString(string: "\u{2022} ", attributes: Self.noteListMarkerPrefixAttributes())
                storage.beginEditing()
                storage.replaceCharacters(in: NSRange(location: p, length: 1), with: bullet)
                storage.endEditing()
                didChangeText()
                setSelectedRange(NSRange(location: p + bullet.length, length: 0))
                return
            }
        }

        if let dotLen = Self.numberedDigitDotPrefixLength(ns: ns, paraStart: p, caret: loc) {
            let digitsDot = ns.substring(with: NSRange(location: p, length: dotLen))
            let replacement = NSAttributedString(string: digitsDot + " ", attributes: Self.noteListMarkerPrefixAttributes())
            storage.beginEditing()
            storage.replaceCharacters(in: NSRange(location: p, length: dotLen), with: replacement)
            storage.endEditing()
            didChangeText()
            setSelectedRange(NSRange(location: p + replacement.length, length: 0))
            return
        }

        super.insertText(insertString, replacementRange: replacementRange)
        notifyScriptureBoundaryTyped()
    }

    /// After Return, new paragraphs inherit `• ` / `N+1. ` when the caret was in list body (not inside the prefix).
    override func insertNewline(_ sender: Any?) {
        if hasMarkedText() {
            super.insertNewline(sender)
            return
        }
        if tryApplyListContinuationOnHardNewline(sender: sender) { return }
        notifyScriptureBoundaryTyped()
        super.insertNewline(sender)
    }

    /// Option-Return uses the same hard break + list continuation as Return (standard in many note apps).
    override func insertLineBreak(_ sender: Any?) {
        if hasMarkedText() {
            super.insertLineBreak(sender)
            return
        }
        if tryApplyListContinuationOnHardNewline(sender: sender) { return }
        super.insertLineBreak(sender)
    }

    /// Match note body styling; rich HTML/RTF from the pasteboard should not override font or colors.
    override func paste(_ sender: Any?) {
        let pb = NSPasteboard.general
        let trimmed = (pb.string(forType: .string) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty, pb.canReadObject(forClasses: [NSImage.self], options: nil) {
            super.paste(sender)
            return
        }
        pasteAsPlainText(sender)
    }

    /// Hit-test a view-local point against painted highlight rects only (no scripture-pill suppression).
    /// Used for mouse clicks after strict pill-rect hit-testing, so highlighted text beside a pill is not
    /// lost to the ±1 “near pill” heuristic in `isPointOverScripturePill`.
    private func studyHighlightUUIDFromPaints(atViewPoint point: NSPoint) -> UUID? {
        guard let storage = textStorage, storage.length > 0, let win = window else { return nil }
        for paint in studyHighlightPaints {
            let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: paint.expandedUTF16Range, in: storage)
            for r in storRanges {
                guard r.location != NSNotFound, NSMaxRange(r) <= storage.length else { continue }
                var actual = NSRange()
                let screenRect = firstRect(forCharacterRange: r, actualRange: &actual)
                guard screenRect != .zero else { continue }
                let viewRect = convert(win.convertFromScreen(screenRect), from: nil)
                // Pad by a few points vertically so clicks on descenders / the underline itself still hit.
                let padded = viewRect.insetBy(dx: -2, dy: -3)
                if padded.contains(point) { return paint.threadId }
            }
        }
        return nil
    }

    /// Rect hit-test for an inline reference suggestion run at `point` (mirrors `studyHighlightUUIDFromPaints`).
    private func referenceSuggestionAtViewPoint(_ point: NSPoint) -> (slug: String, range: NSRange)? {
        guard let storage = textStorage, storage.length > 0, let win = window else { return nil }
        var hit: (slug: String, range: NSRange)?
        storage.enumerateAttribute(.harvousReferenceSuggestion, in: NSRange(location: 0, length: storage.length), options: []) { value, range, stop in
            guard let slug = value as? String else { return }
            var actual = NSRange()
            let screenRect = firstRect(forCharacterRange: range, actualRange: &actual)
            guard screenRect != .zero else { return }
            let viewRect = convert(win.convertFromScreen(screenRect), from: nil)
            if viewRect.insetBy(dx: -2, dy: -3).contains(point) {
                hit = (slug, range)
                stop.pointee = true
            }
        }
        return hit
    }

    /// True when the caret or selection plausibly reflects a click on `pendingUUID`’s painted ranges — avoids
    /// vetoing activation on multi-scalar boundaries while still blocking e.g. triple-click paragraph selects that spill past the highlight.
    private func selectionQualifiesForStudyHighlightActivation(pendingUUID: UUID) -> Bool {
        let sel = selectedRange()
        guard let storage = textStorage else { return sel.length <= 1 }
        guard let paint = studyHighlightPaints.first(where: { $0.threadId == pendingUUID }) else {
            return sel.length <= 0 || sel.length == 1
        }
        let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: paint.expandedUTF16Range, in: storage)
        guard !storRanges.isEmpty else { return sel.length <= 0 || sel.length == 1 }
        var lo = Int.max
        var hi = 0
        for r in storRanges {
            guard r.location != NSNotFound, NSMaxRange(r) <= storage.length else { continue }
            lo = min(lo, r.location)
            hi = max(hi, NSMaxRange(r))
        }
        guard lo != Int.max, hi > lo else { return sel.length <= 0 || sel.length == 1 }
        let union = NSRange(location: lo, length: hi - lo)
        if sel.length == 0 {
            return sel.location >= union.location && sel.location <= NSMaxRange(union)
        }
        return NSMaxRange(sel) <= NSMaxRange(union) && sel.location >= union.location
    }

    private func scheduleStudyHighlightClickSalvageIfNeeded() {
        studyHighlightClickSalvageWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.trySalvagePendingStudyHighlightClickAfterLostMouseUp()
        }
        studyHighlightClickSalvageWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.045, execute: work)
    }

    /// Finalize a pending highlight click when `mouseUp` is missing but the button is up and the gesture was not a drag.
    private func trySalvagePendingStudyHighlightClickAfterLostMouseUp() {
        guard pendingStudyHighlightActivation != nil else { return }
        guard !primaryMouseGestureExceededDragThreshold else { return }
        guard NSEvent.pressedMouseButtons & 1 == 0 else { return }
        if finalizePendingStudyHighlightClickIfEligible() {
            onPrimaryMouseGestureEndedForSelectionSync?()
        }
    }

    private enum StudyHighlightFinalizeAttempt {
        /// Standard `-mouseUp` / salvage timing (selection often not committed until end of tracking).
        case immediate
        /// One main-queue retry — NSTextView can apply the click’s caret/selection *after* `-mouseUp` returns.
        case deferredRetry
    }

    @discardableResult
    private func finalizePendingStudyHighlightClickIfEligible(attempt: StudyHighlightFinalizeAttempt = .immediate)
        -> Bool {
        guard let uuid = pendingStudyHighlightActivation else { return false }
        if primaryMouseGestureExceededDragThreshold {
            studyHighlightClickSalvageWorkItem?.cancel()
            pendingStudyHighlightActivation = nil
            primaryMouseGestureExceededDragThreshold = false
            return false
        }
        guard selectionQualifiesForStudyHighlightActivation(pendingUUID: uuid) else {
            switch attempt {
            case .immediate:
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.pendingStudyHighlightActivation == uuid else { return }
                    _ = self.finalizePendingStudyHighlightClickIfEligible(attempt: .deferredRetry)
                }
                return false
            case .deferredRetry:
                studyHighlightClickSalvageWorkItem?.cancel()
                pendingStudyHighlightActivation = nil
                primaryMouseGestureExceededDragThreshold = false
                return false
            }
        }
        studyHighlightClickSalvageWorkItem?.cancel()
        pendingStudyHighlightActivation = nil
        primaryMouseGestureExceededDragThreshold = false
        onStudyHighlightClick?(uuid)
        return true
    }

    override func mouseDown(with event: NSEvent) {
        studyHighlightClickSalvageWorkItem?.cancel()
        studyHighlightClickSalvageWorkItem = nil
        pendingStudyHighlightActivation = nil
        primaryMouseGestureExceededDragThreshold = false
        primaryMouseGestureHitScripturePillRect = false

        guard event.clickCount == 1,
              let storage = textStorage,
              storage.length > 0
        else {
            super.mouseDown(with: event)
            return
        }
        let point = convert(event.locationInWindow, from: nil)
        primaryMouseGestureStartPoint = point

        // Direct rect hit-test against rendered pill bounds — more reliable than
        // characterIndex for clicks that land in the pill image below the baseline.
        if let (pill, eff) = scripturePillAtPoint(point, in: storage) {
            primaryMouseGestureHitScripturePillRect = true
            super.mouseDown(with: event)
            pillTapHandler?(pill.reference, pill.translation, eff)
            return
        }

        // URL pill — invoke the host's tap handler so it can open the inline `ActiveURLPillDock`
        // (Open / Remove / Edit actions). The dock owns the "open in browser" action, mirroring how
        // scripture pills go through the host (`pillTapHandler`) instead of acting locally.
        if let (urlPill, eff) = urlLinkPillAtPoint(point, in: storage) {
            super.mouseDown(with: event)
            urlPillTapHandler?(urlPill.href, urlPill.title, urlPill.label, eff)
            return
        }

        // Inline reference suggestion (dotted underline) — tap saves the reference + opens the dock.
        if let (slug, range) = referenceSuggestionAtViewPoint(point) {
            super.mouseDown(with: event)
            referenceSuggestionTapHandler?(slug, range)
            return
        }

        // Study highlights — rect hit test only (`studyHighlightUUIDFromPaints`); pill rects were handled above.
        if let uuid = studyHighlightUUIDFromPaints(atViewPoint: point) {
            pendingStudyHighlightActivation = uuid
            scheduleStudyHighlightClickSalvageIfNeeded()
            super.mouseDown(with: event)
            return
        }

        super.mouseDown(with: event)
    }

    override func mouseDragged(with event: NSEvent) {
        super.mouseDragged(with: event)
        guard pendingStudyHighlightActivation != nil else { return }
        let p = convert(event.locationInWindow, from: nil)
        let q = primaryMouseGestureStartPoint
        if hypot(p.x - q.x, p.y - q.y) > 4 {
            primaryMouseGestureExceededDragThreshold = true
            studyHighlightClickSalvageWorkItem?.cancel()
            studyHighlightClickSalvageWorkItem = nil
        }
    }

    override func mouseUp(with event: NSEvent) {
        super.mouseUp(with: event)
        guard event.buttonNumber == 0 else { return }

        _ = finalizePendingStudyHighlightClickIfEligible()
        normalizeTrailingScripturePillCaretAfterNonPillClick()
        if !primaryMouseGestureHitScripturePillRect, !primaryMouseGestureExceededDragThreshold {
            DispatchQueue.main.async { [weak self] in
                self?.normalizeTrailingScripturePillCaretAfterNonPillClick()
            }
        }
        onPrimaryMouseGestureEndedForSelectionSync?()
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    /// When a click misses the pill graphic but NSTextView snaps the caret onto the trailing
    /// attachment glyph, move the insertion point to `storage.length` so typing continues after the pill.
    @discardableResult
    private func normalizeTrailingScripturePillCaretAfterNonPillClick() -> Bool {
        guard !primaryMouseGestureHitScripturePillRect,
              !primaryMouseGestureExceededDragThreshold,
              pendingStudyHighlightActivation == nil,
              let storage = textStorage else { return false }
        let len = storage.length
        guard len > 0 else { return false }

        let sel = selectedRange()
        var pillRange: NSRange?
        if sel.length == 1 {
            var eff = NSRange()
            if storage.attribute(.attachment, at: sel.location, effectiveRange: &eff) is ScripturePillAttachment {
                pillRange = eff
            }
        } else if sel.length == 0, sel.location < len {
            var eff = NSRange()
            if storage.attribute(.attachment, at: sel.location, effectiveRange: &eff) is ScripturePillAttachment {
                pillRange = eff
            }
        }
        guard let eff = pillRange, NSMaxRange(eff) == len else { return false }
        setSelectedRange(NSRange(location: len, length: 0))
        return true
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

    /// Returns the URL pill whose rendered rect contains `point` (view-local coords).
    /// Same hit-testing strategy as `scripturePillAtPoint`.
    private func urlLinkPillAtPoint(_ point: NSPoint, in storage: NSTextStorage) -> (URLLinkPillAttachment, NSRange)? {
        guard let win = window else { return nil }
        let end = storage.length
        var idx = 0
        while idx < end {
            var eff = NSRange()
            let val = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
            if let pill = val as? URLLinkPillAttachment {
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

    /// True when the pointer is over a rendered scripture pill (strict rect hit-test; matches click path).
    private func isPointOverScripturePill(_ pointInView: NSPoint) -> Bool {
        guard let storage = textStorage, storage.length > 0 else { return false }
        return scripturePillAtPoint(pointInView, in: storage) != nil
    }

    private func scripturePillUnderHoverPointer(_ viewPoint: NSPoint, storage: NSTextStorage) -> ScripturePillAttachment? {
        scripturePillAtPoint(viewPoint, in: storage)?.0
    }

    private func prefetchPassageHoverIfNeeded(viewPoint: NSPoint) {
        guard let storage = textStorage, storage.length > 0 else { return }
        guard let pill = scripturePillUnderHoverPointer(viewPoint, storage: storage) else {
            lastScriptureHoverPrefetchKey = nil
            return
        }
        let token = pill.reference + "|" + pill.translation
        guard token != lastScriptureHoverPrefetchKey else { return }
        lastScriptureHoverPrefetchKey = token
        let ref = pill.reference
        let trans = pill.translation
        Task { await ScripturePassageCache.shared.prefetch(reference: ref, translation: trans) }
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
        let point = convert(event.locationInWindow, from: nil)
        syncScripturePillPointerHover(at: point)
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        applyPillCursorAfterSuper(for: event)
        let point = convert(event.locationInWindow, from: nil)
        prefetchPassageHoverIfNeeded(viewPoint: point)
        syncScripturePillPointerHover(at: point)
        if pendingStudyHighlightActivation != nil {
            trySalvagePendingStudyHighlightClickAfterLostMouseUp()
        }
    }

    override func mouseExited(with event: NSEvent) {
        clearScripturePillPointerHoverVisual()
        super.mouseExited(with: event)
        lastScriptureHoverPrefetchKey = nil
    }

    override func scrollWheel(with event: NSEvent) {
        super.scrollWheel(with: event)
        applyPillCursorAfterSuper(for: event)
        let point = convert(event.locationInWindow, from: nil)
        syncScripturePillPointerHover(at: point)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let pillHoverTracking {
            removeTrackingArea(pillHoverTracking)
        }
        let opts: NSTrackingArea.Options = [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect, .cursorUpdate]
        let area = NSTrackingArea(rect: bounds, options: opts, owner: self, userInfo: nil)
        addTrackingArea(area)
        pillHoverTracking = area
    }

    /// Clips the insertion-point caret to natural glyph height so the inter-line gap
    /// added by `HarvousLayoutManager` doesn't produce an oversized cursor bar.
    override func drawInsertionPoint(in rect: NSRect, color: NSColor, turnedOn flag: Bool) {
        guard let storage = textStorage, storage.length > 0 else {
            super.drawInsertionPoint(in: rect, color: color, turnedOn: flag)
            return
        }
        let loc = min(selectedRange().location, storage.length - 1)
        let font = storage.attribute(.font, at: max(0, loc), effectiveRange: nil) as? NSFont
            ?? HarvousFonts.noteComposeBodyPlatformFont()
        let natural = ceil(font.ascender - font.descender + font.leading)
        var r = rect
        r.size.height = min(rect.size.height, natural)
        super.drawInsertionPoint(in: r, color: color, turnedOn: flag)
    }

    /// `ScripturePillAttachment.image` is a pre-rasterized `NSImage` with `NSColor.labelColor`
    /// (and the inner-edge wash) baked in at attachment-creation time, so a light↔dark toggle
    /// leaves the previous-mode label color stuck on screen until storage is rebuilt. Re-render
    /// every pill against the new effective appearance and invalidate their glyph rects.
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        refreshScripturePillRastersForCurrentAppearance()
    }

    fileprivate func refreshScripturePillRastersForCurrentAppearance() {
        guard let storage = textStorage, storage.length > 0 else { return }
        var idx = 0
        let end = storage.length
        while idx < end {
            var eff = NSRange()
            let value = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
            if let pill = value as? ScripturePillAttachment {
                pill.refreshRasterForCurrentAppearance()
                invalidateScripturePillGlyphDisplay(characterRange: eff)
            } else if let urlPill = value as? URLLinkPillAttachment {
                urlPill.refreshRasterForCurrentAppearance()
                invalidateScripturePillGlyphDisplay(characterRange: eff)
            }
            let next = NSMaxRange(eff)
            if next <= idx { break }
            idx = next
        }
    }
}

/// UTF-16 ranges of `ScripturePillAttachment` glyphs intersecting a proposed edit range.
private func harvousPillAttachmentRangesIntersecting(_ affected: NSRange, in storage: NSTextStorage) -> [NSRange] {
    var result: [NSRange] = []
    guard storage.length > 0, affected.location != NSNotFound else { return result }
    let maxLen = storage.length
    if affected.location > maxLen { return result }
    let safeLen = min(affected.length, maxLen - affected.location)
    let safeAffected = NSRange(location: affected.location, length: safeLen)

    var idx = 0
    while idx < storage.length {
        var eff = NSRange()
        let val = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
        if val is ScripturePillAttachment, NSIntersectionRange(eff, safeAffected).length > 0 {
            result.append(eff)
        }
        let next = NSMaxRange(eff)
        if next <= idx { break }
        idx = next
    }
    return result
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

final class HarvousEditorScrollView: NSScrollView {
    /// Coalesces rapid invalidations into one deferred measurement pass.
    private var bodyHeightPublishCoalesced = false

    override func scrollWheel(with event: NSEvent) {
        nextResponder?.scrollWheel(with: event)
    }

    /// Height is driven by SwiftUI via `EditorProxy.macBodyLayoutHeight`. Returning no intrinsic metrics
    /// avoids `layoutManager.ensureLayout` during AppKit intrinsic sizing (nested SwiftUI `ScrollView` +
    /// `NSScrollView` caused `_NSDetectedLayoutRecursion` when switching notes).
    override var intrinsicContentSize: NSSize {
        NSSize(width: NSView.noIntrinsicMetric, height: NSView.noIntrinsicMetric)
    }

    /// Measures TextKit after layout and updates `EditorProxy` for `.frame(height:)` in SwiftUI.
    /// Instruments note-switch hangs: Time Profiler → main thread → `NSLayoutManager`, `NSTextView`, `layoutSubtreeIfNeeded`.
    func publishBodyLayoutHeight(to proxy: EditorProxy?) {
        guard let tv = documentView as? NSTextView,
              let lm = tv.layoutManager,
              let tc = tv.textContainer else {
            proxy?.updateMacBodyLayoutHeightIfNeeded(400)
            return
        }
        lm.ensureLayout(for: tc)
        let used = lm.usedRect(for: tc)
        let inset = tv.textContainerInset.height
        let h = ceil(used.height + inset * 2 + 16)
        proxy?.updateMacBodyLayoutHeightIfNeeded(h)
    }

    /// Coalesces rapid invalidations; uses an extra main-queue yield before `ensureLayout` so pills/highlights/SwiftUI layout finish first (reduces stalls when switching notes).
    func scheduleBodyLayoutHeightPublish(to proxy: EditorProxy?) {
        guard !bodyHeightPublishCoalesced else { return }
        bodyHeightPublishCoalesced = true
        DispatchQueue.main.async { [weak self] in
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.bodyHeightPublishCoalesced = false
                self.publishBodyLayoutHeight(to: proxy)
            }
        }
    }
}

struct HarvousEditor: NSViewRepresentable {
    var state: EditorState
    /// Read-only body. Selection, scripture pills, and highlights all stay live —
    /// only typing is off. Used for shared-space notes open for co-editing, which
    /// this client can read but never write (see HarvousSyncService.flushNoteUpdate).
    var isEditable: Bool = true
    var proxy: EditorProxy? = nil
    /// When set, a change forces body text to match `state` (e.g. switching notes while the view is still “editing”).
    var noteID: UUID? = nil
    /// Persisted body for the selected note. Use this when `noteID` changes, not `state` alone: `@State` can lag one frame and would load the previous note’s text.
    var documentBody: String = ""
    var placeholder: String = "What are you studying?"
    var font: NSFont = HarvousFonts.noteComposeBodyPlatformFont()
    /// Space accent for inline scripture pills (see `Space.scriptureThemeRaw` / `SpaceStore.scriptureTheme`).
    var scriptureTheme: HarvousColors.ThemeVariant = .blue
    /// Inline study highlights keyed to expanded-plain UTF‑16 anchors (applied after scripture pills hydrate).
    var studyHighlightPaints: [StudyHighlightPaint] = []
    /// When non-nil, only this thread keeps full accent underlines; others paint grayscale (highlight dock focus).
    var studyHighlightFocusedThreadId: UUID? = nil
    /// When true, pastel highlight paints use the dark-appearance palette (`NSColor`/UIColor alpha tuned).
    var studyHighlightsAssumeDarkAppearance: Bool = false
    var onScripturePillTap: ((String, String, NSRange) -> Void)? = nil
    /// URL pill tap callback. Args: `(href, cached title or nil, user-label or nil, attachment UTF-16 range)`.
    /// Host opens the inline `ActiveURLPillDock`; no browser navigation happens inside the editor.
    var onURLPillTap: ((String, String?, String?, NSRange) -> Void)? = nil
    /// Tap on an inline reference suggestion (dotted hint). Args: `(slug, word UTF-16 range)`.
    var onReferenceSuggestionTap: ((String, NSRange) -> Void)? = nil
    /// Fires after scripture pills are (re-)materialized from plain text (`detectAndInsertPills`), for prefetch/network warm.
    var onResolvedScripturePillPairs: (([(reference: String, translation: String)]) -> Void)? = nil
    /// Resolves the user-picked scripture pill accent for a given reference (persisted on the owning Note).
    /// `nil` return → pill renders with the neutral default palette. Called during pill insertion.
    var pillAccentResolver: ((String) -> StudyHighlightAccentToken?)? = nil
    /// macOS single-click opens the anchored highlight target (`HarvousStudyHighlightMapper` spans).
    var onStudyHighlightClick: ((UUID) -> Void)? = nil
    /// Deletes anchored `StudyThread` rows whose underline intersects the current body selection (see `HarvousStudyHighlightMapper.threadIdsIntersectingBodySelection`).
    var onRemoveStudyHighlightThreadIds: (([UUID]) -> Void)? = nil
    /// Propagates SwiftUI Dynamic Type so `NSTextView` fonts track system text sizing.
    var dynamicTypeSize: DynamicTypeSize = .large

    func makeCoordinator() -> Coordinator { Coordinator(state: state) }

    @MainActor
    private func syncComposeTypographyForDynamicTypeIfNeeded(in textView: HarvousNoteTextView, context: Context) {
        if context.coordinator.lastDynamicTypeSize != dynamicTypeSize {
            context.coordinator.lastDynamicTypeSize = dynamicTypeSize
            context.coordinator.refreshComposeBodyTypography()
        }
    }

    @MainActor
    func makeNSView(context: Context) -> HarvousEditorScrollView {
        let scrollView = HarvousEditorScrollView()
        // Build an explicit TextKit 1 stack so HarvousLayoutManager owns drawing (selection,
        // underlines).  The default NSTextView.scrollableTextView() stack uses a plain
        // NSLayoutManager that cannot be replaced after the view is created.
        let storage = NSTextStorage()
        let lm = HarvousLayoutManager()
        storage.addLayoutManager(lm)
        let container = NSTextContainer(containerSize: NSSize(width: CGFloat.greatestFiniteMagnitude,
                                                              height: CGFloat.greatestFiniteMagnitude))
        lm.addTextContainer(container)
        let textView = HarvousNoteTextView(frame: .zero, textContainer: container)
        scrollView.documentView = textView
        textView.pillTapHandler = onScripturePillTap
        textView.urlPillTapHandler = onURLPillTap
        textView.referenceSuggestionTapHandler = onReferenceSuggestionTap
        wireStudyHighlightInteractions(textView: textView)
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
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: para
        ]

        textView.isRichText = true       // rich text so formatting attributes stick
        textView.font = font
        textView.textColor = NSColor.labelColor
        textView.drawsBackground = false
        textView.backgroundColor = .clear
        textView.isEditable = isEditable
        textView.isSelectable = true
        textView.allowsUndo = true
        textView.isContinuousSpellCheckingEnabled = false
        textView.isGrammarCheckingEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = true
        // Inline predictions (gray ghost words) race with our debounced `NSTextStorage` pill rewrites and can
        // crash or hang TextKit (`EXC_BAD_ACCESS` in `swift_getObjectType` while prediction UI is visible).
        textView.inlinePredictionType = .no
        // Writing Tools coordinates extra TextKit containers; with a custom `NSLayoutManager` stack
        // it can spam "containerToPush is nil…" and stall when the first responder / document changes
        // rapidly (e.g. switching notes). Inline spell/grammar underlines are off above; correction as
        // you type stays on via `isAutomaticSpellingCorrectionEnabled`.
        if #available(macOS 15.0, *) {
            textView.writingToolsBehavior = .none
        }
        // Horizontal inset comes from SwiftUI padding; keep TextKit leading flush with title TextField.
        textView.textContainerInset = NSSize(width: 0, height: 8)
        if let tc = textView.textContainer {
            tc.widthTracksTextView = true
            tc.heightTracksTextView = false
            // Keep body text start exactly aligned with the title field.
            tc.lineFragmentPadding = 0
        }
        textView.delegate = context.coordinator
        context.coordinator.textView = textView
        context.coordinator.proxy = proxy
        context.coordinator.placeholderText = placeholder
        let coordinatorRef = context.coordinator
        textView.onPrimaryMouseGestureEndedForSelectionSync = { [weak coordinatorRef] in
            coordinatorRef?.syncActiveScripturePillFromTextViewSelection()
        }
        textView.onScriptureBoundaryTyped = { [weak coordinatorRef] in
            coordinatorRef?.handleScriptureBoundaryTyped()
        }
        proxy?.textView = textView   // wire proxy for toolbar actions
        context.coordinator.wireFormatBarToProxy(proxy)
        if let p = proxy {
            let coord = context.coordinator
            p.scripturePillDeletionConfirmHandler = { [weak coord] in
                coord?.applyConfirmedScripturePillDeletion()
            }
        }

        // Placeholder
        if state.plainText.isEmpty {
            textView.string = ""
            context.coordinator.showPlaceholder(in: textView, text: placeholder)
        }

        scrollView.scheduleBodyLayoutHeightPublish(to: proxy)
        return scrollView
    }

    @MainActor
    func updateNSView(_ scrollView: HarvousEditorScrollView, context: Context) {
        let textView = scrollView.documentView as! HarvousNoteTextView
        // `EditorState` is now a reference type; re-point the coordinator to the current instance so a
        // note-switch `editorState = EditorState(...)` reassignment can't leave it writing into a stale
        // object (the previous `@Binding` always read through to the live `@State`).
        context.coordinator.state = state
        // Editability changes while the view is alive (a note is opened for
        // co-editing, or closed again), so it has to be re-applied here, not only
        // at construction.
        if textView.isEditable != isEditable { textView.isEditable = isEditable }
        syncComposeTypographyForDynamicTypeIfNeeded(in: textView, context: context)
        let previousTheme = context.coordinator.scriptureTheme
        context.coordinator.scriptureTheme = scriptureTheme
        let themeChanged = previousTheme != scriptureTheme
        context.coordinator.studyHighlightPaints = studyHighlightPaints
        context.coordinator.studyHighlightFocusedThreadId = studyHighlightFocusedThreadId
        context.coordinator.studyHighlightsAssumeDarkAppearance = studyHighlightsAssumeDarkAppearance
        context.coordinator.pillAccentResolver = pillAccentResolver
        context.coordinator.onResolvedScripturePillPairs = onResolvedScripturePillPairs
        context.coordinator.onRemoveStudyHighlightThreadIds = onRemoveStudyHighlightThreadIds

        textView.pillTapHandler = onScripturePillTap
        textView.urlPillTapHandler = onURLPillTap
        textView.referenceSuggestionTapHandler = onReferenceSuggestionTap
        wireStudyHighlightInteractions(textView: textView)
        context.coordinator.proxy = proxy
        context.coordinator.wireFormatBarToProxy(proxy)
        let coordinatorRef = context.coordinator
        textView.onPrimaryMouseGestureEndedForSelectionSync = { [weak coordinatorRef] in
            coordinatorRef?.syncActiveScripturePillFromTextViewSelection()
        }
        textView.onScriptureBoundaryTyped = { [weak coordinatorRef] in
            coordinatorRef?.handleScriptureBoundaryTyped()
        }
        let coord = context.coordinator
        if let p = proxy {
            p.syncPlainTextBindingFromTextView = { tv in
                coord.pushPlainTextAndRefsFromTextView(tv)
            }
            p.scripturePillDeletionConfirmHandler = { [weak coord] in
                coord?.applyConfirmedScripturePillDeletion()
            }
        }

        var didSyncBodyFromState = false

        if let noteID, context.coordinator.boundNoteID != noteID {
            let currentPlain = textView.textStorage.map { harvousExpandedPlainText(in: $0) } ?? documentBody
            let bodyUnchanged = documentBody == currentPlain
            context.coordinator.boundNoteID = noteID
            if bodyUnchanged {
                return
            }
            context.coordinator.invalidateDeferredNoteBindingWork()
            context.coordinator.isEditing = false
            proxy?.isActivelyEditingBody = false
            context.coordinator.suppressFormatBarOnNextBodyCaretUpdate = true
            // Load plain/serialized body synchronously so the view has correct text immediately.
            syncTextViewToDocumentBody(textView, body: documentBody, context: context)
            let capturedNoteID = noteID
            let bodyForDeferredPills = documentBody
            let coordinator = context.coordinator
            let proxyForAsync = proxy
            // Scripture pill reapply + highlight painting + intrinsic height can run a lot of TextKit layout.
            // Doing that inside `updateNSView` kept re-entering AppKit layout and blocked note switching.
            // Split across main-queue hops so work does not stack in one turn with SwiftUI layout.
            DispatchQueue.main.async { [weak scrollView] in
                guard let scrollView else { return }
                guard let tv = scrollView.documentView as? HarvousNoteTextView else { return }
                guard coordinator.boundNoteID == capturedNoteID else { return }
                if let p = proxyForAsync {
                    p.resetFormatBarStateForNewNote()
                    p.syncBodyFirstResponderState(textView: tv)
                }
                if !bodyForDeferredPills.isEmpty {
                    // Hop 2 owns paintStudyHighlights — skip the redundant pass here.
                    coordinator.reapplyScripturePillsToBody(in: tv, paintHighlights: false)
                }
                DispatchQueue.main.async { [weak scrollView] in
                    guard let scrollView else { return }
                    guard let tv2 = scrollView.documentView as? HarvousNoteTextView else { return }
                    guard coordinator.boundNoteID == capturedNoteID else { return }
                    coordinator.paintStudyHighlightsIfNeeded(on: tv2, force: true)
                    coordinator.applyReferenceSuggestionsIfNeeded(on: tv2, force: true)
                    DispatchQueue.main.async { [weak scrollView] in
                        guard let scrollView else { return }
                        guard coordinator.boundNoteID == capturedNoteID else { return }
                        scrollView.scheduleBodyLayoutHeightPublish(to: proxyForAsync)
                    }
                }
            }
            // Do not set `isEditing` from “body still first responder” here: it made `textViewDidChangeSelection`
            // think the user was already editing and showed the format bar on layout.
            return
        }

        // Active typing: the user owns the buffer, so nothing external needs syncing here. Bail before
        // the per-keystroke O(n) work below (`pillContentKey` concat, `\u{FFFC}` storage scan, expanded
        // -plain compare) that produced caret lag on long / pill-heavy notes. A live theme toggle is the
        // only mutation that must still reach storage while editing; `textDidEndEditing` reconciles
        // detection + highlights on blur.
        if context.coordinator.isEditing {
            if themeChanged, let st = textView.textStorage, st.length > 0 {
                let plain = harvousExpandedPlainText(in: st)
                if st.string.contains("\u{FFFC}") || !ScriptureDetector.detect(in: plain).isEmpty {
                    context.coordinator.reapplyScripturePillsToBody(in: textView)
                }
            }
            return
        }

        // Only update if the source of truth changed externally (not from the user typing).
        // After a note switch, `state` can still hold the previous note until `syncFromNote` runs; the
        // text view was already loaded from `documentBody`. Do not clobber with stale binding text.
        // Cap pill reapply to once per (body, theme) for the current note binding. Without this, a
        // web-originated note whose saved body lacks the inline pill translation (the translation is
        // metadata, not body text) never reaches a fixpoint: `harvousExpandedPlainText` appends
        // " <translation>", so the expanded storage permanently differs from `state`/`documentBody`,
        // and every `updateNSView` re-runs strip→reapply → 100%-CPU spin. Reapply genuinely only needs
        // to run once per loaded content; bounding it here ends the loop regardless of the round-trip
        // mismatch. The key is reset on note switch (`invalidateDeferredNoteBindingWork`).
        let pillContentKey = documentBody + "|" + String(describing: scriptureTheme)
        let storageHasPills = textView.textStorage?.string.contains("\u{FFFC}") ?? false
        let pillContentAlreadySettled =
            context.coordinator.lastSettledPillContentKey == pillContentKey && storageHasPills

        if !context.coordinator.isEditing, !pillContentAlreadySettled,
           let st = textView.textStorage {
            let plainStorage = harvousExpandedPlainText(in: st)
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

        if !context.coordinator.isEditing, !pillContentAlreadySettled,
           !state.plainText.isEmpty, let st = textView.textStorage {
            if didSyncBodyFromState {
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            } else if !st.string.contains("\u{FFFC}"), !ScriptureDetector.detect(in: st.string).isEmpty {
                // Same plain `body` and `state` (no sync) but pills never applied, e.g. first layout.
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            }
            // Mark this content settled so the strip→reapply cycle cannot re-enter for the same body+theme.
            context.coordinator.lastSettledPillContentKey = pillContentKey
        }

        if themeChanged, let st = textView.textStorage, st.length > 0 {
            let plain = harvousExpandedPlainText(in: st)
            if st.string.contains("\u{FFFC}") || !ScriptureDetector.detect(in: plain).isEmpty {
                context.coordinator.reapplyScripturePillsToBody(in: textView)
            }
        }
        if !context.coordinator.isEditing {
            context.coordinator.paintStudyHighlightsIfNeeded(on: textView)
            context.coordinator.applyReferenceSuggestionsIfNeeded(on: textView)
        }
        if !context.coordinator.isEditing {
            scrollView.scheduleBodyLayoutHeightPublish(to: proxy)
        }
    }

    @MainActor
    private func wireStudyHighlightInteractions(textView: HarvousNoteTextView) {
        let clickHandler = onStudyHighlightClick
        let proxyRef = proxy
        textView.studyHighlightPaints = studyHighlightPaints
        textView.onStudyHighlightClick = { [weak textView] uuid in
            // Capture the highlight's viewport rect so NoteEditorView can anchor the popup.
            if let tv = textView, let storage = tv.textStorage, let win = tv.window {
                if let paint = tv.studyHighlightPaints.first(where: { $0.threadId == uuid }) {
                    let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: paint.expandedUTF16Range, in: storage)
                    if let r = storRanges.first(where: { $0.location != NSNotFound && NSMaxRange($0) <= storage.length }) {
                        var actual = NSRange()
                        let screenRect = tv.firstRect(forCharacterRange: r, actualRange: &actual)
                        if screenRect != .zero {
                            proxyRef?.tappedHighlightViewportRect = tv.convert(win.convertFromScreen(screenRect), from: nil)
                        }
                    }
                }
            }
            clickHandler?(uuid)
        }
    }

    /// Replace the text view contents from `state` (plain string + placeholder when empty).
    private func syncTextViewDocument(_ textView: NSTextView, context: Context) {
        if state.plainText.isEmpty {
            context.coordinator.withProgrammaticBodyMutation {
                textView.string = ""
                context.coordinator.showPlaceholder(in: textView, text: placeholder)
            }
            return
        }
        context.coordinator.markNotPlaceholder()
        assignDocumentBody(
            to: textView,
            body: state.plainText,
            coordinator: context.coordinator,
            withProgrammaticMutation: context.coordinator.withProgrammaticBodyMutation
        )
    }

    private func syncTextViewToDocumentBody(_ textView: NSTextView, body: String, context: Context) {
        if body.isEmpty {
            context.coordinator.withProgrammaticBodyMutation {
                textView.string = ""
                context.coordinator.showPlaceholder(in: textView, text: placeholder)
            }
            return
        }
        context.coordinator.markNotPlaceholder()
        assignDocumentBody(
            to: textView,
            body: body,
            coordinator: context.coordinator,
            withProgrammaticMutation: context.coordinator.withProgrammaticBodyMutation
        )
    }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate, InlineImageRehydrateScheduling {
        var state: EditorState
        weak var textView: NSTextView?
        var proxy: EditorProxy?
        var boundNoteID: UUID?
        var isEditing = false
        var scriptureTheme: HarvousColors.ThemeVariant = .blue
        var studyHighlightPaints: [StudyHighlightPaint] = []
        var studyHighlightFocusedThreadId: UUID?
        /// Resolver for per-note pill accents (see `HarvousEditor.pillAccentResolver`). Updated on every `updateNSView`.
        var pillAccentResolver: ((String) -> StudyHighlightAccentToken?)?
        /// After pill detection settles — parent may prefetch scripture HTML.
        var onResolvedScripturePillPairs: (([(reference: String, translation: String)]) -> Void)?
        var onRemoveStudyHighlightThreadIds: (([UUID]) -> Void)?
        /// Passed from SwiftUI to pick highlight palette.
        var studyHighlightsAssumeDarkAppearance: Bool = false
        var placeholderText = "What are you studying?"
        /// Last applied `DynamicTypeSize` from SwiftUI — when it changes, compose fonts refresh for accessibility text sizing.
        var lastDynamicTypeSize: DynamicTypeSize?
        /// True when the body shows placeholder copy (see `showPlaceholder`). The view’s `textColor` cannot be used: placeholder uses attributed `.foregroundColor` only.
        private var isDisplayingPlaceholder: Bool = false
        private var debounceTask: Task<Void, Never>?
        /// Lightweight debounce for inline reference suggestions while the caret is active (no pill strip→reapply).
        private var referenceSuggestionDebounceTask: Task<Void, Never>?
        private var formatBarHideTask: Task<Void, Never>?
        private var plainTextBindingCoalesced = false
        private var inlineImageRehydrateTask: Task<Void, Never>?
        /// Bumped on note switch so deferred `Task`s from the previous note cannot write `state.plainText`.
        var noteBindingGeneration: UInt64 = 0
        /// Dismisses a stray caret `selectionUpdate` after we replace the document (note switch) so the bar does not show until the user changes selection again.
        /// `fileprivate` so `HarvousEditor.updateNSView` can set it when `boundNoteID` changes (nested `private` is not visible to the outer type).
        fileprivate var suppressFormatBarOnNextBodyCaretUpdate: Bool = false
        /// `textDidChange` fires for programmatic loads, pill rewrites, etc. — suppress the format bar until user typing.
        private var programmaticBodyMutationDepth: Int = 0
        private var isProgrammaticBodyMutation: Bool { programmaticBodyMutationDepth > 0 }
        /// Last applied highlight paint inputs — avoids strip/reapply on every SwiftUI `updateNSView` during typing.
        private var lastAppliedStudyHighlightSignature: String?
        /// Last applied reference-suggestion inputs — avoids full-document word scan on every `updateNSView`.
        private var lastAppliedReferenceSuggestionSignature: String?
        /// Last applied scripture-pill inputs (expanded plain text + theme). Gates the render-pass
        /// `reapplyScripturePillsToBody` so the full regex sweep runs once per real change instead of
        /// every SwiftUI `updateNSView` pass — fixes the 100%-CPU re-entrant render loop on note open/edit.
        fileprivate var lastAppliedPillSignature: String?
        /// Detected reference ranges + theme — gates typing debounce so strip→reapply does not run when
        /// only non-scripture text changed (avoids pill flicker while typing past existing pills).
        private var lastAppliedPillDetectionSignature: String?
        /// Stable (`documentBody` + theme) key of the content for which `updateNSView` last completed its
        /// strip→reapply pass. Caps that pass to once per loaded content so it cannot re-enter when the
        /// expanded storage permanently differs from the saved body (web notes whose translation is
        /// metadata, not inline). Reset on note switch below.
        fileprivate var lastSettledPillContentKey: String?

        private func currentStudyHighlightPaintSignature() -> String {
            HarvousStudyHighlightMapper.studyHighlightPaintSignature(
                paints: studyHighlightPaints,
                focusedThreadId: studyHighlightFocusedThreadId,
                isDark: studyHighlightsAssumeDarkAppearance
            )
        }

        /// Cancels in-flight debounced work and invalidates deferred binding updates scheduled before a note switch.
        fileprivate func invalidateDeferredNoteBindingWork() {
            noteBindingGeneration &+= 1
            debounceTask?.cancel()
            debounceTask = nil
            referenceSuggestionDebounceTask?.cancel()
            referenceSuggestionDebounceTask = nil
            plainTextBindingCoalesced = false
            inlineImageRehydrateTask?.cancel()
            inlineImageRehydrateTask = nil
            lastAppliedStudyHighlightSignature = nil
            lastAppliedReferenceSuggestionSignature = nil
            lastAppliedPillSignature = nil
            lastAppliedPillDetectionSignature = nil
            lastSettledPillContentKey = nil
            cancelFormatBarHide()
        }

        func scheduleAsyncInlineImageRehydrate(on textView: HVTextView, payloads: [Data]) {
            inlineImageRehydrateTask?.cancel()
            let generation = noteBindingGeneration
            let payloadsCopy = payloads
            inlineImageRehydrateTask = Task { @MainActor [weak self, weak textView] in
                let validated: [Data] = await Task.detached(priority: .userInitiated) {
                    payloadsCopy.filter { payload in
                        NoteInlineImageSerialization.imageFromInlinePayload(payload) != nil
                    }
                }.value
                guard let self, !Task.isCancelled, generation == self.noteBindingGeneration else { return }
                guard let textView, textView === self.textView else { return }
                guard let tv = textView as? NSTextView, let storage = tv.textStorage else { return }
                self.withProgrammaticBodyMutation {
                    applyInlineImagePlaceholders(in: storage, payloads: validated)
                }
                if let scrollView = tv.enclosingScrollView as? HarvousEditorScrollView {
                    scrollView.scheduleBodyLayoutHeightPublish(to: self.proxy)
                }
            }
        }

        init(state: EditorState) {
            self.state = state
            super.init()
            // When the user changes a pill's accent via `ActiveScripturePillDock` we must re-run pill
            // detection so the new accent is picked up by the resolver and the rendered attachments refresh.
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleForceScripturePillRedetect(_:)),
                name: .harvousForceScripturePillRedetect,
                object: nil
            )
            // URL pill title resolved (Slice 3): update the matching attachment so the next tap
            // hands a non-nil title to `ActiveURLPillDock`.
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleURLLinkTitleResolved(_:)),
                name: .harvousURLLinkTitleResolved,
                object: nil
            )
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        @objc private func handleForceScripturePillRedetect(_ note: Notification) {
            MainActor.assumeIsolated {
                // Scope to the bound note (notification carries the note's UUID as `object`).
                if let uuid = note.object as? UUID, let mine = boundNoteID, uuid != mine { return }
                guard let tv = textView else { return }
                detectAndInsertPillsIfNeeded(in: tv, text: state.plainText, force: true)
            }
        }

        @objc private func handleURLLinkTitleResolved(_ note: Notification) {
            MainActor.assumeIsolated {
                guard let href = note.userInfo?["href"] as? String,
                      let title = note.userInfo?["title"] as? String,
                      let tv = textView, let storage = tv.textStorage else { return }
                applyResolvedURLLinkTitle(title, forHref: href, in: storage)
            }
        }

        private func currentScripturePillDetectionSignature(in storage: NSTextStorage) -> String {
            let plain = harvousExpandedPlainText(in: storage)
            let matches = ScriptureDetector.detect(in: plain)
            let positions = matches
                .sorted { $0.range.location < $1.range.location }
                .map { "\($0.range.location):\($0.range.length):\($0.displayText)" }
                .joined(separator: ";")
            return "\(positions)|\(String(describing: scriptureTheme))"
        }

        private func recordAppliedPillSignatures(from textView: NSTextView) {
            guard let storage = textView.textStorage else { return }
            lastAppliedPillDetectionSignature = currentScripturePillDetectionSignature(in: storage)
            lastAppliedPillSignature = harvousExpandedPlainText(in: storage) + "|" + String(describing: scriptureTheme)
        }

        func withProgrammaticBodyMutation(_ work: () -> Void) {
            programmaticBodyMutationDepth += 1
            work()
            programmaticBodyMutationDepth -= 1
        }

        /// Pushes the text view’s expanded plain body and detected refs into SwiftUI immediately (e.g. after scripture Apply) so `updateNSView` does not restore stale `plainText` and erase the pill.
        @MainActor
        func pushPlainTextAndRefsFromTextView(_ tv: NSTextView) {
            guard let storage = tv.textStorage else { return }
            let plain = harvousExpandedPlainText(in: storage)
            state.plainText = plain
            state.detectedRefs = ScriptureDetector.uniqueDisplayRefs(in: plain)
        }

        /// Re-run pill detection (e.g. after `syncTextViewDocument` loads saved plain text with no `NSTextAttachment`s).
        ///
        /// Signature-gated: pill re-application is idempotent, so when the expanded plain text and theme
        /// are unchanged this is a no-op. Skipping it here breaks the SwiftUI render loop where every
        /// `updateNSView` pass re-ran the full `ScriptureDetector` regex (100%-CPU beachball on note open/edit).
        @MainActor
        func reapplyScripturePillsToBody(in textView: NSTextView, paintHighlights: Bool = true) {
            guard let storage = textView.textStorage else { return }
            let expandedSig = harvousExpandedPlainText(in: storage) + "|" + String(describing: scriptureTheme)
            let detectSig = currentScripturePillDetectionSignature(in: storage)
            if expandedSig == lastAppliedPillSignature, detectSig == lastAppliedPillDetectionSignature { return }
            detectAndInsertPillsIfNeeded(in: textView, text: state.plainText, paintHighlights: paintHighlights, force: true)
        }

        /// Signature-gated pill detection — skips strip→reapply when detected references are unchanged.
        @MainActor
        func detectAndInsertPillsIfNeeded(
            in textView: NSTextView,
            text: String,
            paintHighlights: Bool = true,
            force: Bool = false
        ) {
            guard let storage = textView.textStorage else { return }
            // Strip→reapply while the caret is active visibly flickers attachments; settle on end editing.
            if isEditing, !force { return }
            if !force {
                let detectSig = currentScripturePillDetectionSignature(in: storage)
                guard detectSig != lastAppliedPillDetectionSignature else { return }
            }
            detectAndInsertPills(in: textView, text: text, paintHighlights: paintHighlights)
            recordAppliedPillSignatures(from: textView)
        }

        /// Hooks so `EditorProxy` can cancel/restart the idle dismiss timer when the pointer enters/leaves the toolbar.
        func wireFormatBarToProxy(_ p: EditorProxy?) {
            guard let p else { return }
            p.cancelFormatBarHideAction = { [weak self] in self?.cancelFormatBarHide() }
            p.scheduleFormatBarHideAction = { [weak self] in self?.scheduleFormatBarHide() }
            p.triggerHighlightCapturePrompt = { [weak self] in
                self?.invokeHighlightCapturePromptFromEditMenuIfPossible()
            }
            p.triggerStandaloneNoteFromSelection = { [weak self] in
                self?.invokeNewStandaloneNoteFromEditMenuIfPossible()
            }
            p.triggerRemoveIntersectingStudyHighlightsFromSelection = { [weak self] in
                self?.invokeEraseInlineFormattingFromSelectionIfPossible()
            }
            p.repaintReferenceSuggestions = { [weak self] in
                guard let self, let tv = self.textView else { return }
                self.applyReferenceSuggestionsIfNeeded(on: tv, force: true)
            }
            p.syncStudyHighlightPaintsToEditor = { [weak self] paints in
                guard let self else { return }
                self.studyHighlightPaints = paints
                if let tv = self.textView as? HarvousNoteTextView {
                    tv.studyHighlightPaints = paints
                }
            }
            p.repaintStudyHighlights = { [weak self] in
                guard let self, let tv = self.textView else { return }
                self.paintStudyHighlightsIfNeeded(on: tv, force: true)
            }
            p.captureBodySelectionForConnect = { [weak self, weak p] in
                guard let self, let p, let tv = self.textView, let storage = tv.textStorage else { return }
                let storageRange = tv.selectedRange()
                let expandedRange: NSRange
                switch HarvousStudyHighlightMapper.expandedRange(forStorageSelection: storageRange, in: storage) {
                case .success(let exp): expandedRange = exp
                case .failure: expandedRange = storageRange
                }
                let txt = (storage.string as NSString).substring(with: storageRange)
                p.capturedConnectExpandedRange = expandedRange
                p.capturedConnectSourceText = txt
            }
        }

        func invokeEraseInlineFormattingFromSelectionIfPossible() {
            guard let tv = textView, tv.textStorage != nil, !isDisplayingPlaceholder else { return }
            invokeRemoveIntersectingStudyHighlightFromSelectionIfPossible()
            proxy?.clearRichFormattingInSelection()
        }

        func invokeRemoveIntersectingStudyHighlightFromSelectionIfPossible() {
            guard let tv = textView,
                  let storage = tv.textStorage,
                  !isDisplayingPlaceholder
            else { return }
            let sel = tv.selectedRange()
            let ids = HarvousStudyHighlightMapper.threadIdsIntersectingBodySelection(
                sel,
                paints: studyHighlightPaints,
                storage: storage
            )
            guard !ids.isEmpty else { return }
            onRemoveStudyHighlightThreadIds?(ids)
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
            HarvousBodyRichTextDiagnostics.attributesContainClearableFormatting(attributes, emptyStorage: emptyStorage)
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

        /// Re-applies compose body font when Dynamic Type / larger text changes (placeholder vs normal).
        @MainActor
        func refreshComposeBodyTypography() {
            guard let tv = textView else { return }
            if isDisplayingPlaceholder {
                let attrs: [NSAttributedString.Key: Any] = [
                    .foregroundColor: NSColor.tertiaryLabelColor,
                    .font: HarvousFonts.noteComposeBodyNSFont(),
                ]
                tv.textStorage?.setAttributedString(NSAttributedString(string: placeholderText, attributes: attrs))
                tv.setSelectedRange(NSRange(location: 0, length: 0))
            } else {
                tv.font = HarvousFonts.noteComposeBodyNSFont()
                applyDefaultBodyTypingAttributes(to: tv)
                (tv as? HarvousNoteTextView)?.refreshScripturePillRastersForCurrentAppearance()
            }
        }

        /// Instant scripture pill on Space/Enter/comma/period — cursor-scoped, no full-doc strip→reapply.
        @MainActor
        fileprivate func handleScriptureBoundaryTyped() {
            guard let tv = textView, let storage = tv.textStorage else { return }
            guard !isDisplayingPlaceholder, !isProgrammaticBodyMutation else { return }
            let cursor = tv.selectedRange().location
            let scale = harvousEditorBackingScale(for: tv)
            var insertedRef: String?
            withProgrammaticBodyMutation {
                insertedRef = detectAndInsertPillAtCursor(
                    in: storage,
                    cursorUTF16: cursor,
                    isBoundaryTrigger: true,
                    theme: scriptureTheme,
                    pillAccentResolver: pillAccentResolver,
                    backingScale: scale
                )
                guard insertedRef != nil else { return }
                (tv as? HarvousNoteTextView)?.resetScripturePillPointerHoverAfterDocumentMutation()
                recordAppliedPillSignatures(from: tv)
                paintStudyHighlightsIfNeeded(on: tv, force: true)
            }
            guard insertedRef != nil else { return }
            let bindingGeneration = noteBindingGeneration
            let plain = harvousExpandedPlainText(in: storage)
            let refsOut = ScriptureDetector.uniqueDisplayRefs(in: plain)
            Task { @MainActor in
                guard bindingGeneration == self.noteBindingGeneration else { return }
                if self.state.plainText != plain { self.state.plainText = plain }
                if self.state.detectedRefs != refsOut { self.state.detectedRefs = refsOut }
            }
            onResolvedScripturePillPairs?(scripturePillRefTransPairs(in: storage))
            proxy?.refreshFormatStateCoalesced()
        }

        func showPlaceholder(in textView: NSTextView, text: String) {
            // Simple placeholder via text storage (tertiary label reads lighter than .placeholderTextColor in the canvas)
            if textView.string.isEmpty {
                let attrs: [NSAttributedString.Key: Any] = [
                    .foregroundColor: NSColor.tertiaryLabelColor,
                    .font: HarvousFonts.noteComposeBodyPlatformFont()
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
                .font: HarvousFonts.noteComposeBodyPlatformFont(),
                .foregroundColor: NSColor.labelColor,
                .paragraphStyle: para
            ]
            tv.textStorage?.setAttributedString(NSAttributedString(string: "", attributes: attrs))
            tv.typingAttributes = attrs
            tv.font = HarvousFonts.noteComposeBodyPlatformFont()
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
            var selectionViewPoint: CGPoint? = nil
            var selectionViewportRectLocal: CGRect? = nil
            var selectionCaretViewportRectLocal: CGRect? = nil
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

                // Viewport-relative point for overlays on the scrollable editor (SwiftUI/Y-down aligned with NSTextView when flipped).
                if let sv = tv.enclosingScrollView {
                    let viewRectInTV = tv.convert(windowRect, from: nil)
                    let docVisible = sv.documentVisibleRect
                    let viewportRect = viewRectInTV.offsetBy(dx: -docVisible.origin.x, dy: -docVisible.origin.y)
                    selectionViewportRectLocal = viewportRect
                    selectionViewPoint = CGPoint(x: viewportRect.midX, y: viewportRect.minY)

                    // Caret-end rect (active end of selection) — used for floating UI anchored to where typing would resume.
                    let caretLocation = NSMaxRange(range)
                    let caretRange = NSRange(location: caretLocation, length: 0)
                    let caretScreenRect = tv.firstRect(forCharacterRange: caretRange, actualRange: nil)
                    if !caretScreenRect.isEmpty {
                        let caretWindowRect = window.convertFromScreen(caretScreenRect)
                        let caretRectInTV = tv.convert(caretWindowRect, from: nil)
                        selectionCaretViewportRectLocal = caretRectInTV.offsetBy(dx: -docVisible.origin.x, dy: -docVisible.origin.y)
                    }
                }
            }

            // Defer @Published-equivalent writes to the next run-loop pass so they
            // don't fire while SwiftUI is mid-update ("Publishing from view update" warning).
            let deferPillFocusSync = (tv as? HarvousNoteTextView)?.isDeferringActiveScripturePillFromMouseGesture == true
            let capturedProxy = proxy
            Task { @MainActor in
                capturedProxy?.syncBodyFirstResponderState(textView: tv)
                capturedProxy?.hasSelection = hasSelection
                capturedProxy?.selectionContentPoint = contentPoint
                capturedProxy?.selectionViewPoint = selectionViewPoint
                capturedProxy?.selectionViewportRect = selectionViewportRectLocal
                capturedProxy?.selectionCaretViewportRect = selectionCaretViewportRectLocal
                if hasSelection {
                    capturedProxy?.refreshFormatState()
                } else {
                    capturedProxy?.refreshFormatStateCoalesced()
                }
                if !deferPillFocusSync {
                    let adjacent = activeScripturePillFromNSTextViewSelection(tv)
                    if adjacent == nil {
                        capturedProxy?.activeScripturePill = nil
                    }
                }
                guard let p = capturedProxy else { return }
                if hasSelection {
                    // `resetFormatBarStateForNewNote` clears `formatBarUnlocked`; if the body stayed first responder
                    // across a note switch, `textDidBeginEditing` may not fire again — selection alone must unlock.
                    p.preferOrbChromeUntilNextFormatSignal = false
                    p.formatBarUnlocked = true
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
                        // Same unlock as `hasSelection`: caret placement after a note switch without a new begin-edit.
                        p.formatBarUnlocked = true
                        p.showFormatBarForActivity = true
                        self.scheduleFormatBarHide()
                    }
                }
            }
        }

        /// Clears `activeScripturePill` when the caret is no longer beside a pill (after deferred highlight gestures).
        func syncActiveScripturePillFromTextViewSelection() {
            guard let tv = textView else { return }
            let capturedProxy = proxy
            Task { @MainActor in
                let adjacent = activeScripturePillFromNSTextViewSelection(tv)
                if adjacent == nil {
                    capturedProxy?.activeScripturePill = nil
                }
            }
        }

        private func macViewportRectForPillRanges(_ ranges: [NSRange], in tv: NSTextView) -> CGRect? {
            guard let window = tv.window, let sv = tv.enclosingScrollView else { return nil }
            var unionRect = CGRect.null
            for r in ranges {
                guard r.length > 0, r.location != NSNotFound, let stor = tv.textStorage, NSMaxRange(r) <= stor.length else { continue }
                let screenRect = tv.firstRect(forCharacterRange: r, actualRange: nil)
                guard !screenRect.isEmpty else { continue }
                let windowRect = window.convertFromScreen(screenRect)
                let viewRectInTV = tv.convert(windowRect, from: nil)
                let docVisible = sv.documentVisibleRect
                let viewportRect = viewRectInTV.offsetBy(dx: -docVisible.origin.x, dy: -docVisible.origin.y)
                unionRect = unionRect.isNull ? viewportRect : unionRect.union(viewportRect)
            }
            return unionRect.isNull ? nil : unionRect
        }

        func applyConfirmedScripturePillDeletion() {
            guard let proxy else { return }
            guard let prompt = proxy.scripturePillDeletionPrompt, let tv = textView, let storage = tv.textStorage else {
                proxy.scripturePillDeletionPrompt = nil
                return
            }
            proxy.scripturePillDeletionPrompt = nil
            let sortedRanges = prompt.pillUTF16Ranges.sorted { $0.location > $1.location }
            withProgrammaticBodyMutation {
                for r in sortedRanges {
                    guard r.location != NSNotFound, r.length > 0, NSMaxRange(r) <= storage.length else { continue }
                    guard storage.attribute(.attachment, at: r.location, effectiveRange: nil) is ScripturePillAttachment else { continue }
                    storage.replaceCharacters(in: r, with: "")
                }
                pushPlainTextAndRefsFromTextView(tv)
                applyStudyHighlightPaint(to: tv)
                lastAppliedStudyHighlightSignature = currentStudyHighlightPaintSignature()
                applyReferenceSuggestionsIfNeeded(on: tv, force: true)
            }
            proxy.hvNotifyBodyChanged(tv)
            proxy.syncPlainTextBindingFromTextView?(tv)
            (tv.enclosingScrollView as? HarvousEditorScrollView)?.scheduleBodyLayoutHeightPublish(to: proxy)
            if let active = proxy.activeScripturePill,
               sortedRanges.contains(where: { NSIntersectionRange($0, active.attachmentRange).length > 0 }) {
                proxy.clearActiveScripturePill()
            }
            proxy.onScripturePillAttachmentRemoved?(sortedRanges)
            proxy.refreshFormatState()
        }

        func textView(_ textView: NSTextView, shouldChangeTextIn affectedCharRange: NSRange, replacementString: String?) -> Bool {
            guard !isProgrammaticBodyMutation else { return true }
            guard !isDisplayingPlaceholder else { return true }
            guard let storage = textView.textStorage, storage.length > 0 else { return true }
            let hitRanges = harvousPillAttachmentRangesIntersecting(affectedCharRange, in: storage)
            guard !hitRanges.isEmpty else { return true }
            guard let proxy else { return false }
            let sortedHit = hitRanges.sorted { $0.location < $1.location }
            let refs = sortedHit.compactMap { r -> String? in
                (storage.attribute(.attachment, at: r.location, effectiveRange: nil) as? ScripturePillAttachment)?.reference
            }
            let refLabel = refs.first ?? "Scripture"
            let anchor = macViewportRectForPillRanges(sortedHit, in: textView)
                ?? proxy.selectionViewportRect
                ?? CGRect(x: 0, y: 24, width: 120, height: 22)
            let prompt = ScripturePillDeletionPrompt(
                reference: refLabel,
                pillUTF16Ranges: sortedHit,
                anchorViewportRect: anchor
            )
            Task { @MainActor in
                proxy.scripturePillDeletionPrompt = prompt
            }
            return false
        }

        func textDidBeginEditing(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            isEditing = true
            proxy?.isActivelyEditingBody = true
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
            proxy?.isActivelyEditingBody = false
            cancelFormatBarHide()
            guard let tv = notification.object as? NSTextView else { return }
            proxy?.onBodyEditingEnded?()
            if let storage = tv.textStorage {
                let plain = harvousExpandedPlainText(in: storage)
                detectAndInsertPillsIfNeeded(in: tv, text: plain, paintHighlights: false, force: true)
            }
            paintStudyHighlightsIfNeeded(on: tv, force: true)
            applyReferenceSuggestionsIfNeeded(on: tv, force: true)
            (tv.enclosingScrollView as? HarvousEditorScrollView)?.scheduleBodyLayoutHeightPublish(to: proxy)
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
            guard let tv = notification.object as? NSTextView else { return }
            // Capture before the deferred `Task`: mutation scope may end before the task runs.
            let isProgrammatic = isProgrammaticBodyMutation
            let bindingGeneration = noteBindingGeneration

            // Debounced scripture detection (idle / programmatic only — not while actively editing).
            debounceTask?.cancel()
            if isEditing {
                scheduleDebouncedReferenceSuggestionRepaint(
                    textView: tv,
                    bindingGeneration: bindingGeneration
                )
                schedulePlainTextBindingUpdate(
                    textView: tv,
                    bindingGeneration: bindingGeneration,
                    isProgrammatic: isProgrammatic
                )
                return
            }
            debounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                guard bindingGeneration == self.noteBindingGeneration else { return }
                // Do not mutate storage while IME/marked text or a different document view is active.
                guard tv === self.textView, !tv.hasMarkedText() else { return }
                guard !self.isEditing else { return }
                guard let storage = tv.textStorage else { return }
                let plain = harvousExpandedPlainText(in: storage)
                self.detectAndInsertPillsIfNeeded(in: tv, text: plain, paintHighlights: true)
            }

            schedulePlainTextBindingUpdate(
                textView: tv,
                bindingGeneration: bindingGeneration,
                isProgrammatic: isProgrammatic
            )
        }

        /// Repaints dotted Easton's hints while the user is actively editing (attribute-only; no pill strip→reapply).
        private func scheduleDebouncedReferenceSuggestionRepaint(
            textView tv: NSTextView,
            bindingGeneration: UInt64
        ) {
            referenceSuggestionDebounceTask?.cancel()
            referenceSuggestionDebounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                guard bindingGeneration == self.noteBindingGeneration else { return }
                guard tv === self.textView, !tv.hasMarkedText() else { return }
                self.applyReferenceSuggestionsIfNeeded(on: tv, force: true)
            }
        }

        /// Coalesces `state.plainText` writes to one per run-loop turn; expands storage off the delegate path.
        private func schedulePlainTextBindingUpdate(
            textView tv: NSTextView,
            bindingGeneration: UInt64,
            isProgrammatic: Bool
        ) {
            if plainTextBindingCoalesced { return }
            plainTextBindingCoalesced = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.plainTextBindingCoalesced = false
                guard bindingGeneration == self.noteBindingGeneration else { return }
                guard tv === self.textView, let storage = tv.textStorage else { return }
                let plain = harvousExpandedPlainText(in: storage)
                if self.state.plainText != plain {
                    self.state.plainText = plain
                }
                if !isProgrammatic {
                    self.proxy?.preferOrbChromeUntilNextFormatSignal = false
                    self.proxy?.formatBarUnlocked = true
                    self.proxy?.showFormatBarForActivity = true
                    self.scheduleFormatBarHide()
                }
                self.proxy?.refreshFormatStateCoalesced()
                if !self.isEditing {
                    (tv.enclosingScrollView as? HarvousEditorScrollView)?.scheduleBodyLayoutHeightPublish(to: self.proxy)
                }
            }
        }

        func textView(_ view: NSTextView, menu: NSMenu, for _: NSEvent, at _: Int) -> NSMenu? {
            guard view === textView, let storage = view.textStorage else { return menu }
            let sel = view.selectedRange()

            let removableIDs = HarvousStudyHighlightMapper.threadIdsIntersectingBodySelection(
                sel,
                paints: studyHighlightPaints,
                storage: storage
            )
            let clearFormatting =
                sel.length > 0
                && HarvousBodyRichTextDiagnostics.selectionIntersectsClearableFormatting(storage: storage, utf16Range: sel)

            guard sel.length > 0 || !removableIDs.isEmpty else { return menu }

            var insertIndex = 0
            if sel.length > 0 {
                let hl = NSMenuItem(title: "Highlight…", action: #selector(macHighlightPromptFromMenu(_:)), keyEquivalent: "")
                hl.target = self
                menu.insertItem(hl, at: insertIndex)
                insertIndex += 1

                let item = NSMenuItem(title: "New Harvous note", action: #selector(macNewStandaloneNoteFromMenu(_:)), keyEquivalent: "")
                item.target = self
                menu.insertItem(item, at: insertIndex)
                insertIndex += 1
            }

            if !removableIDs.isEmpty || clearFormatting {
                let title: String = {
                    if !removableIDs.isEmpty, clearFormatting { return "Erase highlight & formatting" }
                    if !removableIDs.isEmpty { return "Remove highlight" }
                    return "Clear formatting"
                }()
                let rm = NSMenuItem(title: title, action: #selector(macRemoveIntersectingStudyHighlightsFromMenu(_:)), keyEquivalent: "")
                rm.target = self
                menu.insertItem(rm, at: insertIndex)
            }

            return menu
        }

        @objc private func macRemoveIntersectingStudyHighlightsFromMenu(_: Any?) {
            invokeEraseInlineFormattingFromSelectionIfPossible()
        }

        @objc private func macHighlightPromptFromMenu(_: Any?) {
            invokeHighlightCapturePromptFromEditMenuIfPossible()
        }

        func invokeHighlightCapturePromptFromEditMenuIfPossible() {
            guard let tv = textView, let storage = tv.textStorage, !isDisplayingPlaceholder else { return }
            let sel = tv.selectedRange()
            HarvousStandaloneSelectionNote.postHighlightCapturePromptIfEligible(
                storage: storage,
                utf16Selection: sel,
                parentNoteId: boundNoteID,
                anchorRectForPopover: proxy?.selectionViewportRect
            )
        }

        @objc private func macNewStandaloneNoteFromMenu(_: Any?) {
            invokeNewStandaloneNoteFromEditMenuIfPossible()
        }

        func invokeNewStandaloneNoteFromEditMenuIfPossible() {
            guard let tv = textView, let storage = tv.textStorage else { return }
            let sel = tv.selectedRange()
            HarvousStandaloneSelectionNote.postIfEligibleCollapseSelection(
                storage: storage,
                utf16Selection: sel,
                collapseToEndUtf16: { end in
                    let safeEnd = max(0, min(end, storage.length))
                    tv.setSelectedRange(NSRange(location: safeEnd, length: 0))
                },
                collapseProxySelectionState: { [weak self] in
                    guard let proxy = self?.proxy else { return }
                    proxy.hasSelection = false
                    proxy.selectionViewportRect = nil
                    proxy.selectionCaretViewportRect = nil
                    proxy.refreshFormatState()
                }
            )
        }

        /// Re-draws pastel study highlights once scripture pills settle (runs on main actor).
        @MainActor
        func paintStudyHighlightsIfNeeded(on textView: NSTextView, force: Bool = false) {
            let signature = currentStudyHighlightPaintSignature()
            guard force || signature != lastAppliedStudyHighlightSignature else { return }
            paintStudyHighlightsPreservingSelection(on: textView)
            lastAppliedStudyHighlightSignature = signature
            // Match iOS `paintStudyHighlights` — highlight paint strips/reapplies underlines, so
            // dotted Easton's hints must be repainted on top (saved highlight wins per-word).
            applyReferenceSuggestionsIfNeeded(on: textView, force: true)
        }

        private func currentReferenceSuggestionSignature(for storage: NSTextStorage) -> String {
            var hasher = Hasher()
            hasher.combine(studyHighlightsAssumeDarkAppearance)
            hasher.combine(storage.string)
            hasher.combine(currentStudyHighlightPaintSignature())
            return String(hasher.finalize())
        }

        /// Repaints inline reference suggestions (Easton's dotted hints) when storage or theme changed.
        @MainActor
        func applyReferenceSuggestionsIfNeeded(on textView: NSTextView, force: Bool = false) {
            guard let storage = textView.textStorage else { return }
            let signature = currentReferenceSuggestionSignature(for: storage)
            guard force || signature != lastAppliedReferenceSuggestionSignature else { return }
            applyReferenceSuggestionsPreservingSelection(on: textView)
            lastAppliedReferenceSuggestionSignature = signature
        }

        /// Applies reference suggestions without restoring selection (mirrors iOS — TextKit keeps the live caret).
        @MainActor
        private func applyReferenceSuggestionsPreservingSelection(on textView: NSTextView) {
            let savedDelegate = textView.delegate
            textView.delegate = nil
            withProgrammaticBodyMutation {
                guard let storage = textView.textStorage else { return }
                ReferenceSuggestionPainter.applySuggestions(storage: storage, isDark: studyHighlightsAssumeDarkAppearance)
            }
            textView.delegate = savedDelegate
        }

        /// Applies highlight attributes without restoring selection (mirrors iOS — avoids caret fighting TextKit).
        @MainActor
        private func paintStudyHighlightsPreservingSelection(on textView: NSTextView) {
            let savedDelegate = textView.delegate
            textView.delegate = nil
            withProgrammaticBodyMutation {
                applyStudyHighlightPaint(to: textView)
            }
            textView.delegate = savedDelegate
        }

        @MainActor
        private func applyStudyHighlightPaint(to textView: NSTextView) {
            guard let storage = textView.textStorage else { return }
            if studyHighlightPaints.isEmpty {
                HarvousStudyHighlightMapper.stripPainting(from: storage, fullDocumentRange: NSRange(location: 0, length: storage.length))
            } else {
                let anchors = studyHighlightPaints.map {
                    (id: $0.threadId, kind: $0.entryKind, accent: $0.accent, expandedRange: $0.expandedUTF16Range)
                }
                HarvousStudyHighlightMapper.applyHighlights(
                    storage: storage,
                    anchors: anchors,
                    isDark: studyHighlightsAssumeDarkAppearance,
                    focusedThreadId: studyHighlightFocusedThreadId
                )
            }
        }

        @MainActor
        private func detectAndInsertPills(in textView: NSTextView, text: String, paintHighlights: Bool = true) {
            withProgrammaticBodyMutation {
                self.detectAndInsertPillsImpl(in: textView, text: text, paintHighlights: paintHighlights)
            }
        }

        @MainActor
        private func detectAndInsertPillsImpl(in textView: NSTextView, text: String, paintHighlights: Bool = true) {
            _ = text

            guard let storage = textView.textStorage else { return }
            (textView as? HarvousNoteTextView)?.resetScripturePillPointerHoverAfterDocumentMutation()
            var translationQueue = scripturePillRefTransPairs(in: storage)
            // Batch removal into one layout pass: beginEditing/endEditing coalesces N replaceCharacters
            // notifications into a single layout-manager update instead of N separate invalidations.
            let pillRanges = collectPillAttachmentRanges(in: storage)
            storage.beginEditing()
            for range in pillRanges.reversed() {
                if let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment {
                    storage.replaceCharacters(in: range, with: pill.reference)
                }
            }
            storage.endEditing()

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

            // Batch insertion + duplicate-translation cleanup into one layout pass.
            storage.beginEditing()
            for item in pillInserts.sorted(by: { $0.range.location > $1.range.location }) {
                let pill = ScripturePillAttachment(
                    reference: item.displayRef,
                    translation: item.translation,
                    theme: scriptureTheme,
                    accent: pillAccentResolver?(item.displayRef),
                    backingScale: harvousEditorBackingScale(for: textView)
                )
                let pillStr = NSMutableAttributedString(attachment: pill)
                let bodyFont: NSFont = HarvousFonts.noteComposeBodyPlatformFont()
                var pillAttrs: [NSAttributedString.Key: Any] = [.font: bodyFont]
                let pillLoc = item.range.location
                if pillLoc < storage.length,
                   let ps = storage.attribute(.paragraphStyle, at: pillLoc, effectiveRange: nil) as? NSParagraphStyle {
                    pillAttrs[.paragraphStyle] = ps
                }
                pillStr.addAttributes(pillAttrs, range: NSRange(location: 0, length: pillStr.length))
                storage.replaceCharacters(in: item.range, with: pillStr)
            }
            // Do not reset fonts on the full document here — that stripped headings/bold after scripture detection.
            // Pills already get body font when inserted above.
            removeDuplicateTranslationAfterPillAttachments(in: storage)

            // URL pill detection runs in the same edit pass so the layout manager performs a single
            // layout flush. Scripture pills win any overlap because their ranges land in
            // `protectedRanges`. `titleResolver` plugs in cached page titles so pills restored after
            // re-detection (e.g. note switch) don't briefly drop to nil-title state.
            let bodyFontForURL: NSFont = HarvousFonts.noteComposeBodyPlatformFont()
            // Defensive migration: any `.link`-attributed run (legacy AddLink path or pasted RTF)
            // becomes a labeled `URLLinkPillAttachment` first, so storage converges to one shape.
            convertLinkAttributedRunsToURLLinkPills(in: storage, bodyFont: bodyFontForURL)
            detectAndInsertURLLinkPills(
                in: storage,
                bodyFont: bodyFontForURL,
                titleResolver: { URLLinkTitleService.shared.cachedTitle(for: $0) }
            )
            // Kick off async title resolution for any pill that still has nil title. Cheap when
            // cache is warm — `ensureResolved` is a synchronous no-op after the first call.
            for range in rangesOfURLLinkPillAttachments(in: storage) {
                if let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? URLLinkPillAttachment,
                   pill.title == nil {
                    URLLinkTitleService.shared.ensureResolved(for: pill.href)
                }
            }

            storage.endEditing()
            applyDefaultBodyTypingAttributes(to: textView)
            // Callers that own a dedicated highlight-paint step (note-switch Hop 2) pass paintHighlights: false
            // to avoid a redundant full-document attribute pass.
            if paintHighlights {
                paintStudyHighlightsIfNeeded(on: textView, force: true)
            }

            // `textDidChange` is not always sent when `textStorage` is edited programmatically. Sync
            // the binding with real reference text, not U+FFFC per attachment, or `updateNSView` will
            // clobber pills with stale plain text and the visible scripture is lost.
            // Never assign `state` synchronously from here: `reapplyScripturePillsToBody` runs inside
            // `updateNSView` and would trigger "Modifying state during view update".
            let plainOut = harvousExpandedPlainText(in: storage)
            // Dedupe before propagating to `Note.detectedRefs` — see ScriptureDetector.uniqueDisplayRefs comment.
            // `freshMatches` itself stays as-is so per-pill placement above retains every occurrence.
            var seenRefs = Set<String>()
            let refsOut = freshMatches.map(\.displayText).filter { seenRefs.insert($0).inserted }
            let bindingGeneration = noteBindingGeneration
            Task { @MainActor in
                guard bindingGeneration == self.noteBindingGeneration else { return }
                // Idempotency guard (fixes 100%-CPU main-thread beachball when editing existing
                // synced notes). Pill re-application is idempotent, so at steady state
                // `plainOut`/`refsOut` already equal `state`. Assigning unconditionally still
                // re-commits SwiftUI → re-enters updateNSView → reapplyScripturePillsToBody →
                // detectAndInsertPillsImpl → here again, forming an unbounded render loop. Only
                // write when a value actually changed so the cycle ends at the expansion fixpoint.
                if self.state.plainText != plainOut {
                    self.state.plainText = plainOut
                }
                if self.state.detectedRefs != refsOut {
                    self.state.detectedRefs = refsOut
                }
            }
            let pairs = scripturePillRefTransPairs(in: storage)
            onResolvedScripturePillPairs?(pairs)
        }
    }
}

#else
import UIKit

/// Custom `UITextView` hook for the native selection edit menu.
private final class HarvousBodyTextView: UITextView {
    var onHighlightCaptureAction: (() -> Void)?
    var onNewStandaloneNoteAction: (() -> Void)?
    var onConnectExistingNoteAction: (() -> Void)?
    var studyHighlightPaintsSnapshot: [StudyHighlightPaint] = []
    var onRemoveIntersectingStudyHighlightsAction: (() -> Void)?

    override init(frame: CGRect, textContainer: NSTextContainer?) {
        super.init(frame: frame, textContainer: textContainer)
        registerScripturePillAppearanceTraitRefresh()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        registerScripturePillAppearanceTraitRefresh()
    }

    /// UITrait-change registration replaces `traitCollectionDidChange(_:)` (deprecated iOS 17).
    private func registerScripturePillAppearanceTraitRefresh() {
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: HarvousBodyTextView, _: UITraitCollection) in
            self.refreshScripturePillRastersForCurrentAppearance()
        }
    }

    /// `ScripturePillAttachment.image` is a `UIImage` rasterized eagerly via
    /// `UIGraphicsImageRenderer` against the trait collection at attachment-creation time, so
    /// label color and inner-edge wash freeze until storage is rebuilt. On a light↔dark toggle
    /// re-render every pill under the new trait and invalidate their glyph rects.
    fileprivate func refreshScripturePillRastersForCurrentAppearance() {
        let storage = textStorage
        guard storage.length > 0 else { return }
        let lm = layoutManager
        traitCollection.performAsCurrent {
            var idx = 0
            let end = storage.length
            while idx < end {
                var eff = NSRange()
                let value = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
                if let pill = value as? ScripturePillAttachment {
                    pill.refreshRasterForCurrentAppearance()
                    let glyphRange = lm.glyphRange(forCharacterRange: eff, actualCharacterRange: nil)
                    lm.invalidateDisplay(forGlyphRange: glyphRange)
                } else if let urlPill = value as? URLLinkPillAttachment {
                    urlPill.refreshRasterForCurrentAppearance()
                    let glyphRange = lm.glyphRange(forCharacterRange: eff, actualCharacterRange: nil)
                    lm.invalidateDisplay(forGlyphRange: glyphRange)
                }
                let next = NSMaxRange(eff)
                if next <= idx { break }
                idx = next
            }
            setNeedsDisplay()
        }
    }

    /// Match macOS note body: strip RTF/HTML from the pasteboard so pasted runs use `typingAttributes`
    /// (label color / compose font). Also clears the tertiary placeholder tint before insert so pasted text does
    /// not briefly inherit `.tertiaryLabel` from stale typing attributes.
    override func paste(_ sender: Any?) {
        let pb = UIPasteboard.general

        guard let pasted = pb.string else {
            super.paste(sender)
            return
        }
        let trimmed = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty, pb.image != nil {
            super.paste(sender)
            return
        }

        if textColor == .tertiaryLabel {
            text = ""
            textColor = .label
            applyDefaultBodyTypingAttributes(to: self)
            selectedRange = NSRange(location: 0, length: 0)
        }

        guard let sel = selectedTextRange else {
            super.paste(sender)
            return
        }
        replace(sel, withText: pasted)

        invalidateIntrinsicContentSize()
        NotificationCenter.default.post(name: UITextView.textDidChangeNotification, object: self)
    }

    /// Clips the caret rect to natural glyph height so the inter-line gap added by
    /// `HarvousLayoutManager` doesn't produce an oversized cursor bar.
    override func caretRect(for position: UITextPosition) -> CGRect {
        var r = super.caretRect(for: position)
        let offset = self.offset(from: beginningOfDocument, to: position)
        let loc = max(0, min(offset, textStorage.length > 0 ? textStorage.length - 1 : 0))
        let font: UIFont
        if textStorage.length > 0, loc < textStorage.length,
           let f = textStorage.attribute(.font, at: loc, effectiveRange: nil) as? UIFont {
            font = f
        } else {
            font = HarvousFonts.noteComposeBodyPlatformFont()
        }
        let natural = ceil(font.ascender - font.descender + font.leading)
        r.size.height = min(r.size.height, natural)
        return r
    }

    override func editMenu(for textRange: UITextRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
        let start = offset(from: beginningOfDocument, to: textRange.start)
        let end = offset(from: beginningOfDocument, to: textRange.end)
        guard start <= end else {
            return super.editMenu(for: textRange, suggestedActions: suggestedActions)
        }

        let utf16Sel = NSRange(location: start, length: max(0, end - start))

        let removableIDs = HarvousStudyHighlightMapper.threadIdsIntersectingBodySelection(
            utf16Sel,
            paints: studyHighlightPaintsSnapshot,
            storage: textStorage
        )
        let clearFormatting =
            utf16Sel.length > 0
            && HarvousBodyRichTextDiagnostics.selectionIntersectsClearableFormatting(storage: textStorage, utf16Range: utf16Sel)

        guard utf16Sel.length > 0 || !removableIDs.isEmpty else {
            return super.editMenu(for: textRange, suggestedActions: suggestedActions)
        }

        var front: [UIMenuElement] = []
        if utf16Sel.length > 0 {
            if let hl = onHighlightCaptureAction {
                front.append(UIAction(title: "Create new note…", image: UIImage(systemName: "highlighter")) { _ in
                    hl()
                })
            }
            if let handler = onNewStandaloneNoteAction {
                front.append(UIAction(title: "New Harvous note", image: UIImage(systemName: "square.and.pencil")) { _ in
                    handler()
                })
            }
            if let handler = onConnectExistingNoteAction {
                front.append(UIAction(title: "Connect existing note", image: UIImage(systemName: "arrow.right.arrow.left")) { _ in
                    handler()
                })
            }
        }

        if (!removableIDs.isEmpty || clearFormatting),
           textColor != .tertiaryLabel,
           let rmHandler = onRemoveIntersectingStudyHighlightsAction {
            let title: String = {
                if !removableIDs.isEmpty, clearFormatting { return "Erase highlight & formatting" }
                if !removableIDs.isEmpty { return "Remove highlight" }
                return "Clear formatting"
            }()
            front.append(UIAction(title: title, image: UIImage(systemName: "eraser")) { _ in
                rmHandler()
            })
        }

        guard !front.isEmpty else {
            return super.editMenu(for: textRange, suggestedActions: suggestedActions)
        }
        let children = front + suggestedActions
        return UIMenu(children: children)
    }
}

/// UTF-16 ranges of `ScripturePillAttachment` glyphs intersecting a proposed edit range (iOS body editor).
private func harvousPillAttachmentRangesIntersectingIOS(_ affected: NSRange, in storage: NSTextStorage) -> [NSRange] {
    var result: [NSRange] = []
    guard storage.length > 0, affected.location != NSNotFound else { return result }
    let maxLen = storage.length
    if affected.location > maxLen { return result }
    let safeLen = min(affected.length, maxLen - affected.location)
    let safeAffected = NSRange(location: affected.location, length: safeLen)

    var idx = 0
    while idx < storage.length {
        var eff = NSRange()
        let val = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
        if val is ScripturePillAttachment, NSIntersectionRange(eff, safeAffected).length > 0 {
            result.append(eff)
        }
        let next = NSMaxRange(eff)
        if next <= idx { break }
        idx = next
    }
    return result
}

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
    var state: EditorState
    /// Read-only body — see the macOS `HarvousEditor.isEditable` note.
    var isEditable: Bool = true
    var noteID: UUID? = nil
    var documentBody: String = ""
    var placeholder: String = "What are you studying?"
    var scriptureTheme: HarvousColors.ThemeVariant = .blue
    /// Body formatting + scripture focus state (mirror macOS `proxy`).
    var proxy: EditorProxy? = nil
    var onScripturePillTap: ((String, String, NSRange) -> Void)? = nil
    /// URL pill tap callback. Args: `(href, cached title or nil, user-label or nil, attachment UTF-16 range)`.
    /// The host opens the inline `ActiveURLPillDock` — the editor no longer opens Safari directly.
    var onURLPillTap: ((String, String?, String?, NSRange) -> Void)? = nil
    /// Tap on an inline reference suggestion (dotted hint). Args: `(slug, word UTF-16 range)`.
    var onReferenceSuggestionTap: ((String, NSRange) -> Void)? = nil
    /// Fires after scripture pills are materialized — used to prefetch passages off the tap path (iOS).
    var onResolvedScripturePillPairs: (([(reference: String, translation: String)]) -> Void)? = nil
    var onStudyHighlightTap: ((UUID) -> Void)? = nil
    var studyHighlightPaints: [StudyHighlightPaint] = []
    var studyHighlightFocusedThreadId: UUID? = nil
    var studyHighlightsAssumeDarkAppearance: Bool = false
    /// Resolves the user-picked scripture pill accent for a given reference (persisted on the owning Note).
    var pillAccentResolver: ((String) -> StudyHighlightAccentToken?)? = nil
    var onRemoveStudyHighlightThreadIds: (([UUID]) -> Void)? = nil
    /// Propagates SwiftUI Dynamic Type so `UITextView` fonts track the content size setting.
    var dynamicTypeSize: DynamicTypeSize = .large
    /// When `true` (iPad split layout), suppress the system `inputAssistantItem` bar so it doesn't
    /// shadow the Mac-style `NoteToolbar` rendered at the editor's bottom.
    var isIPadSplitLayout: Bool = false

    private func syncComposeTypographyForDynamicTypeIfNeeded(in textView: UITextView, context: Context) {
        if context.coordinator.lastDynamicTypeSize != dynamicTypeSize {
            context.coordinator.lastDynamicTypeSize = dynamicTypeSize
            context.coordinator.refreshComposeBodyTypography()
        }
    }

    /// On iPad split layout, the Mac-style `NoteToolbar` lives at the editor's bottom — we don't want
    /// the system to also render its `inputAssistantItem` capsule (keyboard / B / I / U / Aa / mic),
    /// which otherwise floats on top of the keyboard and shadows our toolbar. Clearing both bar groups
    /// and the accessory view suppresses it. iPhone path keeps the defaults (`isIPadSplitLayout == false`).
    private func applyIPadSplitInputAssistantSuppression(to textView: UITextView) {
        guard isIPadSplitLayout else { return }
        textView.inputAssistantItem.leadingBarButtonGroups = []
        textView.inputAssistantItem.trailingBarButtonGroups = []
        textView.inputAccessoryView = nil
    }

    func makeCoordinator() -> Coordinator {
        let c = Coordinator(state: state)
        c.placeholderText = placeholder
        c.proxy = proxy
        return c
    }

    func makeUIView(context: Context) -> UITextView {
        // Build an explicit TextKit 1 stack so HarvousLayoutManager owns underline drawing.
        // Providing a custom NSTextContainer forces UITextView into TextKit 1 mode on iOS 16+.
        let storage = NSTextStorage()
        let lm = HarvousLayoutManager()
        storage.addLayoutManager(lm)
        let container = NSTextContainer(size: .zero)
        container.widthTracksTextView = true
        container.lineFragmentPadding = 0
        lm.addTextContainer(container)
        let tv = HarvousBodyTextView(frame: .zero, textContainer: container)
        let para = noteBodyParagraphStyle()
        let bodyFont = HarvousFonts.noteComposeBodyPlatformFont()
        tv.font = bodyFont
        tv.textColor = .label
        tv.backgroundColor = .clear
        tv.isEditable = isEditable
        tv.isSelectable = true
        tv.allowsEditingTextAttributes = true
        tv.autocorrectionType = .yes
        // Red/blue underlines off; autocorrection while typing stays on (`autocorrectionType`).
        tv.spellCheckingType = .no
        if #available(iOS 18.0, *) {
            // Parity with macOS note body: custom TextKit stack + pill rewrites interact badly with
            // Writing Tools container coordination (see `HarvousNoteTextView` on macOS).
            tv.writingToolsBehavior = .none
        }
        tv.autocapitalizationType = .sentences
        tv.typingAttributes = [
            .font: bodyFont,
            .foregroundColor: UIColor.label,
            .paragraphStyle: para
        ]
        // Disable internal scroll so title and body scroll together in the outer SwiftUI ScrollView.
        tv.isScrollEnabled = false
        // On iPad split layout the Mac-style `NoteToolbar` lives at the editor's bottom — clear the
        // system `inputAssistantItem` shortcut bar so it doesn't shadow our own formatting toolbar.
        applyIPadSplitInputAssistantSuppression(to: tv)
        tv.delegate = context.coordinator
        context.coordinator.textView = tv
        let coordinator = context.coordinator
        tv.onHighlightCaptureAction = { [weak coordinator] in
            coordinator?.invokeHighlightCapturePromptFromEditMenuIfPossible()
        }
        tv.onNewStandaloneNoteAction = { [weak coordinator] in
            coordinator?.invokeNewStandaloneNoteFromEditMenuIfPossible()
        }
        tv.onConnectExistingNoteAction = { [weak coordinator] in
            DispatchQueue.main.async {
                coordinator?.proxy?.showConnectFromSelectionPicker = true
            }
        }
        tv.onRemoveIntersectingStudyHighlightsAction = { [weak coordinator] in
            coordinator?.invokeEraseInlineFormattingFromSelectionIfPossible()
        }
        context.coordinator.placeholderText = placeholder
        context.coordinator.proxy = proxy
        context.coordinator.wireFormatBarToProxy(proxy)
        proxy?.textView = tv
        if let p = proxy {
            let coord = context.coordinator
            p.scripturePillDeletionConfirmHandler = { [weak coord] in
                coord?.applyConfirmedScripturePillDeletion()
            }
        }
        // Keep body text start exactly aligned with the title field.
        tv.textContainer.lineFragmentPadding = 0
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

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 300
        let size = uiView.sizeThatFits(CGSize(width: width, height: UIView.layoutFittingExpandedSize.height))
        return CGSize(width: width, height: max(400, ceil(size.height)))
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        // `EditorState` is a reference type now; re-point the coordinator to the current instance (see
        // the macOS `updateNSView` note) so a note-switch reassignment can't leave it writing stale state.
        context.coordinator.state = state
        // Re-applied every update: a note can be opened for co-editing (or closed
        // again) while this view is on screen.
        if textView.isEditable != isEditable { textView.isEditable = isEditable }
        syncComposeTypographyForDynamicTypeIfNeeded(in: textView, context: context)
        applyIPadSplitInputAssistantSuppression(to: textView)
        var didSyncBodyFromState = false
        let previousTheme = context.coordinator.scriptureTheme
        context.coordinator.scriptureTheme = scriptureTheme
        let themeChanged = previousTheme != scriptureTheme
        context.coordinator.studyHighlightPaints = studyHighlightPaints
        context.coordinator.studyHighlightFocusedThreadId = studyHighlightFocusedThreadId
        context.coordinator.studyHighlightsAssumeDarkAppearance = studyHighlightsAssumeDarkAppearance

        context.coordinator.placeholderText = placeholder
        context.coordinator.onScripturePillTap = onScripturePillTap
        context.coordinator.onURLPillTap = onURLPillTap
        context.coordinator.onReferenceSuggestionTap = onReferenceSuggestionTap
        context.coordinator.onStudyHighlightTap = onStudyHighlightTap
        context.coordinator.pillAccentResolver = pillAccentResolver
        context.coordinator.onResolvedScripturePillPairs = onResolvedScripturePillPairs
        context.coordinator.onRemoveStudyHighlightThreadIds = onRemoveStudyHighlightThreadIds
        context.coordinator.proxy = proxy
        context.coordinator.wireFormatBarToProxy(proxy)
        proxy?.textView = textView
        let coord = context.coordinator
        if let p = proxy {
            p.syncPlainTextBindingFromTextView = { tv in
                coord.pushPlainTextAndRefsFromTextView(tv)
            }
            p.scripturePillDeletionConfirmHandler = { [weak coord] in
                coord?.applyConfirmedScripturePillDeletion()
            }
        }

        if let noteID, context.coordinator.boundNoteID != noteID {
            let currentPlain = harvousExpandedPlainText(in: textView.textStorage)
            let bodyUnchanged = documentBody == currentPlain
            context.coordinator.boundNoteID = noteID
            if bodyUnchanged {
                return
            }
            context.coordinator.invalidateDeferredNoteBindingWork()
            context.coordinator.isEditing = false
            context.coordinator.withProgrammaticBodyMutation {
                textView.textStorage.setAttributedString(NSAttributedString(string: ""))
                if documentBody.isEmpty {
                    textView.text = placeholder
                    textView.textColor = .tertiaryLabel
                    textView.selectedTextRange = textView.textRange(from: textView.beginningOfDocument, to: textView.beginningOfDocument)
                } else {
                    assignDocumentBody(
                        to: textView,
                        body: documentBody,
                        coordinator: context.coordinator,
                        withProgrammaticMutation: context.coordinator.withProgrammaticBodyMutation
                    )
                }
                if !documentBody.isEmpty {
                    context.coordinator.reapplyScripturePillsToBody(in: textView)
                }
                context.coordinator.paintStudyHighlights(on: textView)
            }
            if let p = proxy {
                DispatchQueue.main.async {
                    p.resetFormatBarStateForNewNote()
                    p.syncBodyFirstResponderState(textView: textView)
                }
            }
            return
        }
        if !context.coordinator.isEditing {
            let plainStorage = harvousExpandedPlainText(in: textView.textStorage)
            if plainStorage != state.plainText {
                let storageMatchesModel = plainStorage == documentBody
                let bindingBehindModel = state.plainText != documentBody
                if storageMatchesModel, bindingBehindModel {
                    didSyncBodyFromState = false
                } else {
                    context.coordinator.markNotPlaceholder()
                    assignDocumentBody(
                        to: textView,
                        body: state.plainText,
                        coordinator: context.coordinator,
                        withProgrammaticMutation: context.coordinator.withProgrammaticBodyMutation
                    )
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

        if themeChanged, textView.textColor != .tertiaryLabel {
            let st = textView.textStorage
            if st.length > 0 {
                let plain = harvousExpandedPlainText(in: st)
                if st.string.contains("\u{FFFC}") || !ScriptureDetector.detect(in: plain).isEmpty {
                    context.coordinator.reapplyScripturePillsToBody(in: textView)
                }
            }
        }
        // Match macOS: don't repaint study highlights on every keystroke. While the user is typing
        // the highlight set can't change; `textDidEndEditing` / highlight mutations repaint on blur.
        if !context.coordinator.isEditing {
            context.coordinator.paintStudyHighlights(on: textView)
        }
        if let body = textView as? HarvousBodyTextView {
            let coordinator = context.coordinator
            body.studyHighlightPaintsSnapshot = studyHighlightPaints
            body.onHighlightCaptureAction = { [weak coordinator] in
                coordinator?.invokeHighlightCapturePromptFromEditMenuIfPossible()
            }
            body.onNewStandaloneNoteAction = { [weak coordinator] in
                coordinator?.invokeNewStandaloneNoteFromEditMenuIfPossible()
            }
            body.onRemoveIntersectingStudyHighlightsAction = { [weak coordinator] in
                coordinator?.invokeEraseInlineFormattingFromSelectionIfPossible()
            }
        }
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate, UIGestureRecognizerDelegate, InlineImageRehydrateScheduling {
        var state: EditorState
        weak var textView: UITextView?
        weak var proxy: EditorProxy?
        var boundNoteID: UUID?
        var isEditing = false
        var scriptureTheme: HarvousColors.ThemeVariant = .blue
        var studyHighlightPaints: [StudyHighlightPaint] = []
        var studyHighlightFocusedThreadId: UUID?
        var studyHighlightsAssumeDarkAppearance: Bool = false
        var placeholderText: String = "What are you studying?"
        /// Mirrors macOS coordinator — refreshes compose fonts when Dynamic Type changes.
        var lastDynamicTypeSize: DynamicTypeSize?
        var onScripturePillTap: ((String, String, NSRange) -> Void)?
        var onURLPillTap: ((String, String?, String?, NSRange) -> Void)?
        var onReferenceSuggestionTap: ((String, NSRange) -> Void)?
        var onStudyHighlightTap: ((UUID) -> Void)?
        /// Resolver for per-note pill accents (see `HarvousEditor.pillAccentResolver`). Updated on every `updateUIView`.
        var pillAccentResolver: ((String) -> StudyHighlightAccentToken?)?
        var onResolvedScripturePillPairs: (([(reference: String, translation: String)]) -> Void)?
        var onRemoveStudyHighlightThreadIds: (([UUID]) -> Void)?
        private var debounceTask: Task<Void, Never>?
        private var referenceSuggestionDebounceTask: Task<Void, Never>?
        private var formatBarHideTask: Task<Void, Never>?
        private var inlineImageRehydrateTask: Task<Void, Never>?
        /// Bumped on note switch so deferred `Task`s from the previous note cannot write `state.plainText`.
        var noteBindingGeneration: UInt64 = 0
        /// Pauses scripture pill detection while Apple Writing Tools mutates the document (iOS 18+).
        private var isWritingToolsActive = false
        /// Last applied scripture-pill inputs (expanded plain text + theme). Gates the render-pass
        /// `reapplyScripturePillsToBody` so the regex sweep runs once per real change instead of every
        /// SwiftUI `updateUIView` pass — fixes the 100%-CPU re-entrant render loop on note open/edit.
        fileprivate var lastAppliedPillSignature: String?
        private var programmaticBodyMutationDepth: Int = 0
        private var isProgrammaticBodyMutation: Bool { programmaticBodyMutationDepth > 0 }

        func withProgrammaticBodyMutation(_ work: () -> Void) {
            programmaticBodyMutationDepth += 1
            work()
            programmaticBodyMutationDepth -= 1
        }

        /// Call when the document is real body text, not the placeholder string.
        func markNotPlaceholder() {
            guard let tv = textView, tv.textColor == .tertiaryLabel else { return }
            if tv.text == placeholderText {
                tv.text = ""
            }
            tv.textColor = .label
            applyDefaultBodyTypingAttributes(to: tv)
        }

        fileprivate func invalidateDeferredNoteBindingWork() {
            noteBindingGeneration &+= 1
            debounceTask?.cancel()
            debounceTask = nil
            referenceSuggestionDebounceTask?.cancel()
            referenceSuggestionDebounceTask = nil
            inlineImageRehydrateTask?.cancel()
            inlineImageRehydrateTask = nil
            lastAppliedPillSignature = nil
            cancelFormatBarHide()
        }

        func scheduleAsyncInlineImageRehydrate(on textView: HVTextView, payloads: [Data]) {
            inlineImageRehydrateTask?.cancel()
            let generation = noteBindingGeneration
            let payloadsCopy = payloads
            inlineImageRehydrateTask = Task { @MainActor [weak self, weak textView] in
                let validated: [Data] = await Task.detached(priority: .userInitiated) {
                    payloadsCopy.filter { payload in
                        NoteInlineImageSerialization.imageFromInlinePayload(payload) != nil
                    }
                }.value
                guard let self, !Task.isCancelled, generation == self.noteBindingGeneration else { return }
                guard let textView, textView === self.textView else { return }
                guard let tv = textView as? UITextView else { return }
                self.withProgrammaticBodyMutation {
                    applyInlineImagePlaceholders(in: tv.textStorage, payloads: validated)
                }
                tv.invalidateIntrinsicContentSize()
            }
        }

        /// Updates body / placeholder fonts when the user changes Larger Text.
        @MainActor
        func refreshComposeBodyTypography() {
            guard let tv = textView else { return }
            let f = HarvousFonts.noteComposeBodyUIFont()
            tv.font = f
            if tv.textColor == .tertiaryLabel {
                tv.typingAttributes = [
                    .font: f,
                    .foregroundColor: UIColor.tertiaryLabel,
                    .paragraphStyle: noteBodyParagraphStyle(),
                ]
            } else {
                applyDefaultBodyTypingAttributes(to: tv)
                (tv as? HarvousBodyTextView)?.refreshScripturePillRastersForCurrentAppearance()
            }
        }

        /// Instant scripture pill on Space/Enter/comma/period — cursor-scoped, no full-doc strip→reapply.
        @MainActor
        func handleScriptureBoundaryAtCursor(textView tv: UITextView, cursorUTF16: Int, isBoundaryTrigger: Bool) {
            guard tv.textColor != .tertiaryLabel else { return }
            guard !isProgrammaticBodyMutation else { return }
            let storage = tv.textStorage
            let scale = harvousEditorBackingScale(for: tv)
            var insertedRef: String?
            withProgrammaticBodyMutation {
                insertedRef = detectAndInsertPillAtCursor(
                    in: storage,
                    cursorUTF16: cursorUTF16,
                    isBoundaryTrigger: isBoundaryTrigger,
                    theme: scriptureTheme,
                    pillAccentResolver: pillAccentResolver,
                    backingScale: scale
                )
                guard insertedRef != nil else { return }
                paintStudyHighlights(on: tv)
            }
            guard insertedRef != nil else { return }
            let bindingGeneration = noteBindingGeneration
            let plain = harvousExpandedPlainText(in: storage)
            let refsOut = ScriptureDetector.uniqueDisplayRefs(in: plain)
            tv.invalidateIntrinsicContentSize()
            Task { @MainActor in
                guard bindingGeneration == self.noteBindingGeneration else { return }
                if self.state.plainText != plain { self.state.plainText = plain }
                if self.state.detectedRefs != refsOut { self.state.detectedRefs = refsOut }
            }
            onResolvedScripturePillPairs?(scripturePillRefTransPairs(in: storage))
            proxy?.refreshFormatState()
        }

        init(state: EditorState) {
            self.state = state
            super.init()
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleForceScripturePillRedetect(_:)),
                name: .harvousForceScripturePillRedetect,
                object: nil
            )
            // URL pill title resolved (Slice 3): update the matching attachment so the next tap
            // hands a non-nil title to `ActiveURLPillDock`.
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleURLLinkTitleResolved(_:)),
                name: .harvousURLLinkTitleResolved,
                object: nil
            )
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        @objc private func handleForceScripturePillRedetect(_ note: Notification) {
            MainActor.assumeIsolated {
                if let uuid = note.object as? UUID, let mine = boundNoteID, uuid != mine { return }
                guard let tv = textView else { return }
                detectAndInsertPills(in: tv, text: state.plainText)
            }
        }

        @objc private func handleURLLinkTitleResolved(_ note: Notification) {
            MainActor.assumeIsolated {
                guard let href = note.userInfo?["href"] as? String,
                      let title = note.userInfo?["title"] as? String,
                      let tv = textView else { return }
                let storage = tv.textStorage
                applyResolvedURLLinkTitle(title, forHref: href, in: storage)
            }
        }

        /// Hooks idle hide timer (`EditorProxy` Mac parity).
        func wireFormatBarToProxy(_ p: EditorProxy?) {
            guard let p else { return }
            p.cancelFormatBarHideAction = { [weak self] in self?.cancelFormatBarHide() }
            p.scheduleFormatBarHideAction = { [weak self] in self?.scheduleFormatBarHide() }
            p.triggerHighlightCapturePrompt = { [weak self] in
                self?.invokeHighlightCapturePromptFromEditMenuIfPossible()
            }
            p.triggerStandaloneNoteFromSelection = { [weak self] in
                self?.invokeNewStandaloneNoteFromEditMenuIfPossible()
            }
            p.triggerRemoveIntersectingStudyHighlightsFromSelection = { [weak self] in
                self?.invokeEraseInlineFormattingFromSelectionIfPossible()
            }
            p.repaintReferenceSuggestions = { [weak self] in
                guard let self, let tv = self.textView else { return }
                self.repaintReferenceSuggestionsOnly(on: tv)
            }
            p.syncStudyHighlightPaintsToEditor = { [weak self] paints in
                guard let self else { return }
                self.studyHighlightPaints = paints
                if let body = self.textView as? HarvousBodyTextView {
                    body.studyHighlightPaintsSnapshot = paints
                }
            }
            p.repaintStudyHighlights = { [weak self] in
                guard let self, let tv = self.textView else { return }
                self.paintStudyHighlights(on: tv)
            }
            p.captureBodySelectionForConnect = { [weak self, weak p] in
                guard let self, let p, let tv = self.textView else { return }
                let storage = tv.textStorage
                let storageRange = tv.selectedRange
                let expandedRange: NSRange
                switch HarvousStudyHighlightMapper.expandedRange(forStorageSelection: storageRange, in: storage) {
                case .success(let exp): expandedRange = exp
                case .failure: expandedRange = storageRange
                }
                let txt = (storage.string as NSString).substring(with: storageRange)
                p.capturedConnectExpandedRange = expandedRange
                p.capturedConnectSourceText = txt
            }
        }

        @MainActor
        func invokeEraseInlineFormattingFromSelectionIfPossible() {
            guard let tv = textView, tv.textColor != .tertiaryLabel else { return }
            invokeRemoveIntersectingStudyHighlightFromSelectionIfPossible()
            proxy?.clearRichFormattingInSelection()
        }

        @MainActor
        func invokeRemoveIntersectingStudyHighlightFromSelectionIfPossible() {
            guard let tv = textView, tv.textColor != .tertiaryLabel else { return }
            let storage = tv.textStorage
            let sel = tv.selectedRange
            let ids = HarvousStudyHighlightMapper.threadIdsIntersectingBodySelection(
                sel,
                paints: studyHighlightPaints,
                storage: storage
            )
            guard !ids.isEmpty else { return }
            onRemoveStudyHighlightThreadIds?(ids)
        }

        @MainActor
        func pushPlainTextAndRefsFromTextView(_ tv: UITextView) {
            let storage = tv.textStorage
            let plain = harvousExpandedPlainText(in: storage)
            state.plainText = plain
            state.detectedRefs = ScriptureDetector.uniqueDisplayRefs(in: plain)
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
                applyFormatBarHideIfNeeded()
            }
        }

        private func applyFormatBarHideIfNeeded() {
            guard let bodyProxy = proxy else { return }
            if bodyProxy.hasSelection { return }
            if bodyProxy.isPointerOverFormatToolbar { return }
            bodyProxy.showFormatBarForActivity = false
        }

        func invokeHighlightCapturePromptFromEditMenuIfPossible() {
            guard let tv = textView, tv.textColor != .tertiaryLabel else { return }
            HarvousStandaloneSelectionNote.postHighlightCapturePromptIfEligible(
                storage: tv.textStorage,
                utf16Selection: tv.selectedRange,
                parentNoteId: boundNoteID,
                anchorRectForPopover: proxy?.selectionViewportRect
            )
        }

        func invokeNewStandaloneNoteFromEditMenuIfPossible() {
            guard let tv = textView, tv.textColor != .tertiaryLabel else { return }
            let storage = tv.textStorage
            let sel = tv.selectedRange
            HarvousStandaloneSelectionNote.postIfEligibleCollapseSelection(
                storage: storage,
                utf16Selection: sel,
                collapseToEndUtf16: { end in
                    let safeEnd = max(0, min(end, storage.length))
                    tv.selectedRange = NSRange(location: safeEnd, length: 0)
                },
                collapseProxySelectionState: { [weak self] in
                    guard let proxy = self?.proxy else { return }
                    proxy.hasSelection = false
                    proxy.selectionViewportRect = nil
                    proxy.selectionCaretViewportRect = nil
                    proxy.refreshFormatState()
                }
            )
        }

        /// `UITextViewDelegate` attachment callbacks are unreliable for custom `NSTextAttachment`; use a tap gesture instead.
        @objc func handlePillTap(_ gesture: UITapGestureRecognizer) {
            guard gesture.state == .ended, let tv = textView, tv.textColor != .tertiaryLabel else { return }
            let point = gesture.location(in: tv)
            let storage = tv.textStorage
            guard storage.length > 0 else { return }

            // 1. Strict pill rect — avoids `utf16 ± 1` stealing taps on the first glyphs of a highlight after a pill.
            if let (pill, eff) = Self.scripturePillAtViewPoint(point, textView: tv, storage: storage) {
                tv.resignFirstResponder()
                onScripturePillTap?(pill.reference, pill.translation, eff)
                return
            }

            // 1b. URL pill — invoke the host's tap handler so it can open the inline
            // `ActiveURLPillDock` (Open / Remove / Edit). The dock owns the browser-open action;
            // mirrors how scripture pills route through the host (`onScripturePillTap`).
            if let (urlPill, eff) = Self.urlLinkPillAtViewPoint(point, textView: tv, storage: storage) {
                tv.resignFirstResponder()
                onURLPillTap?(urlPill.href, urlPill.title, urlPill.label, eff)
                return
            }

            // 2. Rect-based study highlights (parity with macOS `studyHighlightUUIDFromPaints`).
            if let uuid = studyHighlightUUIDAtViewPoint(point, textView: tv, storage: storage) {
                #if DEBUG
                print("[Harvous.highlight.tap.ios] RECT uuid=\(uuid) onStudyHighlightTap_set=\(onStudyHighlightTap != nil)")
                #endif
                // Capture viewport rect for the connected-note popup anchor.
                if let paint = studyHighlightPaints.first(where: { $0.threadId == uuid }) {
                    let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: paint.expandedUTF16Range, in: storage)
                    if let r = storRanges.first(where: { $0.location != NSNotFound && NSMaxRange($0) <= storage.length }) {
                        let rect = Self.firstRectInTextView(forUTF16Range: r, textView: tv)
                        if !rect.isEmpty { proxy?.tappedHighlightViewportRect = rect }
                    }
                }
                onStudyHighlightTap?(uuid)
                tv.resignFirstResponder()
                return
            }

            guard let pos = tv.closestPosition(to: point) else { return }
            let offset = tv.offset(from: tv.beginningOfDocument, to: pos)
            #if DEBUG
            print("[Harvous.highlight.tap.ios] offset=\(offset) paintsOnCoordinator=\(studyHighlightPaints.count) storageLen=\(storage.length)")
            #endif

            // Inline reference suggestion (dotted hint) — probe the tapped offset and offset-1
            // (trailing boundary). Tap saves the reference + opens the dock.
            if let hit = ReferenceSuggestionPainter.suggestionAt(storageUTF16Index: offset, in: storage)
                ?? (offset > 0 ? ReferenceSuggestionPainter.suggestionAt(storageUTF16Index: offset - 1, in: storage) : nil) {
                onReferenceSuggestionTap?(hit.slug, hit.range)
                tv.resignFirstResponder()
                return
            }

            // 3. Offset + slop — boundary taps on short runs; storage attrs may not round-trip TextKit 2.
            if let uuid = studyHighlightUUID(forStorageOffset: offset, in: storage) {
                #if DEBUG
                print("[Harvous.highlight.tap.ios] MATCH uuid=\(uuid) onStudyHighlightTap_set=\(onStudyHighlightTap != nil)")
                #endif
                // Use the tap point rect as fallback anchor for the connected-note popup.
                proxy?.tappedHighlightViewportRect = CGRect(x: point.x - 20, y: point.y - 12, width: 40, height: 24)
                onStudyHighlightTap?(uuid)
                tv.resignFirstResponder()
                return
            }

            #if DEBUG
            print("[Harvous.highlight.tap.ios] NO MATCH at offset=\(offset) — paints=\(studyHighlightPaints.map { ($0.threadId, $0.expandedUTF16Range) })")
            #endif
        }

        private static func firstRectInTextView(forUTF16Range range: NSRange, textView tv: UITextView) -> CGRect {
            guard range.location != NSNotFound,
                  NSMaxRange(range) <= tv.textStorage.length,
                  let dStart = tv.position(from: tv.beginningOfDocument, offset: range.location),
                  let dEnd = tv.position(from: tv.beginningOfDocument, offset: NSMaxRange(range)),
                  let tr = tv.textRange(from: dStart, to: dEnd)
            else { return .null }
            return tv.firstRect(for: tr)
        }

        /// View-local tap point vs rendered pill bounds (`UITextView.firstRect` is expressed in the text view).
        private static func scripturePillAtViewPoint(_ point: CGPoint, textView tv: UITextView, storage: NSTextStorage) -> (ScripturePillAttachment, NSRange)? {
            let end = storage.length
            var idx = 0
            while idx < end {
                var eff = NSRange()
                let val = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
                if let pill = val as? ScripturePillAttachment {
                    let rectInView = Self.firstRectInTextView(forUTF16Range: eff, textView: tv)
                    guard !rectInView.isEmpty, !rectInView.isNull else {
                        let next = NSMaxRange(eff)
                        if next <= idx { break }
                        idx = next
                        continue
                    }
                    if rectInView.contains(point) { return (pill, eff) }
                }
                let next = NSMaxRange(eff)
                if next <= idx { break }
                idx = next
            }
            return nil
        }

        /// View-local tap point vs rendered URL pill bounds. Mirrors `scripturePillAtViewPoint`.
        static func urlLinkPillAtViewPoint(_ point: CGPoint, textView tv: UITextView, storage: NSTextStorage) -> (URLLinkPillAttachment, NSRange)? {
            let end = storage.length
            var idx = 0
            while idx < end {
                var eff = NSRange()
                let val = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
                if let pill = val as? URLLinkPillAttachment {
                    let rectInView = Self.firstRectInTextView(forUTF16Range: eff, textView: tv)
                    guard !rectInView.isEmpty, !rectInView.isNull else {
                        let next = NSMaxRange(eff)
                        if next <= idx { break }
                        idx = next
                        continue
                    }
                    if rectInView.contains(point) { return (pill, eff) }
                }
                let next = NSMaxRange(eff)
                if next <= idx { break }
                idx = next
            }
            return nil
        }

        private func studyHighlightUUIDAtViewPoint(_ point: CGPoint, textView tv: UITextView, storage: NSTextStorage) -> UUID? {
            guard storage.length > 0 else { return nil }
            for paint in studyHighlightPaints {
                let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: paint.expandedUTF16Range, in: storage)
                for r in storRanges {
                    guard r.location != NSNotFound, NSMaxRange(r) <= storage.length else { continue }
                    let rectInView = Self.firstRectInTextView(forUTF16Range: r, textView: tv)
                    guard !rectInView.isEmpty, !rectInView.isNull else { continue }
                    let padded = rectInView.insetBy(dx: -2, dy: -3)
                    if padded.contains(point) { return paint.threadId }
                }
            }
            return nil
        }

        /// Returns the thread UUID whose painted range (from `studyHighlightPaints`) contains
        /// `storageOffset`, or `nil`. Boundary taps within ±1 UTF‑16 of a painted range still match
        /// so trailing-edge taps on short runs don't miss.
        private func studyHighlightUUID(forStorageOffset storageOffset: Int, in storage: NSTextStorage) -> UUID? {
            for paint in studyHighlightPaints {
                let storRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: paint.expandedUTF16Range, in: storage)
                for r in storRanges {
                    let lo = max(0, r.location - 1)
                    let hi = NSMaxRange(r) + 1
                    if storageOffset >= lo && storageOffset <= hi {
                        return paint.threadId
                    }
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

        /// Always allow the recognizer to begin. `handlePillTap` itself decides whether the tap lands on
        /// a scripture pill or a painted study highlight; normal taps fall through to UITextView's caret
        /// placement because `cancelsTouchesInView = false` and we run alongside via simultaneous recognition.
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let tv = textView, tv.textColor != .tertiaryLabel else { return false }
            return true
        }

        @MainActor
        func reapplyScripturePillsToBody(in textView: UITextView) {
            detectAndInsertPills(in: textView, text: state.plainText)
        }

        private func iosViewportRectForPillRanges(_ ranges: [NSRange], in tv: UITextView) -> CGRect? {
            var unionRect = CGRect.null
            let inset = tv.textContainerInset
            let origin = CGPoint(x: inset.left, y: inset.top)
            for r in ranges {
                guard r.length > 0, r.location != NSNotFound, NSMaxRange(r) <= tv.textStorage.length else { continue }
                var rect = CGRect.null
                if let dStart = tv.position(from: tv.beginningOfDocument, offset: r.location),
                   let dEnd = tv.position(from: dStart, offset: r.length),
                   let tr = tv.textRange(from: dStart, to: dEnd) {
                    let fr = tv.firstRect(for: tr)
                    if !fr.isNull, !fr.isEmpty { rect = fr }
                }
                if rect.isNull || rect.isEmpty {
                    let lm = tv.layoutManager
                    let tc = tv.textContainer
                    let glyphRange = lm.glyphRange(forCharacterRange: r, actualCharacterRange: nil)
                    let br = lm.boundingRect(forGlyphRange: glyphRange, in: tc)
                    if !br.isNull, !br.isEmpty {
                        rect = br.offsetBy(dx: origin.x, dy: origin.y)
                    }
                }
                guard !rect.isNull, !rect.isEmpty else { continue }
                unionRect = unionRect.isNull ? rect : unionRect.union(rect)
            }
            return unionRect.isNull ? nil : unionRect
        }

        func applyConfirmedScripturePillDeletion() {
            guard let proxy else { return }
            guard let prompt = proxy.scripturePillDeletionPrompt, let tv = textView else {
                proxy.scripturePillDeletionPrompt = nil
                return
            }
            let storage = tv.textStorage
            proxy.scripturePillDeletionPrompt = nil
            let sortedRanges = prompt.pillUTF16Ranges.sorted { $0.location > $1.location }
            withProgrammaticBodyMutation {
                for r in sortedRanges {
                    guard r.location != NSNotFound, r.length > 0, NSMaxRange(r) <= storage.length else { continue }
                    guard storage.attribute(.attachment, at: r.location, effectiveRange: nil) is ScripturePillAttachment else { continue }
                    storage.replaceCharacters(in: r, with: "")
                }
                pushPlainTextAndRefsFromTextView(tv)
                paintStudyHighlights(on: tv)
            }
            tv.invalidateIntrinsicContentSize()
            proxy.hvNotifyBodyChanged(tv)
            proxy.syncPlainTextBindingFromTextView?(tv)
            if let active = proxy.activeScripturePill,
               sortedRanges.contains(where: { NSIntersectionRange($0, active.attachmentRange).length > 0 }) {
                proxy.clearActiveScripturePill()
            }
            proxy.onScripturePillAttachmentRemoved?(sortedRanges)
            proxy.refreshFormatState()
        }

        func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
            guard !isProgrammaticBodyMutation else { return true }
            if textView.textColor == .tertiaryLabel { return true }
            let storage = textView.textStorage
            if storage.length > 0 {
                let hitRanges = harvousPillAttachmentRangesIntersectingIOS(range, in: storage)
                if !hitRanges.isEmpty {
                    guard let proxy else { return false }
                    let sortedHit = hitRanges.sorted { $0.location < $1.location }
                    let refs = sortedHit.compactMap { r -> String? in
                        (storage.attribute(.attachment, at: r.location, effectiveRange: nil) as? ScripturePillAttachment)?.reference
                    }
                    let refLabel = refs.first ?? "Scripture"
                    let anchor = iosViewportRectForPillRanges(sortedHit, in: textView)
                        ?? proxy.selectionViewportRect
                        ?? CGRect(x: 0, y: 24, width: 120, height: 22)
                    let prompt = ScripturePillDeletionPrompt(
                        reference: refLabel,
                        pillUTF16Ranges: sortedHit,
                        anchorViewportRect: anchor
                    )
                    Task { @MainActor in
                        proxy.scripturePillDeletionPrompt = prompt
                    }
                    return false
                }
            }

            if text == "\n" {
                if tryApplyListContinuationOnHardNewlineIOS(textView: textView, range: range) {
                    return false
                }
                handleScriptureBoundaryAtCursor(textView: textView, cursorUTF16: range.location, isBoundaryTrigger: true)
                return true
            }
            if text == " " {
                if tryApplyMarkdownListTriggerIOS(textView: textView, range: range) {
                    return false
                }
                scheduleScriptureBoundaryCheck(in: textView, afterInsertAt: range, text: text)
                return true
            }
            if text == "," || text == "." {
                scheduleScriptureBoundaryCheck(in: textView, afterInsertAt: range, text: text)
                return true
            }
            return true
        }

        /// Defers a cursor-scoped scripture-pill check until after UIKit has applied `text` at `range`,
        /// so the boundary character (Space/comma/period) is already in storage when detection runs.
        private func scheduleScriptureBoundaryCheck(in textView: UITextView, afterInsertAt range: NSRange, text: String) {
            let futureCursor = range.location + (text as NSString).length
            DispatchQueue.main.async { [weak self, weak textView] in
                guard let self, let textView, textView === self.textView else { return }
                self.handleScriptureBoundaryAtCursor(
                    textView: textView,
                    cursorUTF16: futureCursor,
                    isBoundaryTrigger: true
                )
            }
        }

        /// Return inside a `• `/`N. ` line: insert newline + continuing marker. Return on an empty list item exits the list.
        private func tryApplyListContinuationOnHardNewlineIOS(textView: UITextView, range: NSRange) -> Bool {
            let storage = textView.textStorage
            guard range.length == 0 else { return false }
            let loc = range.location
            let ns = storage.string as NSString
            guard ns.length > 0 else { return false }
            let paraAnchor = min(max(0, loc), ns.length - 1)
            let pr = ns.paragraphRange(for: NSRange(location: paraAnchor, length: 0))
            if storage.attribute(.attachment, at: pr.location, effectiveRange: nil) != nil { return false }
            let bLen = HVListSyntax.bulletPrefixLength(ns: ns, para: pr)
            let nLen = HVListSyntax.numberedPrefixLength(ns: ns, para: pr)
            guard let plen = bLen ?? nLen, loc >= pr.location + plen else { return false }

            // Empty list item (caret right after the prefix, nothing else on the line) → exit list.
            let trailingNewline = pr.length > 0 && ns.character(at: NSMaxRange(pr) - 1) == 10
            let paraTextLen = pr.length - (trailingNewline ? 1 : 0)
            if paraTextLen == plen, loc == pr.location + plen {
                withProgrammaticBodyMutation {
                    storage.deleteCharacters(in: NSRange(location: pr.location, length: plen))
                }
                textView.selectedRange = NSRange(location: pr.location, length: 0)
                proxy?.hvNotifyBodyChanged(textView)
                proxy?.refreshFormatState()
                return true
            }

            let savedParaStyle = storage.attribute(.paragraphStyle, at: pr.location, effectiveRange: nil) as? NSParagraphStyle
            let wasNumbered = nLen != nil
            let markerString: String
            if bLen != nil {
                markerString = "\u{2022} "
            } else if let nln = nLen, let v = HVListSyntax.numberedListStartValue(ns: ns, para: pr, prefixLength: nln) {
                markerString = "\(v + 1). "
            } else {
                return false
            }
            let combined = NSMutableAttributedString(string: "\n" + markerString, attributes: HVListSyntax.listMarkerAttributes())

            withProgrammaticBodyMutation {
                storage.replaceCharacters(in: range, with: combined)
                if let ps = savedParaStyle {
                    let live = storage.string as NSString
                    let newPara = live.paragraphRange(for: NSRange(location: min(loc + 1, max(0, live.length - 1)), length: 0))
                    storage.addAttribute(.paragraphStyle, value: ps, range: newPara)
                }
                if wasNumbered {
                    HVListSyntax.renumberNumberedListRun(storage: storage, anchorLocation: loc + 1)
                }
            }
            let caretPos = min(loc + combined.length, storage.length)
            textView.selectedRange = NSRange(location: caretPos, length: 0)
            proxy?.hvNotifyBodyChanged(textView)
            proxy?.refreshFormatState()
            return true
        }

        /// `- ` / `* ` / `+ ` / `N. ` typed at paragraph start: replace the prefix with a real list marker.
        private func tryApplyMarkdownListTriggerIOS(textView: UITextView, range: NSRange) -> Bool {
            let storage = textView.textStorage
            guard range.length == 0 else { return false }
            let loc = range.location
            guard loc > 0, loc <= storage.length else { return false }
            let ns = storage.string as NSString
            let pr = ns.paragraphRange(for: NSRange(location: loc - 1, length: 0))
            let p = pr.location
            guard loc > p else { return false }
            if storage.attribute(.attachment, at: p, effectiveRange: nil) != nil { return false }
            if HVListSyntax.bulletPrefixLength(ns: ns, para: pr) != nil { return false }
            let prefixLen = loc - p
            if prefixLen == 1 {
                let c = ns.character(at: p)
                if c == 45 || c == 42 || c == 43 {
                    let bullet = NSAttributedString(string: "\u{2022} ", attributes: HVListSyntax.listMarkerAttributes())
                    withProgrammaticBodyMutation {
                        storage.replaceCharacters(in: NSRange(location: p, length: 1), with: bullet)
                    }
                    textView.selectedRange = NSRange(location: p + bullet.length, length: 0)
                    proxy?.hvNotifyBodyChanged(textView)
                    proxy?.refreshFormatState()
                    return true
                }
            }
            if let dotLen = HVListSyntax.numberedDigitDotPrefixLength(ns: ns, paraStart: p, caret: loc) {
                let digitsDot = ns.substring(with: NSRange(location: p, length: dotLen))
                let replacement = NSAttributedString(string: digitsDot + " ", attributes: HVListSyntax.listMarkerAttributes())
                withProgrammaticBodyMutation {
                    storage.replaceCharacters(in: NSRange(location: p, length: dotLen), with: replacement)
                }
                textView.selectedRange = NSRange(location: p + replacement.length, length: 0)
                proxy?.hvNotifyBodyChanged(textView)
                proxy?.refreshFormatState()
                return true
            }
            return false
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            isEditing = true
            if textView.textColor == .tertiaryLabel {
                textView.text = ""
                textView.textColor = .label
                applyDefaultBodyTypingAttributes(to: textView)
                textView.selectedRange = NSRange(location: 0, length: 0)
            }
            let editorProxy = self.proxy
            Task { @MainActor in
                editorProxy?.isBodyFirstResponder = true
                editorProxy?.formatBarUnlocked = true
                editorProxy?.showFormatBarForActivity = true
                editorProxy?.refreshFormatState()
                self.scheduleFormatBarHide()
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
            let selectedRange = textView.selectedRange
            let hasSelection = selectedRange.length > 0
            var viewportRect: CGRect? = nil
            if hasSelection, let start = textView.selectedTextRange?.start, let end = textView.selectedTextRange?.end {
                let startRect = textView.caretRect(for: start)
                let endRect = textView.caretRect(for: end)
                let unionRect = startRect.union(endRect)
                viewportRect = unionRect.isNull || unionRect.isEmpty ? nil : unionRect
            }
            let editorProxy = self.proxy
            Task { @MainActor in
                let adjacent = activeScripturePillFromUITextViewSelection(textView)
                if adjacent == nil {
                    editorProxy?.activeScripturePill = nil
                }
                editorProxy?.hasSelection = hasSelection
                editorProxy?.selectionViewportRect = viewportRect
                editorProxy?.refreshFormatState()
                if hasSelection {
                    editorProxy?.preferOrbChromeUntilNextFormatSignal = false
                    editorProxy?.formatBarUnlocked = true
                    self.cancelFormatBarHide()
                } else if editorProxy?.isBodyFirstResponder == true {
                    editorProxy?.formatBarUnlocked = true
                    editorProxy?.showFormatBarForActivity = true
                    self.scheduleFormatBarHide()
                }
            }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            isEditing = false
            cancelFormatBarHide()
            let hint = placeholderText
            if textView.text.isEmpty {
                textView.text = hint
                textView.textColor = .tertiaryLabel
                textView.selectedRange = NSRange(location: 0, length: 0)
            } else {
                paintStudyHighlights(on: textView)
            }
            let editorProxy = self.proxy
            Task { @MainActor in
                editorProxy?.hasSelection = false
                editorProxy?.selectionViewportRect = nil
                editorProxy?.isBodyFirstResponder = false
                editorProxy?.showFormatBarForActivity = false
                editorProxy?.refreshFormatState()
            }
        }

        func textViewDidChange(_ textView: UITextView) {
            guard textView.textColor != .tertiaryLabel else { return }
            let plain = harvousExpandedPlainText(in: textView.textStorage)
            let bindingGeneration = noteBindingGeneration
            // Tell SwiftUI the text view height may have changed so the outer ScrollView resizes.
            textView.invalidateIntrinsicContentSize()
            Task { @MainActor in
                guard bindingGeneration == self.noteBindingGeneration else { return }
                self.state.plainText = plain
                self.proxy?.preferOrbChromeUntilNextFormatSignal = false
                self.proxy?.formatBarUnlocked = true
                self.proxy?.showFormatBarForActivity = true
                self.proxy?.refreshFormatState()
                self.scheduleFormatBarHide()
            }

            scheduleDebouncedReferenceSuggestionRepaint(
                textView: textView,
                bindingGeneration: bindingGeneration
            )
            debounceTask?.cancel()
            if isWritingToolsActive { return }
            debounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                guard bindingGeneration == self.noteBindingGeneration else { return }
                self.detectAndInsertPills(in: textView, text: plain)
            }
        }

        @available(iOS 18.0, *)
        func textViewWritingToolsWillBegin(_ textView: UITextView) {
            isWritingToolsActive = true
            debounceTask?.cancel()
            debounceTask = nil
            cancelFormatBarHide()
        }

        @available(iOS 18.0, *)
        func textViewWritingToolsDidEnd(_ textView: UITextView) {
            isWritingToolsActive = false
            let plain = harvousExpandedPlainText(in: textView.textStorage)
            let bindingGeneration = noteBindingGeneration
            Task { @MainActor in
                guard bindingGeneration == self.noteBindingGeneration else { return }
                self.state.plainText = plain
                self.detectAndInsertPills(in: textView, text: plain)
                self.proxy?.refreshFormatState()
            }
        }

        /// Attribute-only suggestion repaint (no highlight strip or pill strip→reapply).
        @MainActor
        func repaintReferenceSuggestionsOnly(on textView: UITextView) {
            ReferenceSuggestionPainter.applySuggestions(
                storage: textView.textStorage,
                isDark: studyHighlightsAssumeDarkAppearance
            )
        }

        private func scheduleDebouncedReferenceSuggestionRepaint(
            textView: UITextView,
            bindingGeneration: UInt64
        ) {
            referenceSuggestionDebounceTask?.cancel()
            referenceSuggestionDebounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                guard bindingGeneration == self.noteBindingGeneration else { return }
                guard textView === self.textView, textView.textColor != .tertiaryLabel else { return }
                self.repaintReferenceSuggestionsOnly(on: textView)
            }
        }

        /// Mirrors macOS Coordinator — paints pastel highlight markers after scripture pill passes.
        @MainActor
        func paintStudyHighlights(on textView: UITextView) {
            let storage = textView.textStorage
            if studyHighlightPaints.isEmpty {
                HarvousStudyHighlightMapper.stripPainting(from: storage, fullDocumentRange: NSRange(location: 0, length: storage.length))
            } else {
                let anchors = studyHighlightPaints.map {
                    (id: $0.threadId, kind: $0.entryKind, accent: $0.accent, expandedRange: $0.expandedUTF16Range)
                }
                HarvousStudyHighlightMapper.applyHighlights(
                    storage: storage,
                    anchors: anchors,
                    isDark: studyHighlightsAssumeDarkAppearance,
                    focusedThreadId: studyHighlightFocusedThreadId
                )
            }
            // Inline reference suggestions (dotted hints) repaint on top of saved highlights;
            // skipped on words already inside a highlight/pill. Presentation-only, never serialized.
            ReferenceSuggestionPainter.applySuggestions(storage: storage, isDark: studyHighlightsAssumeDarkAppearance)
        }

        @MainActor
        private func detectAndInsertPills(in textView: UITextView, text: String) {
            withProgrammaticBodyMutation {
            _ = text

            let storage = textView.textStorage
            var translationQueue = scripturePillRefTransPairs(in: storage)
            let fullRange = NSRange(location: 0, length: storage.length)

            var pillRanges: [NSRange] = []
            storage.enumerateAttribute(.attachment, in: fullRange) { value, range, _ in
                if value is ScripturePillAttachment { pillRanges.append(range) }
            }
            storage.beginEditing()
            for range in pillRanges.reversed() {
                if let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment {
                    storage.replaceCharacters(in: range, with: pill.reference)
                }
            }
            storage.endEditing()

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

            storage.beginEditing()
            for item in pillInserts.sorted(by: { $0.range.location > $1.range.location }) {
                let pill = ScripturePillAttachment(
                    reference: item.displayRef,
                    translation: item.translation,
                    theme: scriptureTheme,
                    accent: pillAccentResolver?(item.displayRef),
                    backingScale: harvousEditorBackingScale(for: textView)
                )
                let pillStr = NSMutableAttributedString(attachment: pill)
                let pillBodyFont = HarvousFonts.noteComposeBodyPlatformFont()
                var pillAttrs: [NSAttributedString.Key: Any] = [.font: pillBodyFont]
                let pillLoc = item.range.location
                if pillLoc < storage.length,
                   let ps = storage.attribute(.paragraphStyle, at: pillLoc, effectiveRange: nil) as? NSParagraphStyle {
                    pillAttrs[.paragraphStyle] = ps
                }
                pillStr.addAttributes(pillAttrs, range: NSRange(location: 0, length: pillStr.length))
                storage.replaceCharacters(in: item.range, with: pillStr)
            }
            removeDuplicateTranslationAfterPillAttachments(in: storage)

            // URL pill detection runs in the same edit pass so the layout manager performs a single
            // layout flush. Scripture pills win any overlap via `protectedRanges` inside the helper.
            // `titleResolver` restores cached titles after re-detection (note switch / typing pass).
            let bodyFontForURL: UIFont = HarvousFonts.noteComposeBodyPlatformFont()
            // Defensive migration: any `.link`-attributed run becomes a labeled pill first so the
            // editor never displays the default blue/underline link styling.
            convertLinkAttributedRunsToURLLinkPills(in: storage, bodyFont: bodyFontForURL)
            detectAndInsertURLLinkPills(
                in: storage,
                bodyFont: bodyFontForURL,
                titleResolver: { URLLinkTitleService.shared.cachedTitle(for: $0) }
            )
            // Async title resolution for any pill still lacking a cached title.
            for range in rangesOfURLLinkPillAttachments(in: storage) {
                if let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? URLLinkPillAttachment,
                   pill.title == nil {
                    URLLinkTitleService.shared.ensureResolved(for: pill.href)
                }
            }

            storage.endEditing()
            applyDefaultBodyTypingAttributes(to: textView)
            paintStudyHighlights(on: textView)

            // Programmatic `textStorage` edits may not call `textViewDidChange`; keep binding in sync
            // (expand pills to real text) or `updateUIView` can reset the text view and remove pills.
            // Defer `state` writes so `updateUIView` never mutates SwiftUI bindings synchronously.
            let plainOut = harvousExpandedPlainText(in: storage)
            // Dedupe before propagating to `Note.detectedRefs` — see ScriptureDetector.uniqueDisplayRefs comment.
            // `freshMatches` itself stays as-is so per-pill placement above retains every occurrence.
            var seenRefs = Set<String>()
            let refsOut = freshMatches.map(\.displayText).filter { seenRefs.insert($0).inserted }
            let bindingGeneration = noteBindingGeneration
            Task { @MainActor in
                guard bindingGeneration == self.noteBindingGeneration else { return }
                // Idempotency guard (fixes 100%-CPU main-thread beachball when editing existing
                // synced notes). Pill re-application is idempotent, so at steady state
                // `plainOut`/`refsOut` already equal `state`. Assigning unconditionally still
                // re-commits SwiftUI → re-enters updateNSView → reapplyScripturePillsToBody →
                // detectAndInsertPillsImpl → here again, forming an unbounded render loop. Only
                // write when a value actually changed so the cycle ends at the expansion fixpoint.
                if self.state.plainText != plainOut {
                    self.state.plainText = plainOut
                }
                if self.state.detectedRefs != refsOut {
                    self.state.detectedRefs = refsOut
                }
            }
            let pairs = scripturePillRefTransPairs(in: storage)
            onResolvedScripturePillPairs?(pairs)
            }
        }
    }
}
#endif
