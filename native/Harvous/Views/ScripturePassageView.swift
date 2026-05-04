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

/// Loads and displays HTML verse text from the Harvous API.
struct ScripturePassageView: View {
    let reference: String
    let translation: String
    /// When false, omits the header row (inspector shows its own section label).
    var showHeader: Bool = true
    /// Larger body for reading surfaces (e.g. scripture bar passage strip).
    var useReadingTypography: Bool = false

    @State private var passageAttributed: NSAttributedString?
    @State private var loadError: String?
    /// Hashable animation key — changes when the rendered text body changes so SwiftUI animates the
    /// resulting height growth smoothly instead of snapping when async passage HTML lands.
    private var passageBodyAnimationKey: Int {
        if let s = passageAttributed?.string { return s.hashValue ^ 0x1 }
        if let err = loadError { return err.hashValue ^ 0x2 }
        return 0
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
                    ScripturePassageFittingTextView(attributed: passageAttributed)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .move(edge: .top)),
                            removal: .opacity
                        ))
                }
            }
            .animation(.spring(response: 0.42, dampingFraction: 0.86), value: passageBodyAnimationKey)

            if let attribution = translationAttribution {
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

private struct ScripturePassageFittingTextView: NSViewRepresentable {
    var attributed: NSAttributedString

    func makeNSView(context: Context) -> NSTextView {
        let tv = NSTextView()
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
        return tv
    }

    func updateNSView(_ textView: NSTextView, context: Context) {
        textView.textStorage?.setAttributedString(attributed)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSTextView, context: Context) -> CGSize? {
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
}

#else

private struct ScripturePassageFittingTextView: UIViewRepresentable {
    var attributed: NSAttributedString

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.isScrollEnabled = false
        tv.backgroundColor = .clear
        tv.textContainerInset = .zero
        tv.textContainer.lineFragmentPadding = 0
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        tv.attributedText = attributed
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let w = proposal.width
        guard let w, w.isFinite, w > 1 else { return nil }
        let size = uiView.sizeThatFits(CGSize(width: w, height: CGFloat.greatestFiniteMagnitude))
        return CGSize(width: w, height: size.height)
    }
}

#endif
