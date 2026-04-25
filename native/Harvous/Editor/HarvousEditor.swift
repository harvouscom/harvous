import SwiftUI

// MARK: - Shared binding type

struct EditorState {
    var plainText: String = ""
    var detectedRefs: [String] = []
}

// MARK: - Cross-platform wrapper

#if os(macOS)
import AppKit

struct HarvousEditor: NSViewRepresentable {
    @Binding var state: EditorState
    var proxy: EditorProxy? = nil
    var placeholder: String = "What are you studying?"
    var font: NSFont = .systemFont(ofSize: 15, weight: .regular)

    func makeCoordinator() -> Coordinator { Coordinator(state: $state) }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        let textView = scrollView.documentView as! NSTextView

        // Warm typography
        let para = NSMutableParagraphStyle()
        para.lineHeightMultiple = 1.55
        textView.defaultParagraphStyle = para
        textView.typingAttributes = [
            .font: NSFont.systemFont(ofSize: 16, weight: .regular),
            .foregroundColor: NSColor(Color.inkPrimary),
            .paragraphStyle: para
        ]

        textView.isRichText = true       // rich text so formatting attributes stick
        textView.font = font
        textView.textColor = NSColor(Color.inkPrimary)
        textView.backgroundColor = NSColor(Color.surfaceElevated)
        textView.isEditable = true
        textView.isSelectable = true
        textView.allowsUndo = true
        textView.textContainerInset = NSSize(width: 4, height: 8)
        textView.delegate = context.coordinator
        context.coordinator.textView = textView
        context.coordinator.proxy = proxy
        context.coordinator.placeholderText = placeholder
        proxy?.textView = textView   // wire proxy for toolbar actions

        // Placeholder
        if state.plainText.isEmpty {
            textView.string = ""
            context.coordinator.showPlaceholder(in: textView, text: placeholder)
        }

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        let textView = scrollView.documentView as! NSTextView
        context.coordinator.proxy = proxy
        // Only update if the source of truth changed externally (not from the user typing)
        if textView.string != state.plainText && !context.coordinator.isEditing {
            textView.string = state.plainText
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        @Binding var state: EditorState
        weak var textView: NSTextView?
        var proxy: EditorProxy?
        var isEditing = false
        var placeholderText = "What are you studying?"
        private var debounceTask: Task<Void, Never>?

        init(state: Binding<EditorState>) { _state = state }

        func showPlaceholder(in textView: NSTextView, text: String) {
            // Simple placeholder via text storage
            if textView.string.isEmpty {
                let attrs: [NSAttributedString.Key: Any] = [
                    .foregroundColor: NSColor.placeholderTextColor,
                    .font: NSFont.systemFont(ofSize: 16)
                ]
                textView.textStorage?.setAttributedString(NSAttributedString(string: text, attributes: attrs))
                textView.setSelectedRange(NSRange(location: 0, length: 0))
            }
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            proxy?.hasSelection = tv.selectedRange().length > 0
        }

        func textDidBeginEditing(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            isEditing = true
            // Clear placeholder if it's still there
            if tv.textColor == .placeholderTextColor {
                tv.string = ""
                tv.textColor = NSColor(Color.inkPrimary)
                tv.font = .systemFont(ofSize: 16)
            }
        }

        func textDidEndEditing(_ notification: Notification) {
            isEditing = false
            guard let tv = notification.object as? NSTextView else { return }
            if tv.string.isEmpty {
                showPlaceholder(in: tv, text: placeholderText)
            }
        }

        func textDidChange(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            let plain = tv.string
            state.plainText = plain

            // Debounced scripture detection
            debounceTask?.cancel()
            debounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                self.detectAndInsertPills(in: tv, text: plain)
            }
        }

        @MainActor
        private func detectAndInsertPills(in textView: NSTextView, text: String) {
            let matches = ScriptureDetector.detect(in: text)
            let refs = matches.map(\.displayText)
            state.detectedRefs = refs

            guard let storage = textView.textStorage else { return }
            let fullRange = NSRange(location: 0, length: storage.length)

            // Remove existing pill attachments first
            var pillRanges: [NSRange] = []
            storage.enumerateAttribute(.attachment, in: fullRange) { value, range, _ in
                if value is ScripturePillAttachment { pillRanges.append(range) }
            }
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

            for match in freshMatches.reversed() {
                let pill = ScripturePillAttachment(reference: match.displayText)
                let pillStr = NSMutableAttributedString(attachment: pill)
                let bodyFont: NSFont = .systemFont(ofSize: 16)
                pillStr.addAttributes([.font: bodyFont], range: NSRange(location: 0, length: pillStr.length))
                storage.replaceCharacters(in: match.range, with: pillStr)
            }

            // Restore font + warm ink for the whole storage (pills excluded)
            let bodyFont: NSFont = .systemFont(ofSize: 16)
            let fullLen = NSRange(location: 0, length: storage.length)
            storage.addAttribute(.font, value: bodyFont, range: fullLen)
            storage.addAttribute(.foregroundColor, value: NSColor(Color.inkPrimary), range: fullLen)
        }
    }
}

#else
import UIKit

struct HarvousEditor: UIViewRepresentable {
    @Binding var state: EditorState
    var placeholder: String = "What are you studying?"

    func makeCoordinator() -> Coordinator { Coordinator(state: $state) }

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.font = .systemFont(ofSize: 16)
        tv.textColor = .label
        tv.backgroundColor = .clear
        tv.isEditable = true
        tv.isSelectable = true
        tv.allowsEditingTextAttributes = false
        tv.delegate = context.coordinator
        context.coordinator.textView = tv
        if state.plainText.isEmpty { tv.text = placeholder; tv.textColor = .placeholderText }
        return tv
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        if textView.text != state.plainText && !context.coordinator.isEditing {
            textView.text = state.plainText
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        @Binding var state: EditorState
        weak var textView: UITextView?
        var isEditing = false
        private var debounceTask: Task<Void, Never>?

        init(state: Binding<EditorState>) { _state = state }

        func textViewDidBeginEditing(_ textView: UITextView) {
            isEditing = true
            if textView.textColor == .placeholderText { textView.text = ""; textView.textColor = .label }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            isEditing = false
            if textView.text.isEmpty { textView.text = "What are you studying?"; textView.textColor = .placeholderText }
        }

        func textViewDidChange(_ textView: UITextView) {
            guard textView.textColor != .placeholderText else { return }
            let plain = textView.text ?? ""
            state.plainText = plain

            debounceTask?.cancel()
            debounceTask = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                self.detectAndInsertPills(in: textView, text: plain)
            }
        }

        @MainActor
        private func detectAndInsertPills(in textView: UITextView, text: String) {
            let matches = ScriptureDetector.detect(in: text)
            state.detectedRefs = matches.map(\.displayText)

            let storage = textView.textStorage
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

            let freshMatches = ScriptureDetector.detect(in: storage.string)
            for match in freshMatches.reversed() {
                let pill = ScripturePillAttachment(reference: match.displayText)
                let pillStr = NSMutableAttributedString(attachment: pill)
                pillStr.addAttributes([.font: UIFont.systemFont(ofSize: 16)], range: NSRange(location: 0, length: pillStr.length))
                storage.replaceCharacters(in: match.range, with: pillStr)
            }
            storage.addAttribute(.font, value: UIFont.systemFont(ofSize: 16), range: NSRange(location: 0, length: storage.length))
        }
    }
}
#endif
