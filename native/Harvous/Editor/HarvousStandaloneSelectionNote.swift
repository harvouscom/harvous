import Foundation

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

/// Builds a standalone note payload from prose selection (expanded plain coordinates).
enum HarvousStandaloneSelectionNote {
    static func payload(excerpt: String) -> (title: String, body: String, detectedRefs: [String]) {
        let trimmed = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        let refs = ScriptureDetector.detect(in: trimmed).map(\.displayText)
        let quotedLines =
            excerpt
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { "> \($0)" }
            .joined(separator: "\n")
        let body = trimmed.isEmpty ? quotedLines : quotedLines
        let titleSrc = trimmed.isEmpty ? excerpt : trimmed
        let title = ThreadEditorSnippet.deriveFocus(from: titleSrc)
        return (title, body.isEmpty ? titleSrc : body, refs)
    }

    static func excerptIfValid(
        storage: NSTextStorage,
        utf16Selection: NSRange
    ) -> String? {
        guard utf16Selection.length > 0 else { return nil }
        if HarvousStudyHighlightMapper.selectionIntersectsUnresolvedAttachment(utf16Selection, in: storage) {
            return nil
        }
        guard case let .success(expanded) = HarvousStudyHighlightMapper.expandedRange(
            forStorageSelection: utf16Selection,
            in: storage
        ) else {
            return nil
        }
        let fullExpanded = harvousExpandedPlainText(in: storage)
        let nsFull = fullExpanded as NSString
        guard expanded.location >= 0, NSMaxRange(expanded) <= nsFull.length else { return nil }
        return nsFull.substring(with: expanded)
    }

    /// Selection must sit on plain prose (not scripture attachment spans). Posts a notification consumed by hub views.
    @MainActor
    static func postIfEligibleCollapseSelection(
        storage: NSTextStorage,
        utf16Selection: NSRange,
        collapseToEndUtf16 collapse: (_ endLocation: Int) -> Void,
        collapseProxySelectionState: () -> Void
    ) {
        guard let excerpt = excerptIfValid(storage: storage, utf16Selection: utf16Selection) else { return }
        let trimmed = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let triple = payload(excerpt: excerpt)
        let endLoc = utf16Selection.location + utf16Selection.length
        collapse(endLoc)
        collapseProxySelectionState()
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        #endif
        var userInfo: [String: Any] = [
            HarvousStandaloneNoteSelectionUserInfo.titleKey: triple.title,
            HarvousStandaloneNoteSelectionUserInfo.bodyKey: triple.body,
            HarvousStandaloneNoteSelectionUserInfo.refsKey: triple.detectedRefs,
            HarvousStandaloneNoteSelectionUserInfo.sourceExcerptKey: excerpt,
        ]
        if case let .success(expanded) = HarvousStudyHighlightMapper.expandedRange(
            forStorageSelection: utf16Selection,
            in: storage
        ) {
            userInfo[HarvousStandaloneNoteSelectionUserInfo.expandedLocationKey] = expanded.location
            userInfo[HarvousStandaloneNoteSelectionUserInfo.expandedLengthKey] = expanded.length
        }
        NotificationCenter.default.post(
            name: .harvousNewStandaloneNoteFromSelection,
            object: nil,
            userInfo: userInfo
        )
    }
}

extension Notification.Name {
    /// Posted when the user invokes **New Harvous note** from the system text edit menu.
    /// `userInfo`: `harvousStandaloneTitle` (String), `harvousStandaloneBody` (String), `harvousStandaloneRefs` ([String])
    static let harvousNewStandaloneNoteFromSelection = Notification.Name("HarvousNewStandaloneNoteFromSelection")
    /// `NoteEditorView` emits this after creating the standalone note row; Home tab appends id to navigation path.
    static let harvousStandaloneNoteNavigateIOS = Notification.Name("HarvousStandaloneNoteNavigateIOS")

    /// User picked **Highlight…** — `NoteEditorView` shows annotation UI. See `HarvousHighlightCapturePromptUserInfo`.
    static let harvousHighlightCapturePrompt = Notification.Name("HarvousHighlightCapturePrompt")
}

enum HarvousStandaloneNoteSelectionUserInfo {
    static let titleKey = "harvousStandaloneTitle"
    static let bodyKey = "harvousStandaloneBody"
    static let refsKey = "harvousStandaloneRefs"
    /// Raw excerpt (in expanded-plain coords) used to anchor the back-connection marker on the parent note.
    static let sourceExcerptKey = "harvousStandaloneSourceExcerpt"
    static let expandedLocationKey = "harvousStandaloneExpandedLocation"
    static let expandedLengthKey = "harvousStandaloneExpandedLength"
}

enum HarvousStandaloneNoteNavigateUserInfo {
    static let noteIdKey = "harvousStandaloneNavigateNoteId"
}

/// Keys for [.harvousHighlightCapturePrompt].
enum HarvousHighlightCapturePromptUserInfo {
    static let parentNoteIdKey = "harvousHighlightParentNoteId"
    static let excerptKey = "harvousHighlightExcerpt"
    static let expandedLocationKey = "harvousHighlightExpandedLocation"
    static let expandedLengthKey = "harvousHighlightExpandedLength"
    /// Preferred anchor rect in UITextView / NSTextView coordinates (popover placement).
    static let anchorRectKey = "harvousHighlightAnchorRect"
}

extension HarvousStandaloneSelectionNote {
    /// Validates selection and derives expanded-plain excerpt + range for highlight authoring.
    static func excerptAndExpandedRange(storage: NSTextStorage, utf16Selection: NSRange) -> (excerpt: String, expandedUTF16Range: NSRange)? {
        guard let excerpt = excerptIfValid(storage: storage, utf16Selection: utf16Selection),
              excerpt.trimmingCharacters(in: .whitespacesAndNewlines).count > 0 else { return nil }
        guard case let .success(expanded) = HarvousStudyHighlightMapper.expandedRange(
            forStorageSelection: utf16Selection,
            in: storage
        ) else { return nil }
        let fullExpanded = harvousExpandedPlainText(in: storage)
        let nsFull = fullExpanded as NSString
        guard expanded.location >= 0, NSMaxRange(expanded) <= nsFull.length else { return nil }
        return (excerpt, expanded)
    }

    /// Posts [.harvousHighlightCapturePrompt] for the enclosing `NoteEditorView` to react.
    @MainActor
    static func postHighlightCapturePromptIfEligible(
        storage: NSTextStorage,
        utf16Selection: NSRange,
        parentNoteId: UUID?,
        anchorRectForPopover: CGRect?
    ) {
        guard let nid = parentNoteId else { return }
        guard let pair = excerptAndExpandedRange(storage: storage, utf16Selection: utf16Selection) else { return }

        var userInfo: [String: Any] = [
            HarvousHighlightCapturePromptUserInfo.parentNoteIdKey: nid.uuidString,
            HarvousHighlightCapturePromptUserInfo.excerptKey: pair.excerpt,
            HarvousHighlightCapturePromptUserInfo.expandedLocationKey: pair.expandedUTF16Range.location,
            HarvousHighlightCapturePromptUserInfo.expandedLengthKey: pair.expandedUTF16Range.length,
        ]
        if let r = anchorRectForPopover {
            #if os(macOS)
            userInfo[HarvousHighlightCapturePromptUserInfo.anchorRectKey] = NSValue(rect: r)
            #else
            userInfo[HarvousHighlightCapturePromptUserInfo.anchorRectKey] = NSValue(cgRect: r)
            #endif
        }
        NotificationCenter.default.post(name: .harvousHighlightCapturePrompt, object: nil, userInfo: userInfo)
    }
}
