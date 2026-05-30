import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

/// Compact find popover content — hosted by `NoteFindToolbarButton`.
struct FindInNotePopoverContent: View {
    @ObservedObject var editorProxy: EditorProxy
    @Binding var isPresented: Bool

    @State private var query = ""
    @State private var matchIndex = 0
    @State private var matchCount = 0
    @FocusState private var fieldFocused: Bool

    var body: some View {
        HStack(spacing: 8) {
            TextField("Find in note", text: $query)
                .textFieldStyle(.plain)
                .focused($fieldFocused)
                .onSubmit { runFind(direction: .same) }
                .onChange(of: query) { _, _ in
                    matchIndex = 0
                    runFind(direction: .same)
                }

            Text(matchCountLabel)
                .font(HarvousTypography.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .frame(minWidth: 36)
                .accessibilityHidden(matchCountLabel.isEmpty)

            Button {
                runFind(direction: .prev)
            } label: {
                HarvousFAGlyph(assetName: "Harvous.ChevronUp", edgePt: 11)
            }
            .buttonStyle(.plain)
            .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || matchCount == 0)
            .accessibilityLabel("Previous match")

            Button {
                runFind(direction: .next)
            } label: {
                HarvousFAGlyph(assetName: "Harvous.ChevronDown", edgePt: 11)
            }
            .buttonStyle(.plain)
            .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || matchCount == 0)
            .accessibilityLabel("Next match")

            Button {
                isPresented = false
            } label: {
                HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 11)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close find")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        // macOS popovers inherit the anchor view's height unless we pin to content height
        // (same pattern as `ContentView` daily pill / share popover body text).
        .fixedSize(horizontal: false, vertical: true)
        .frame(width: 320)
        .onAppear {
            fieldFocused = true
            if !query.isEmpty { runFind(direction: .same) }
        }
        #if os(macOS)
        .onExitCommand { isPresented = false }
        #endif
    }

    private var matchCountLabel: String {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if matchCount > 0 {
            return "\(matchIndex + 1)/\(matchCount)"
        }
        return trimmed.isEmpty ? "" : "0"
    }

    private enum FindDirection {
        case same, next, prev
    }

    private func runFind(direction: FindDirection) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            matchCount = 0
            matchIndex = 0
            return
        }
        var idx = matchIndex
        switch direction {
        case .next where matchCount > 0:
            idx = (matchIndex + 1) % matchCount
        case .prev where matchCount > 0:
            idx = (matchIndex - 1 + matchCount) % matchCount
        default:
            break
        }
        let result = editorProxy.findInBody(query: trimmed, matchIndex: idx)
        matchCount = result.count
        matchIndex = result.index
    }
}

extension EditorProxy {
    func findInBody(query: String, matchIndex: Int) -> (count: Int, index: Int) {
        guard let tv = textView else { return (0, 0) }
        #if os(macOS)
        let plain = (tv as NSTextView).string
        #else
        let plain = (tv as UITextView).text ?? ""
        #endif
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return (0, 0) }

        let haystack = plain as NSString
        var ranges: [NSRange] = []
        var searchRange = NSRange(location: 0, length: haystack.length)
        while searchRange.length > 0 {
            let found = haystack.range(of: trimmed, options: [.caseInsensitive], range: searchRange)
            if found.location == NSNotFound { break }
            ranges.append(found)
            let nextLoc = NSMaxRange(found)
            searchRange = NSRange(location: nextLoc, length: max(0, haystack.length - nextLoc))
        }

        guard !ranges.isEmpty else { return (0, 0) }
        let idx = ((matchIndex % ranges.count) + ranges.count) % ranges.count
        let selected = ranges[idx]
        #if os(macOS)
        let nstv = tv as NSTextView
        nstv.setSelectedRange(selected)
        nstv.scrollRangeToVisible(selected)
        nstv.showFindIndicator(for: selected)
        #else
        let uitv = tv as UITextView
        if let start = uitv.position(from: uitv.beginningOfDocument, offset: selected.location),
           let end = uitv.position(from: start, offset: selected.length),
           let textRange = uitv.textRange(from: start, to: end) {
            uitv.selectedTextRange = textRange
            uitv.scrollRangeToVisible(selected)
        }
        #endif
        return (ranges.count, idx)
    }
}

#if os(iOS)
private extension UITextView {
    func scrollRangeToVisible(_ range: NSRange) {
        guard let start = position(from: beginningOfDocument, offset: range.location) else { return }
        let rect = caretRect(for: start)
        scrollRectToVisible(rect, animated: true)
    }
}
#endif
