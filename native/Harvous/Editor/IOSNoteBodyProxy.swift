#if os(iOS)
import UIKit

/// iOS counterpart to scripture-focused state on `EditorProxy` (formatting toolbar is not used).
@MainActor
final class IOSNoteBodyProxy: ObservableObject {
    weak var textView: UITextView?

    /// HarvousEditor sets this so Apply updates `EditorState` before the next `updateUIView` clobbers storage.
    var syncPlainTextBindingFromTextView: ((UITextView) -> Void)?

    @Published var activeScripturePill: ActiveScripturePill?

    func clearActiveScripturePill() {
        activeScripturePill = nil
    }

    func resetForNewNote() {
        activeScripturePill = nil
    }

    func replaceActiveScripturePill(reference: String, translation: String) {
        guard let tv = textView, let active = activeScripturePill else { return }
        let storage = tv.textStorage
        let range = active.attachmentRange
        guard range.location != NSNotFound, NSMaxRange(range) <= storage.length else { return }

        let pill = ScripturePillAttachment(reference: reference, translation: translation)
        let pillStr = NSMutableAttributedString(attachment: pill)
        let bodyFont = HarvousFonts.system(size: 16, weight: 400)
        pillStr.addAttributes([.font: bodyFont], range: NSRange(location: 0, length: pillStr.length))

        storage.beginEditing()
        storage.replaceCharacters(in: range, with: pillStr)
        storage.endEditing()
        removeDuplicateTranslationAfterPillAttachments(in: storage)

        syncPlainTextBindingFromTextView?(tv)

        let newRange = NSRange(location: range.location, length: pillStr.length)
        activeScripturePill = ActiveScripturePill(attachmentRange: newRange, reference: reference, translation: translation)
        tv.selectedRange = newRange
        NotificationCenter.default.post(name: UITextView.textDidChangeNotification, object: tv)
    }
}

#endif
