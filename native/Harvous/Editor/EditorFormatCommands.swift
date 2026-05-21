import Foundation
import SwiftUI
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#elseif os(iOS)
import UIKit
#endif

// MARK: - Format commands + toolbar state
extension EditorProxy {

    // MARK: - Toolbar refresh

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

    // MARK: - Clear selection formatting

    /// Strips toolbar formatting (bold, links, code background, etc.) in the current multi-character selection.
    /// Study highlight paint (`.harvousStudyHighlightUUID`) is preserved; removing highlights remains the DB-backed path.
    func clearRichFormattingInSelection() {
        guard let (tv, storage) = textViewPair() else { return }
        let range = caretRange(for: tv)
        guard range.length > 0, NSMaxRange(range) <= storage.length else { return }
        guard HarvousBodyRichTextDiagnostics.selectionIntersectsClearableFormatting(storage: storage, utf16Range: range) else { return }
        storage.beginEditing()
        stripClearableFormattingRuns(in: storage, utf16Range: range)
        storage.endEditing()
        hvNotifyBodyChanged(tv)
        syncPlainTextBindingFromTextView?(tv)
        refreshFormatState()
    }

    private func stripClearableFormattingRuns(in storage: NSTextStorage, utf16Range range: NSRange) {
        var idx = range.location
        let rangeEnd = NSMaxRange(range)
        while idx < rangeEnd {
            var eff = NSRange()
            if storage.attribute(.attachment, at: idx, effectiveRange: &eff) != nil {
                let next = NSMaxRange(eff)
                idx = next > idx ? next : idx + 1
                continue
            }
            storage.attributes(at: idx, effectiveRange: &eff)
            let sub = NSIntersectionRange(eff, range)
            guard sub.length > 0 else {
                let next = NSMaxRange(eff)
                idx = next > idx ? next : idx + 1
                continue
            }
            let attrs = storage.attributes(at: sub.location, effectiveRange: nil)
            storage.setAttributes(clearedBodyAttributes(from: attrs), range: sub)
            let next = NSMaxRange(eff)
            idx = next > idx ? next : idx + 1
        }
    }

    private func clearedBodyAttributes(from attrs: [NSAttributedString.Key: Any]) -> [NSAttributedString.Key: Any] {
#if os(macOS)
        let labelColor: Any = NSColor.labelColor
#elseif os(iOS)
        let labelColor: Any = UIColor.label
#endif
        let bodyFont = HarvousFonts.noteComposeBodyPlatformFont()
        let para = noteBodyParagraphStyleForInserts()

        if let uuid = attrs[.harvousStudyHighlightUUID] as? String, !uuid.isEmpty {
            var out: [NSAttributedString.Key: Any] = [
                .font: bodyFont,
                .paragraphStyle: para,
                .harvousStudyHighlightUUID: uuid
            ]
            if let bg = attrs[.backgroundColor] { out[.backgroundColor] = bg }
            if let us = attrs[.underlineStyle] { out[.underlineStyle] = us }
            if let uc = attrs[.underlineColor] { out[.underlineColor] = uc }
            if let fg = attrs[.foregroundColor] { out[.foregroundColor] = fg }
            return out
        }

        return [
            .font: bodyFont,
            .foregroundColor: labelColor,
            .paragraphStyle: para
        ]
    }

    // MARK: - Headings

    func heading(_ level: Int) {
        guard let (tv, storage) = textViewPair() else { return }
        let lv = max(2, min(level, 4))
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
        let bodyFont = HarvousFonts.noteComposeBodyPlatformFont()
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
            setCaret(for: tv, NSRange(location: range.location, length: 4))
        }
        storage.endEditing()
        refocusTextView()
        refreshFormatState()
    }

    func insertNoteWikilink(title rawTitle: String) {
        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        guard let (tv, storage) = textViewPair() else { return }
        let range = caretRange(for: tv)
        let snippet = "[[\(title)]]"
#if os(macOS)
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: NSColor.labelColor
        ]
#else
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
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
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: NSColor.labelColor,
            .paragraphStyle: para
        ]
#else
        let body: [NSAttributedString.Key: Any] = [
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
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
        setCaret(for: tv, NSRange(location: range.location + full.length, length: 0))
        hvNotifyBodyChanged(tv)
        refocusTextView()
        refreshFormatState()
    }

    // MARK: - Link sheet

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
            setCaret(for: tv, NSRange(location: loc + newLen, length: 0))
        } else {
            let r = range
            if urlT.isEmpty {
                if resolvedName == addLinkInitialSelectedText {
                    storage.removeAttribute(.link, range: r)
                } else {
                    var attrs = storage.attributes(at: r.location, effectiveRange: nil)
                    attrs.removeValue(forKey: .link)
                    storage.replaceCharacters(in: r, with: NSAttributedString(string: resolvedName, attributes: attrs))
                }
            } else {
                var base = defaultBodyTypingAttributes(in: storage, at: r.location)
                if let u = Self.urlForLink(urlT) { base[.link] = u } else { base[.link] = urlT as NSString }
                storage.replaceCharacters(in: r, with: NSAttributedString(string: resolvedName, attributes: base))
            }
            let newLen = (resolvedName as NSString).length
            setCaret(for: tv, NSRange(location: r.location, length: newLen))
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

    // MARK: - Image insert

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

    // MARK: - Toolbar state

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
                let font = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
                if HarvousFonts.bodyHeadingLevel(matching: font) != nil { return false }
                return mgr.traits(of: font).contains(mask)
            }
            let end = NSMaxRange(range)
            var idx = range.location
            var foundNonHeading = false
            while idx < end {
                var eff = NSRange()
                let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? NSFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
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
            let font = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
            return mgr.traits(of: font).contains(mask)
        }
        let end = NSMaxRange(range)
        var idx = range.location
        while idx < end {
            var eff = NSRange()
            let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? NSFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
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
            let font = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
            return HarvousFonts.bodyHeadingLevel(matching: font)
        }
        let loc = min(max(range.location, 0), storage.length - 1)
        let font = (storage.attribute(.font, at: loc, effectiveRange: nil) as? NSFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
        return HarvousFonts.bodyHeadingLevel(matching: font)
    }
#elseif os(iOS)
    private func iosBoldToolbarActive(range: NSRange, tv: UITextView, storage: NSTextStorage) -> Bool {
        if range.length == 0 {
            let font = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
            if HarvousFonts.bodyHeadingLevel(matching: font) != nil { return false }
            return font.fontDescriptor.symbolicTraits.contains(.traitBold)
        }
        let end = NSMaxRange(range)
        var idx = range.location
        var foundNonHeading = false
        while idx < end {
            var eff = NSRange()
            let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? UIFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
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
            let font = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
            return font.fontDescriptor.symbolicTraits.contains(.traitItalic)
        }
        let end = NSMaxRange(range)
        var idx = range.location
        while idx < end {
            var eff = NSRange()
            let font = (storage.attribute(.font, at: idx, effectiveRange: &eff) as? UIFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
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
            let font = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
            return HarvousFonts.bodyHeadingLevel(matching: font)
        }
        let loc = min(max(range.location, 0), storage.length - 1)
        let font = (storage.attribute(.font, at: loc, effectiveRange: nil) as? UIFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
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

    // MARK: - Private formatting helpers

    private func headingLevelActive(for tv: HVTextView, storage: NSTextStorage) -> Int? {
        let range = caretRange(for: tv)
#if os(macOS)
        return headingLevelActiveMac(range: range, tv: tv, storage: storage)
#else
        return headingLevelActiveIOS(range: range, tv: tv, storage: storage)
#endif
    }

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
        // lineSpacing is always 0 — inter-line spacing is handled by HarvousLayoutManager delegate
        m.baseWritingDirection = existing.baseWritingDirection
        if existing.tailIndent != 0 { m.tailIndent = existing.tailIndent }
        return m
    }

    private static func urlForLink(_ raw: String) -> URL? {
        let t = (raw as NSString).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        if let u = URL(string: t), u.scheme != nil { return u }
        return URL(string: "https://" + t)
    }

    private func noteBodyParagraphStyleForInserts() -> NSParagraphStyle {
        // Line spacing is provided by HarvousLayoutManager (NSLayoutManagerDelegate) —
        // see `noteBodyParagraphStyle()` in HarvousEditor.swift for the full explanation.
        NSMutableParagraphStyle()
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
                .font: HarvousFonts.noteComposeBodyPlatformFont(),
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
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: NSColor.labelColor
        ]
#elseif os(iOS)
        [
            .font: HarvousFonts.noteComposeBodyPlatformFont(),
            .foregroundColor: UIColor.label
        ]
#endif
    }

    private func toggleTrait(rawValue: UInt) {
        guard let (tv, storage) = textViewPair() else { return }
        defer { syncPlainTextBindingFromTextView?(tv) }
#if os(macOS)
        let range = caretRange(for: tv)
        let mask = NSFontTraitMask(rawValue: rawValue)
        let manager = NSFontManager.shared
        if range.length == 0 {
            let base = (tv.typingAttributes[.font] as? NSFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
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
            let base = (tv.typingAttributes[.font] as? UIFont) ?? HarvousFonts.noteComposeBodyPlatformFont()
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
                    ?? HarvousFonts.noteComposeBodyPlatformFont()
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

    // MARK: - Scripture pill keyboard navigation (macOS)

#if os(macOS)
    func focusNextScripturePill() {
        focusAdjacentScripturePill(next: true)
    }

    func focusPreviousScripturePill() {
        focusAdjacentScripturePill(next: false)
    }

    private func focusAdjacentScripturePill(next: Bool) {
        guard let (tv, storage) = textViewPair() else { return }
        let ranges = rangesOfScripturePillAttachments(in: storage)
        guard !ranges.isEmpty else { return }
        let sel = caretRange(for: tv)
        let target: NSRange
        if next {
            var startSearch: Int
            if sel.length == 0, let idx = ranges.firstIndex(where: { NSLocationInRange(sel.location, $0) }) {
                startSearch = NSMaxRange(ranges[idx])
            } else {
                startSearch = sel.length > 0 ? NSMaxRange(sel) : sel.location
            }
            target = ranges.first { $0.location >= startSearch } ?? ranges[0]
        } else {
            var startSearch = sel.location
            if sel.length == 0, let idx = ranges.firstIndex(where: { NSLocationInRange(sel.location, $0) }) {
                startSearch = ranges[idx].location
            }
            target = ranges.last { NSMaxRange($0) <= startSearch } ?? ranges[ranges.count - 1]
        }
        tv.setSelectedRange(target)
        tv.scrollRangeToVisible(target)
        refocusTextView()
        refreshFormatState()
        if let pill = storage.attribute(.attachment, at: target.location, effectiveRange: nil) as? ScripturePillAttachment {
            onScripturePillKeyboardFocus?(pill.reference, pill.translation, target)
        }
    }

    func postToggleActivePillDockExpanded() {
        NotificationCenter.default.post(name: .harvousToggleActivePillDockExpanded, object: nil)
    }
#endif

}
