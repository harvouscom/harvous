import Foundation

#if os(macOS)
import AppKit

/// Observable proxy bridging SwiftUI toolbar buttons to the live NSTextView.
@Observable
final class EditorProxy {
    weak var textView: NSTextView?

    /// True when the text view has a non-empty selection — drives conditional toolbar visibility.
    var hasSelection: Bool = false

    // MARK: - Inline formatting

    func bold()          { toggleTrait(rawValue: 2) }   // NSBoldFontMask
    func italic()        { toggleTrait(rawValue: 1) }   // NSItalicFontMask

    func strikethrough() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = tv.selectedRange()
        guard range.length > 0 else { return }
        storage.beginEditing()
        let current = storage.attribute(.strikethroughStyle, at: range.location, effectiveRange: nil) as? Int ?? 0
        let next = current == 0 ? NSUnderlineStyle.single.rawValue : 0
        if next == 0 {
            storage.removeAttribute(.strikethroughStyle, range: range)
        } else {
            storage.addAttribute(.strikethroughStyle, value: next, range: range)
        }
        storage.endEditing()
    }

    // MARK: - Headings

    func heading(_ level: Int) {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let paraRange = (storage.string as NSString).paragraphRange(for: tv.selectedRange())
        let spec: (size: CGFloat, weight: NSFont.Weight) = switch level {
            case 1: (28, .bold)
            case 2: (22, .bold)
            case 3: (18, .semibold)
            default: (15, .semibold)
        }
        storage.beginEditing()
        storage.addAttribute(.font, value: NSFont.systemFont(ofSize: spec.size, weight: spec.weight), range: paraRange)
        storage.endEditing()
    }

    func bodyText() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let paraRange = (storage.string as NSString).paragraphRange(for: tv.selectedRange())
        storage.beginEditing()
        storage.addAttribute(.font, value: NSFont.systemFont(ofSize: 15, weight: .regular), range: paraRange)
        storage.endEditing()
    }

    // MARK: - Block inserts

    func insertBullet()   { insertLinePrefix("• ") }
    func insertNumbered() { insertLinePrefix("1. ") }

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
    }

    func insertDivider() {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = tv.selectedRange()
        let divider = NSAttributedString(
            string: "\n\u{2014}\u{2014}\u{2014}\n",
            attributes: [.font: NSFont.systemFont(ofSize: 15), .foregroundColor: NSColor.separatorColor]
        )
        storage.beginEditing()
        storage.replaceCharacters(in: range, with: divider)
        storage.endEditing()
        tv.setSelectedRange(NSRange(location: range.location + divider.length, length: 0))
    }

    // MARK: - Private helpers

    private func toggleTrait(rawValue: UInt) {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let range = tv.selectedRange()
        guard range.length > 0 else { return }
        let mask = NSFontTraitMask(rawValue: rawValue)
        let manager = NSFontManager.shared
        storage.beginEditing()
        storage.enumerateAttribute(.font, in: range) { value, subRange, _ in
            let font = value as? NSFont ?? NSFont.systemFont(ofSize: 15)
            let hasTrait = manager.traits(of: font).contains(mask)
            let newFont = hasTrait
                ? manager.convert(font, toNotHaveTrait: mask)
                : manager.convert(font, toHaveTrait: mask)
            storage.addAttribute(.font, value: newFont, range: subRange)
        }
        storage.endEditing()
    }

    private func insertLinePrefix(_ prefix: String) {
        guard let tv = textView, let storage = tv.textStorage else { return }
        let paraRange = (storage.string as NSString).paragraphRange(for: tv.selectedRange())
        let insertion = NSAttributedString(string: prefix,
                                           attributes: [.font: NSFont.systemFont(ofSize: 15)])
        storage.beginEditing()
        storage.replaceCharacters(in: NSRange(location: paraRange.location, length: 0), with: insertion)
        storage.endEditing()
        tv.setSelectedRange(NSRange(location: paraRange.location + prefix.count, length: 0))
    }
}
#endif
