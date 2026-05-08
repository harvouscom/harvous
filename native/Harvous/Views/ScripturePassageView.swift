import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Identifies a sheet that shows one fetched passage (e.g. from Compose).
struct ScripturePassageSheetItem: Identifiable, Hashable {
    let reference: String
    let translation: String

    var id: String { "\(reference)|\(translation)" }
}

/// One saved passage highlight to paint inside `ScripturePassageView` (under-surface excerpts, ordered for sequential layout).
struct ScripturePassageHighlightPaint: Identifiable, Hashable, Sendable {
    let id: UUID
    let excerpt: String
    let accentRaw: String
}

/// Loads and displays HTML verse text from the Harvous API.
struct ScripturePassageView: View {
    let reference: String
    let translation: String
    /// When false, omits the header row (inspector shows its own section label).
    var showHeader: Bool = true
    /// Larger body for reading surfaces (e.g. scripture bar passage strip).
    var useReadingTypography: Bool = false
    /// When false, suppresses the translation attribution footer (caller renders it separately).
    var showAttribution: Bool = true
    /// Dock: paint saved passage highlights (under-note-body; cross-note).
    var passageHighlightPaints: [ScripturePassageHighlightPaint] = []
    /// Dock: normalized selected plain text when range non-empty; empty when there is no text selection.
    var onPassageSelectionChange: ((String) -> Void)? = nil
    /// Dock: bounding rect of the current selection in the passage view's own coordinate space,
    /// or `nil` when there is no selection. Lets the dock float a selection action bar above it.
    var onPassageSelectionRectChange: ((CGRect?) -> Void)? = nil
    /// Dock: invoked when the user taps inside a painted highlight range (carries the paint's id, which
    /// equals the owning `StudyThread.id`). Lets the caller open the highlight dock for that thread.
    var onPassageHighlightTap: ((UUID) -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    @State private var passageAttributed: NSAttributedString?
    @State private var loadError: String?
    /// Hashable animation key — changes when the rendered text body changes so SwiftUI animates the
    /// resulting height growth smoothly instead of snapping when async passage HTML lands.
    private var passageBodyAnimationKey: Int {
        if let s = passageAttributed?.string { return s.hashValue ^ 0x1 ^ passagePaintsDigest }
        if let err = loadError { return err.hashValue ^ 0x2 }
        return passagePaintsDigest
    }

    /// Stable enough for representable updates — when paints change, re-merge backgrounds into the attributed string.
    private var passagePaintsDigest: Int {
        var h = 0
        for p in passageHighlightPaints {
            h ^= p.id.hashValue ^ p.excerpt.hashValue ^ p.accentRaw.hashValue
        }
        return h
    }

    private var translationAttribution: ScriptureReference.TranslationAttribution? {
        ScriptureReference.attribution(for: translation)
    }

    private var verseFont: Font {
        useReadingTypography ? HarvousTypography.body : HarvousTypography.inspectorBody
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if showHeader {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(reference)
                        .font(useReadingTypography ? HarvousFonts.font(size: 17, weight: .semibold, design: .rounded) : HarvousTypography.inspectorCompactMedium)
                    Text(translation)
                        .font(useReadingTypography ? HarvousFonts.font(size: 15, weight: .regular, design: .default) : HarvousTypography.inspectorCompact)
                        .foregroundStyle(.secondary)
                }
            }

            Group {
                if let loadError {
                    Text(loadError)
                        .font(verseFont)
                        .foregroundStyle(.secondary)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                } else if let passageAttributed {
                    let painted = Self.mergedDisplayAttributed(
                        from: passageAttributed,
                        useReadingTypography: useReadingTypography,
                        paints: passageHighlightPaints,
                        isDark: colorScheme == .dark
                    )
                    let paintRanges = Self.passageHighlightPaintRanges(
                        in: painted.string,
                        paints: passageHighlightPaints
                    )
                    ScripturePassageFittingTextView(
                        attributed: painted,
                        contentDigest: passageAttributed.string.hashValue &+ useReadingTypography.hashValue &+ passagePaintsDigest &+ (colorScheme == .dark ? 1 : 0),
                        paintRanges: paintRanges,
                        onSelectionChange: onPassageSelectionChange,
                        onSelectionRectChange: onPassageSelectionRectChange,
                        onPaintTap: onPassageHighlightTap
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .top)),
                        removal: .opacity
                    ))
                }
            }
            .animation(.spring(response: 0.42, dampingFraction: 0.86), value: passageBodyAnimationKey)

            if showAttribution, let attribution = translationAttribution {
                attributionFooter(attribution)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.spring(response: 0.42, dampingFraction: 0.86), value: passageBodyAnimationKey)
        .task(id: "\(reference)|\(translation)") {
            await loadPassage()
        }
    }

    /// Matches `.animation(value: passageBodyAnimationKey)` on the VStack so the dock's height growth eases in as the passage text lands.
    private static let passageLoadAnimation: Animation = .spring(response: 0.42, dampingFraction: 0.86)

    @MainActor
    private func loadPassage() async {
        let ref = reference
        let trans = translation

        loadError = nil

        if let cached = ScripturePassageCache.shared.value(reference: ref, translation: trans) {
            withAnimation(Self.passageLoadAnimation) {
                passageAttributed = Self.displayedPassage(from: cached, useReadingTypography: useReadingTypography)
            }
            return
        }

        // Avoid showing stale text from a previous reference while this one loads.
        withAnimation(Self.passageLoadAnimation) {
            passageAttributed = nil
        }

        if let diskHTML = await ScripturePassageCache.shared.loadHTMLFromDisk(reference: ref, translation: trans) {
            do {
                let parsed = try await ScripturePassageCache.parsePassageHTMLToAttributed(diskHTML)
                try Task.checkCancellation()
                guard ref == reference, trans == translation else { return }
                ScripturePassageCache.shared.insert(parsed, reference: ref, translation: trans, persistHTML: nil)
                withAnimation(Self.passageLoadAnimation) {
                    passageAttributed = Self.displayedPassage(from: parsed, useReadingTypography: useReadingTypography)
                    loadError = nil
                }
                return
            } catch is CancellationError {
                return
            } catch {
                // Corrupt disk cache — fetch fresh below.
            }
        }

        do {
            let html = try await ScriptureVerseFetch.fetchVerseHTML(reference: ref, translation: trans)
            try Task.checkCancellation()
            guard ref == reference, trans == translation else { return }

            let parsed = try await ScripturePassageCache.parsePassageHTMLToAttributed(html)
            try Task.checkCancellation()
            guard ref == reference, trans == translation else { return }

            ScripturePassageCache.shared.insert(parsed, reference: ref, translation: trans, persistHTML: html)
            withAnimation(Self.passageLoadAnimation) {
                passageAttributed = Self.displayedPassage(from: parsed, useReadingTypography: useReadingTypography)
                loadError = nil
            }
        } catch is CancellationError {
            return
        } catch let urlError as URLError where urlError.code == .cancelled {
            return
        } catch let e as ScriptureFetchError {
            guard ref == reference, trans == translation else { return }
            if passageAttributed == nil {
                withAnimation(Self.passageLoadAnimation) {
                    loadError = e.localizedDescription
                }
            }
        } catch {
            guard ref == reference, trans == translation else { return }
            if passageAttributed == nil, !Self.isBenignFetchCancellation(error) {
                withAnimation(Self.passageLoadAnimation) {
                    loadError = error.localizedDescription
                }
            }
        }
    }

    /// SwiftUI `.task` cancellation or `URLSession` cancel — never show as user-facing error.
    private static func isBenignFetchCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain, ns.code == NSURLErrorCancelled { return true }
        if let url = error as? URLError, url.code == .cancelled { return true }
        return false
    }

    private static func displayedPassage(from base: NSAttributedString, useReadingTypography: Bool) -> NSAttributedString {
        let sized = ScripturePassageHTMLParser.enforceVerseNumeralDisplaySizing(base)
        return useReadingTypography ? sized.withLineSpacingExtra(4) : sized
    }

    private static func mergedDisplayAttributed(
        from base: NSAttributedString,
        useReadingTypography: Bool,
        paints: [ScripturePassageHighlightPaint],
        isDark: Bool
    ) -> NSAttributedString {
        let displayed = displayedPassage(from: base, useReadingTypography: useReadingTypography)
        return applyPassageHighlightPainting(to: displayed, paints: paints, isDark: isDark)
    }

    /// Resolve each paint's actual text range in `raw`. Sorts paints by first-occurrence position
    /// before running a forward-cursor walk so that highlights saved in arbitrary order (e.g. last
    /// verse first, then first verse) all paint correctly. Duplicate-substring highlights still take
    /// successive occurrences via the cursor.
    fileprivate static func passageHighlightPaintRanges(
        in raw: String,
        paints: [ScripturePassageHighlightPaint]
    ) -> [(id: UUID, range: NSRange)] {
        guard !paints.isEmpty else { return [] }
        let whole = raw as NSString
        let len = whole.length

        // 1) Resolve each paint's first occurrence so we can order them by text position.
        let positioned: [(paint: ScripturePassageHighlightPaint, excerpt: String, firstLoc: Int)] = paints.compactMap { paint in
            let excerpt = StudyThread.normalizedPassageExcerpt(paint.excerpt)
            guard !excerpt.isEmpty else { return nil }
            let r = whole.range(of: excerpt)
            guard r.location != NSNotFound else { return nil }
            return (paint, excerpt, r.location)
        }
        let sorted = positioned.sorted { $0.firstLoc < $1.firstLoc }

        // 2) Forward-cursor walk: each paint takes its next occurrence past the cursor (handles
        // duplicate substrings without overlapping painted ranges).
        var cursor = 0
        var out: [(UUID, NSRange)] = []
        for entry in sorted {
            let nlen = (entry.excerpt as NSString).length
            guard nlen > 0, cursor <= len - nlen else { continue }
            let search = NSRange(location: cursor, length: len - cursor)
            let r = whole.range(of: entry.excerpt, options: [], range: search)
            // If the next occurrence past the cursor isn't found (paint already passed by cursor),
            // fall back to its first occurrence so it still paints.
            let chosen: NSRange = (r.location != NSNotFound) ? r : NSRange(location: entry.firstLoc, length: nlen)
            out.append((entry.paint.id, chosen))
            cursor = max(cursor, NSMaxRange(chosen))
        }
        return out
    }

    /// Paints sequential forward matches: one range per saved highlight, ordered by text position
    /// so out-of-save-order highlights still all paint.
    private static func applyPassageHighlightPainting(
        to displayed: NSAttributedString,
        paints: [ScripturePassageHighlightPaint],
        isDark: Bool
    ) -> NSAttributedString {
        guard !paints.isEmpty else { return displayed }
        let m = NSMutableAttributedString(attributedString: displayed)
        let ranges = passageHighlightPaintRanges(in: m.string, paints: paints)
        // Build a quick lookup of accent by paint id so we can apply the right color per range.
        let accentById: [UUID: String] = Dictionary(uniqueKeysWithValues: paints.map { ($0.id, $0.accentRaw) })
        for entry in ranges {
            guard let accentRaw = accentById[entry.id] else { continue }
            let token = StudyHighlightAccentToken.decoding(accentRaw).resolvedFromAuto(forKind: .scriptureLink)
            // Paint as a thick colored underline so passage highlights match note-body highlights
            // (see `EditorStudyHighlight.applyHighlights`). The accent color drives the underline tint.
            #if os(macOS)
            let underline = token.resolvedAccentNSColor(kind: .scriptureLink, isDark: isDark)
            #else
            let underline = token.resolvedAccentUIColor(kind: .scriptureLink, isDark: isDark)
            #endif
            m.addAttribute(.underlineStyle, value: NSUnderlineStyle.thick.rawValue, range: entry.range)
            m.addAttribute(.underlineColor, value: underline, range: entry.range)
        }
        return m
    }

    @ViewBuilder
    private func attributionFooter(_ attribution: ScriptureReference.TranslationAttribution) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "info.circle")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
                .accessibilityLabel("Translation attribution")

            Text(attribution.copyright)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 0)

            if let websiteURL = URL(string: attribution.website) {
                Link(destination: websiteURL) {
                    HStack(spacing: 3) {
                        Text(ScriptureReference.displayTranslationLabel(translation))
                            .font(.system(size: 9, weight: .semibold))
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 7, weight: .bold))
                    }
                    .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color.primary.opacity(0.03))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.65)
        )
    }
}

// MARK: - Reading line spacing (matches prior SwiftUI `.lineSpacing(4)` on `Text`)

private extension NSAttributedString {
    func withLineSpacingExtra(_ extra: CGFloat) -> NSAttributedString {
        guard extra > 0 else { return self }
        let m = NSMutableAttributedString(attributedString: self)
        let full = NSRange(location: 0, length: m.length)
        m.enumerateAttribute(.paragraphStyle, in: full, options: []) { value, range, _ in
            let mp = ((value as? NSParagraphStyle)?.mutableCopy() as? NSMutableParagraphStyle) ?? NSMutableParagraphStyle()
            mp.lineSpacing = mp.lineSpacing + extra
            m.addAttribute(.paragraphStyle, value: mp, range: range)
        }
        return m
    }
}

// MARK: - Native text (honors NSAttributedString baselineOffset for verse numerals)

#if os(macOS)

/// Custom NSTextView that detects single-click taps inside painted highlight ranges.
///
/// `NSTextView.mouseDown` runs a modal mouse-tracking loop on macOS — it doesn't return
/// until the user releases. We hit-test the original click point BEFORE entering super so
/// the layout manager state is fresh, then fire the callback after super returns iff no
/// drag-selection occurred. This handles every click reliably (first AND repeated).
fileprivate final class ScripturePassageNSTextView: NSTextView {
    var paintRanges: [(id: UUID, range: NSRange)] = []
    var onPaintTap: ((UUID) -> Void)?

    override func mouseDown(with event: NSEvent) {
        let downPoint = convert(event.locationInWindow, from: nil)
        // Pre-resolve which paint range (if any) the click landed on. We do this BEFORE super
        // so the layout manager hasn't been mutated by the tracking loop.
        var matchedId: UUID?
        if !paintRanges.isEmpty,
           let lm = layoutManager,
           let tc = textContainer {
            let local = CGPoint(x: downPoint.x - textContainerOrigin.x,
                                y: downPoint.y - textContainerOrigin.y)
            let glyphIndex = lm.glyphIndex(for: local, in: tc)
            let charIndex = lm.characterIndexForGlyph(at: glyphIndex)
            matchedId = paintRanges.first(where: { NSLocationInRange(charIndex, $0.range) })?.id
        }

        super.mouseDown(with: event)

        // If the click landed on a paint range AND the user didn't drag-select, fire the callback.
        if let id = matchedId, selectedRange().length == 0 {
            onPaintTap?(id)
        }
    }
}

private struct ScripturePassageFittingTextView: NSViewRepresentable {
    var attributed: NSAttributedString
    /// When this changes, attributed string is re-applied (avoids clobbering text selection on unrelated SwiftUI updates).
    var contentDigest: Int
    var paintRanges: [(id: UUID, range: NSRange)] = []
    var onSelectionChange: ((String) -> Void)?
    var onSelectionRectChange: ((CGRect?) -> Void)?
    var onPaintTap: ((UUID) -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> ScripturePassageNSTextView {
        let tv = ScripturePassageNSTextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.drawsBackground = false
        tv.isRichText = true
        tv.isVerticallyResizable = true
        tv.isHorizontallyResizable = false
        tv.textContainerInset = .zero
        tv.textContainer?.lineFragmentPadding = 0
        tv.textContainer?.widthTracksTextView = true
        tv.autoresizingMask = [.width]
        tv.delegate = context.coordinator
        tv.paintRanges = paintRanges
        tv.onPaintTap = onPaintTap
        context.coordinator.textView = tv
        context.coordinator.onSelectionChange = onSelectionChange
        context.coordinator.onSelectionRectChange = onSelectionRectChange
        context.coordinator.lastDigest = contentDigest
        tv.textStorage?.setAttributedString(attributed)
        return tv
    }

    func updateNSView(_ textView: ScripturePassageNSTextView, context: Context) {
        context.coordinator.textView = textView
        context.coordinator.onSelectionChange = onSelectionChange
        context.coordinator.onSelectionRectChange = onSelectionRectChange
        textView.paintRanges = paintRanges
        textView.onPaintTap = onPaintTap
        if context.coordinator.lastDigest != contentDigest {
            context.coordinator.lastDigest = contentDigest
            // Suspend the delegate while we re-apply the attributed string. Without this,
            // `setAttributedString` synchronously fires `textViewDidChangeSelection` during
            // SwiftUI's view update, which leads to "Modifying state during view update"
            // warnings and silently dropped state propagation.
            let savedDelegate = textView.delegate
            textView.delegate = nil
            textView.textStorage?.setAttributedString(attributed)
            // Reset selection to a known empty state so any leftover range from before the
            // re-apply doesn't confuse future selection comparisons.
            textView.setSelectedRange(NSRange(location: 0, length: 0))
            textView.delegate = savedDelegate
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: ScripturePassageNSTextView, context: Context) -> CGSize? {
        let w = proposal.width ?? 400
        guard w.isFinite, w > 1 else { return nil }
        nsView.textContainer?.containerSize = NSSize(width: w, height: CGFloat.greatestFiniteMagnitude)
        nsView.frame = NSRect(x: 0, y: 0, width: w, height: 10_000)
        guard let tc = nsView.textContainer, let lm = nsView.layoutManager else {
            return CGSize(width: w, height: 1)
        }
        lm.ensureLayout(for: tc)
        let used = lm.usedRect(for: tc)
        let h = used.height + nsView.textContainerInset.height * 2
        return CGSize(width: w, height: max(1, ceil(h)))
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        weak var textView: NSTextView?
        var onSelectionChange: ((String) -> Void)?
        var onSelectionRectChange: ((CGRect?) -> Void)?
        var lastDigest: Int = 0

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            emitSelection(tv: tv)
        }

        private func emitSelection(tv: NSTextView) {
            let r = tv.selectedRange()
            let s = tv.string as NSString
            guard r.length > 0, NSMaxRange(r) <= s.length else {
                onSelectionChange?("")
                onSelectionRectChange?(nil)
                return
            }
            let sub = s.substring(with: r)
            onSelectionChange?(StudyThread.normalizedPassageExcerpt(sub))
            if let rectCb = onSelectionRectChange,
               let lm = tv.layoutManager,
               let tc = tv.textContainer {
                let glyphRange = lm.glyphRange(forCharacterRange: r, actualCharacterRange: nil)
                let bounding = lm.boundingRect(forGlyphRange: glyphRange, in: tc)
                let origin = tv.textContainerOrigin
                let viewRect = bounding.offsetBy(dx: origin.x, dy: origin.y)
                rectCb(viewRect)
            }
        }
    }
}

#else

private struct ScripturePassageFittingTextView: UIViewRepresentable {
    var attributed: NSAttributedString
    var contentDigest: Int
    var paintRanges: [(id: UUID, range: NSRange)] = []
    var onSelectionChange: ((String) -> Void)?
    var onSelectionRectChange: ((CGRect?) -> Void)?
    var onPaintTap: ((UUID) -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.isScrollEnabled = false
        tv.backgroundColor = .clear
        tv.textContainerInset = .zero
        tv.textContainer.lineFragmentPadding = 0
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        tv.delegate = context.coordinator
        context.coordinator.textView = tv
        context.coordinator.onSelectionChange = onSelectionChange
        context.coordinator.onSelectionRectChange = onSelectionRectChange
        context.coordinator.onPaintTap = onPaintTap
        context.coordinator.paintRanges = paintRanges
        context.coordinator.lastDigest = contentDigest
        tv.attributedText = attributed

        // Tap gesture detects single-tap on a painted range. cancelsTouchesInView=false so the
        // text view's own long-press / drag-to-select still works for new highlight creation.
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        tap.cancelsTouchesInView = false
        tv.addGestureRecognizer(tap)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        context.coordinator.textView = tv
        context.coordinator.onSelectionChange = onSelectionChange
        context.coordinator.onSelectionRectChange = onSelectionRectChange
        context.coordinator.onPaintTap = onPaintTap
        context.coordinator.paintRanges = paintRanges
        if context.coordinator.lastDigest != contentDigest {
            context.coordinator.lastDigest = contentDigest
            // Suspend the delegate during the attributed-text swap so synchronous selection
            // notifications can't mutate SwiftUI state mid view update.
            let savedDelegate = tv.delegate
            tv.delegate = nil
            tv.attributedText = attributed
            tv.selectedRange = NSRange(location: 0, length: 0)
            tv.delegate = savedDelegate
        }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let w = proposal.width
        guard let w, w.isFinite, w > 1 else { return nil }
        let size = uiView.sizeThatFits(CGSize(width: w, height: CGFloat.greatestFiniteMagnitude))
        return CGSize(width: w, height: size.height)
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        weak var textView: UITextView?
        var onSelectionChange: ((String) -> Void)?
        var onSelectionRectChange: ((CGRect?) -> Void)?
        var onPaintTap: ((UUID) -> Void)?
        var paintRanges: [(id: UUID, range: NSRange)] = []
        var lastDigest: Int = 0

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard gesture.state == .ended,
                  let tv = textView,
                  let cb = onPaintTap,
                  !paintRanges.isEmpty else { return }
            // Skip if a selection is in progress — avoid hijacking selection completion.
            if tv.selectedRange.length > 0 { return }
            let point = gesture.location(in: tv)
            let local = CGPoint(x: point.x - tv.textContainerInset.left,
                                y: point.y - tv.textContainerInset.top)
            let lm = tv.layoutManager
            let tc = tv.textContainer
            let glyphIndex = lm.glyphIndex(for: local, in: tc)
            let glyphRect = lm.boundingRect(forGlyphRange: NSRange(location: glyphIndex, length: 1), in: tc)
            guard glyphRect.contains(local) else { return }
            let charIndex = lm.characterIndexForGlyph(at: glyphIndex)
            for entry in paintRanges where NSLocationInRange(charIndex, entry.range) {
                cb(entry.id)
                return
            }
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            let r = textView.selectedRange
            let s = (textView.text ?? "") as NSString
            guard r.length > 0, NSMaxRange(r) <= s.length else {
                onSelectionChange?("")
                onSelectionRectChange?(nil)
                return
            }
            let sub = s.substring(with: r)
            onSelectionChange?(StudyThread.normalizedPassageExcerpt(sub))
            if let rectCb = onSelectionRectChange {
                let glyphRange = textView.layoutManager.glyphRange(forCharacterRange: r, actualCharacterRange: nil)
                let bounding = textView.layoutManager.boundingRect(forGlyphRange: glyphRange, in: textView.textContainer)
                let origin = CGPoint(x: textView.textContainerInset.left, y: textView.textContainerInset.top)
                let viewRect = bounding.offsetBy(dx: origin.x, dy: origin.y)
                rectCb(viewRect)
            }
        }
    }
}

#endif
