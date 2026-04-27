import Combine
import Foundation

#if os(macOS)
import AppKit
import UniformTypeIdentifiers

/// Attributes at the caret / in the selection, for toolbar toggle highlighting.
struct FormatToolbarState: Equatable {
    var isBold = false
    var isItalic = false
    var isStrikethrough = false
    /// Matched when the dominant font matches `HarvousFonts.headingFont` levels 2…4 (body only; title is separate).
    var headingLevel: Int?
    var isIndented = false
}

/// Observable proxy bridging SwiftUI toolbar buttons to the live NSTextView.
@MainActor
final class EditorProxy: ObservableObject {
    weak var textView: NSTextView?

    @Published var hasSelection: Bool = false
    @Published var selectionContentPoint: CGPoint? = nil

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

    /// HarvousEditor assigns this so `replaceActiveScripturePill` can refresh `EditorState` before the next `updateNSView` syncs stale `plainText` from SwiftUI and wipes the pill.
    var syncPlainTextBindingFromTextView: ((NSTextView) -> Void)?

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
        isPointerOverFormatToolbar = false
        showAddLinkSheet = false
        activeScripturePill = nil
        cancelFormatBarHideAction?()
    }

    func clearActiveScripturePill() {
        activeScripturePill = nil
    }

    /// Replaces the focused inline pill with a new reference + translation and keeps it selected.
    func replaceActiveScripturePill(reference: String, translation: String) {
        guard let tv = textView, let storage = tv.textStorage, let active = activeScripturePill else { return }
        let range = active.attachmentRange
        guard range.location != NSNotFound, NSMaxRange(range) <= storage.length else { return }

        let pill = ScripturePillAttachment(reference: reference, translation: translation)
        let pillStr = NSMutableAttributedString(attachment: pill)
        let bodyFont = HarvousFonts.system(size: 16, weight: 400)
        pillStr.addAttributes([.font: bodyFont], range: NSRange(location: 0, length: pillStr.length))

        storage.beginEditing()
        storage.replaceCharacters(in: range, with: pillStr)
        storage.endEditing()
        tv.didChangeText()
        removeDuplicateTranslationAfterPillAttachments(in: storage)

        syncPlainTextBindingFromTextView?(tv)

        let newRange = NSRange(location: range.location, length: pillStr.length)
        activeScripturePill = ActiveScripturePill(attachmentRange: newRange, reference: reference, translation: translation)
        tv.setSelectedRange(newRange)
        refreshFormatState()
    }

    /// Aligns with `window?.firstResponder` so stale key state can’t make the title field look like the body is key.
    func syncBodyFirstResponderState(textView: NSTextView) {
        isBodyFirstResponder = (textView.window?.firstResponder as AnyObject?) === (textView as AnyObject)
    }

    var cancelFormatBarHideAction: (() -> Void)?
    var scheduleFormatBarHideAction: (() -> Void)?

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
        guard let tv = textView, let win = tv.window else { return }
        win.makeFirstResponder(tv)
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
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = tv.selectedRange()
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

    func heading(_ level: Int) {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let lv = max(2, min(level, 4))
        // Tap active heading again => return to default body style.
        if headingLevelActive(range: tv.selectedRange(), tv: tv, storage: storage) == lv {
            bodyText()
            return
        }
        let font = HarvousFonts.headingFont(level: lv)
        let paraRange = (storage.string as NSString).paragraphRange(for: tv.selectedRange())
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
        guard let tv = textView, let storage = tv.textStorage else { return }
        let bodyFont = HarvousFonts.system(size: 16, weight: 400)
        let paraRange = (storage.string as NSString).paragraphRange(for: tv.selectedRange())
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

    func indent() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let paraRange = (storage.string as NSString).paragraphRange(for: tv.selectedRange())
        let existing = storage.attribute(.paragraphStyle, at: paraRange.location, effectiveRange: nil)
        let mutable = (existing as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle
                      ?? NSMutableParagraphStyle()
        mutable.firstLineHeadIndent += 20
        mutable.headIndent += 20
        storage.beginEditing()
        storage.addAttribute(.paragraphStyle, value: mutable, range: paraRange)
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    func insertCode() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = tv.selectedRange()
        let mono = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
        let bg   = NSColor.quaternaryLabelColor.withAlphaComponent(0.25)
        storage.beginEditing()
        if range.length > 0 {
            storage.addAttribute(.font, value: mono, range: range)
            storage.addAttribute(.backgroundColor, value: bg, range: range)
        } else {
            let snippet = NSAttributedString(string: "code", attributes: [.font: mono, .backgroundColor: bg])
            storage.replaceCharacters(in: range, with: snippet)
            tv.setSelectedRange(NSRange(location: range.location, length: 4))
        }
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    func insertDivider() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = tv.selectedRange()
        let para = noteBodyParagraphStyleForInserts()
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.system(size: 16, weight: 400),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: para
        ]
        let rule = NSAttributedString(attachment: HorizontalRuleAttachment())
        let full = NSMutableAttributedString(string: "\n", attributes: body)
        full.append(rule)
        full.append(NSAttributedString(string: "\n", attributes: body))
        storage.beginEditing()
        storage.replaceCharacters(in: range, with: full)
        storage.endEditing()
        tv.setSelectedRange(NSRange(location: range.location + full.length, length: 0))
        notifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    /// Presents the compact “Add link” sheet (URL + display name). Call `applyAddLinkFromSheet` / `removeLinkFromAddLinkSheet` / `cancelAddLinkSheet` from the sheet.
    func addOrEditLink() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        var range = tv.selectedRange()
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
        guard let tv = textView, let storage = tv.textStorage else { cancelAddLinkSheet(); return }
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
            tv.setSelectedRange(NSRange(location: loc + newLen, length: 0))
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
            tv.setSelectedRange(NSRange(location: r.location, length: newLen))
        }
        storage.endEditing()
        addLinkPendingRange = .init(location: NSNotFound, length: 0)
        showAddLinkSheet = false
        notifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    func removeLinkFromAddLinkSheet() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = addLinkPendingRange
        guard range.location != NSNotFound, !addLinkIsInsertion, range.length > 0, NSMaxRange(range) <= storage.length else { cancelAddLinkSheet(); return }
        storage.beginEditing()
        storage.removeAttribute(.link, range: range)
        storage.endEditing()
        addLinkPendingRange = .init(location: NSNotFound, length: 0)
        showAddLinkSheet = false
        notifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    func insertImage() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.canCreateDirectories = false
        panel.allowedContentTypes = [.image, .png, .jpeg, .tiff, .gif, .heic, .webP]
        guard panel.runModal() == .OK, let url = panel.url,
              let data = try? Data(contentsOf: url), let image = NSImage(data: data) else { return }
        let att = NSAttributedString(attachment: NoteInlineImageAttachment(image: image))
        let range = tv.selectedRange()
        storage.beginEditing()
        storage.replaceCharacters(in: range, with: att)
        storage.endEditing()
        tv.setSelectedRange(NSRange(location: range.location + att.length, length: 0))
        notifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

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
        if storage.length == 0 {
            return [
                .font: HarvousFonts.system(size: 16, weight: 400),
                .foregroundColor: NSColor.labelColor,
                .paragraphStyle: para
            ]
        }
        let i = min(max(loc, 0), max(storage.length - 1, 0))
        return storage.attributes(at: i, effectiveRange: nil)
    }

    private func notifyBodyChanged(_ tv: NSTextView) {
        tv.didChangeText()
    }

    /// Font trait toggling: avoid `enumerateAttribute` (its closure is `@Sendable` and trips Swift 6 actor checks).
    private func toggleTrait(rawValue: UInt) {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = tv.selectedRange()
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
            let font  = (value as? NSFont) ?? HarvousFonts.system(size: 15, weight: 400)
            let sub   = NSIntersectionRange(eff, range)
            if sub.length > 0 {
                let hasTrait = manager.traits(of: font).contains(mask)
                let newFont  = hasTrait
                    ? manager.convert(font, toNotHaveTrait: mask)
                    : manager.convert(font, toHaveTrait: mask)
                storage.addAttribute(.font, value: newFont, range: sub)
            }
            let next = NSMaxRange(eff)
            if next <= idx { break }
            idx = next
        }
        storage.endEditing()
    }

    private func listPrefixAttributes() -> [NSAttributedString.Key: Any] {
        [.font: HarvousFonts.system(size: 15, weight: 400)]
    }

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
        guard let tv = textView, let storage = tv.textStorage else { return }
        let ns = storage.string as NSString
        let paras = paragraphRangesCovering(selection: tv.selectedRange(), ns: ns)
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
        guard let tv = textView, let storage = tv.textStorage else { return }
        let ns = storage.string as NSString
        let paras = paragraphRangesCovering(selection: tv.selectedRange(), ns: ns)
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
        guard let tv = textView, let storage = tv.textStorage else { return FormatToolbarState() }
        let mgr = NSFontManager.shared
        let range = tv.selectedRange()
        let bold = traitActive(mask: .boldFontMask, range: range, tv: tv, storage: storage, mgr: mgr)
        let italic = traitActive(mask: .italicFontMask, range: range, tv: tv, storage: storage, mgr: mgr)
        let strike = strikethroughActive(range: range, tv: tv, storage: storage)
        let heading = headingLevelActive(range: range, tv: tv, storage: storage)
        let indent = indentActive(tv: tv, storage: storage)
        return FormatToolbarState(
            isBold: bold,
            isItalic: italic,
            isStrikethrough: strike,
            headingLevel: heading,
            isIndented: indent
        )
    }

    private func traitActive(
        mask: NSFontTraitMask,
        range: NSRange,
        tv: NSTextView,
        storage: NSTextStorage,
        mgr: NSFontManager
    ) -> Bool {
        // Heading styles use semibold weights; NSFontManager still reports `.boldFontMask` — do not treat that as the Bold toggle.
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

    private func strikethroughActive(range: NSRange, tv: NSTextView, storage: NSTextStorage) -> Bool {
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

    /// Uses the font at the insertion point / selection start (same idea as the rest of the bar).
    private func headingLevelActive(range: NSRange, tv: NSTextView, storage: NSTextStorage) -> Int? {
        if range.length == 0 {
            let font = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
            return HarvousFonts.bodyHeadingLevel(matching: font)
        }
        guard storage.length > 0 else { return nil }
        let loc = min(max(range.location, 0), storage.length - 1)
        let font = (storage.attribute(.font, at: loc, effectiveRange: nil) as? NSFont) ?? HarvousFonts.system(size: 16, weight: 400)
        return HarvousFonts.bodyHeadingLevel(matching: font)
    }

    private func indentActive(tv: NSTextView, storage: NSTextStorage) -> Bool {
        let sel = tv.selectedRange()
        let para = (storage.string as NSString).paragraphRange(for: sel)
        guard para.length > 0 else { return false }
        let style = storage.attribute(.paragraphStyle, at: para.location, effectiveRange: nil) as? NSParagraphStyle
        return (style?.firstLineHeadIndent ?? 0) > 0.5 || (style?.headIndent ?? 0) > 0.5
    }
}

// MARK: - Block / inline attachments

/// Shared color and rule weight for `HorizontalRuleAttachment` and `NoteInlineImageAttachment` borders.
private enum NoteBodyBlockChrome {
    static let separator = NSColor.separatorColor
    /// Horizontal rule bar height — image stroke uses the same for a matching look.
    static let lineThickness: CGFloat = 1
}

/// Renders a horizontal rule the width of the line fragment.
final class HorizontalRuleAttachment: NSTextAttachment {
    init() {
        super.init(data: nil, ofType: nil)
        let w: CGFloat = 8
        let h: CGFloat = 8
        self.image = NSImage(size: NSSize(width: w, height: h), flipped: false) { rect in
            NoteBodyBlockChrome.separator.setFill()
            let t = NoteBodyBlockChrome.lineThickness
            let y = (rect.height - t) * 0.5
            NSRect(x: 0, y: y, width: rect.width, height: t).fill()
            return true
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func attachmentBounds(
        for textContainer: NSTextContainer?,
        proposedLineFragment lineFrag: CGRect,
        glyphPosition position: CGPoint,
        characterIndex charIndex: Int
    ) -> CGRect {
        let w = max(lineFrag.width, 1)
        let f = HarvousFonts.system(size: 16, weight: 400)
        let h: CGFloat = 22
        return CGRect(x: 0, y: f.descender, width: w, height: h)
    }
}

/// Inline image with max content width, rounded corners, and a solid border.
final class NoteInlineImageAttachment: NSTextAttachment {
    private static let maxInnerWidth: CGFloat = 400
    private static let maxCornerRadius: CGFloat = 8

    init(image: NSImage) {
        super.init(data: nil, ofType: nil)
        let s = image.size
        guard s.width > 0, s.height > 0 else { return }
        let scale = min(1, Self.maxInnerWidth / s.width)
        let tw = s.width * scale
        let th = s.height * scale
        let b = NoteBodyBlockChrome.lineThickness
        let r = min(Self.maxCornerRadius, max(2, min(tw, th) * 0.04))
        let outW = tw + 2 * b
        let outH = th + 2 * b

        self.image = NSImage(size: NSSize(width: outW, height: outH), flipped: false) { _ in
            let content = NSRect(x: b, y: b, width: tw, height: th)
            let clip = NSBezierPath(roundedRect: content, xRadius: r, yRadius: r)
            NSGraphicsContext.saveGraphicsState()
            clip.addClip()
            let src = NSRect(origin: .zero, size: s)
            image.draw(in: content, from: src, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
            NSGraphicsContext.restoreGraphicsState()

            let border = NSBezierPath(roundedRect: content, xRadius: r, yRadius: r)
            border.lineWidth = b
            border.lineJoinStyle = .round
            NoteBodyBlockChrome.separator.setStroke()
            border.stroke()
            return true
        }

        let f = HarvousFonts.system(size: 16, weight: 400)
        self.bounds = CGRect(x: 0, y: f.descender, width: outW, height: outH)
    }

    required init?(coder: NSCoder) { fatalError() }
}
#endif
