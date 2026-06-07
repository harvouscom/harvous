import Foundation

/// Translates the native plain-text note `body` (a markdown-flavored serialization
/// produced by `harvousExpandedPlainText`) into the TipTap HTML the Hono backend
/// stores, and pulls per-pill scripture accents back out of server HTML.
///
/// Replaces the old naive `<p>`-wrap / tag-strip bridge so a native edit round-trips
/// structure — paragraphs, bullet/ordered lists, horizontal rules, links — instead of
/// collapsing onto a single line.
///
/// Scripture pills are deliberately NOT hand-built: the server re-runs scripture
/// detection on every save, so plain `John 3:16` text becomes a pill server-side. The
/// sole exception is accent overrides, which the server cannot infer — those references
/// are emitted as "pending pill" spans carrying `data-pill-accent`, which the server's
/// scripture pipeline preserves onto the regenerated pill.
enum HarvousContentBridge {

    // MARK: - Native body → server HTML (upload)

    static func markdownToHTML(_ body: String, accents: [String: String] = [:]) -> String {
        let normalized = body.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalized.components(separatedBy: "\n")

        var html = ""
        var paragraph: [String] = []
        var i = 0

        func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            let inner = paragraph.map { inlineHTML($0, accents: accents) }.joined(separator: "<br>")
            html += "<p>\(inner)</p>"
            paragraph.removeAll()
        }

        while i < lines.count {
            let raw = lines[i]
            let trimmed = raw.trimmingCharacters(in: .whitespaces)

            if trimmed == "---" {
                flushParagraph()
                html += "<hr>"
                i += 1
            } else if trimmed.isEmpty {
                flushParagraph()
                i += 1
            } else if isBullet(trimmed) {
                flushParagraph()
                var items: [String] = []
                while i < lines.count, isBullet(lines[i].trimmingCharacters(in: .whitespaces)) {
                    items.append(stripBullet(lines[i].trimmingCharacters(in: .whitespaces)))
                    i += 1
                }
                html += "<ul>" + items.map { "<li>\(inlineHTML($0, accents: accents))</li>" }.joined() + "</ul>"
            } else if isOrdered(trimmed) {
                flushParagraph()
                var items: [String] = []
                while i < lines.count, isOrdered(lines[i].trimmingCharacters(in: .whitespaces)) {
                    items.append(stripOrdered(lines[i].trimmingCharacters(in: .whitespaces)))
                    i += 1
                }
                html += "<ol>" + items.map { "<li>\(inlineHTML($0, accents: accents))</li>" }.joined() + "</ol>"
            } else {
                paragraph.append(raw)
                i += 1
            }
        }
        flushParagraph()

        return html.isEmpty ? "<p></p>" : html
    }

    // MARK: - Server HTML → native plain body (download)

    /// Converts TipTap HTML from the server into the native plain-text note `body`
    /// (inverse of `markdownToHTML`). Preserves paragraph breaks, soft line breaks,
    /// blank lines, lists, horizontal rules, and links.
    static func htmlToPlainBody(_ html: String) -> String {
        let trimmed = html.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        if trimmed == "<p></p>" || trimmed == "<p><br></p>" || trimmed == "<p><br/></p>" { return "" }

        var segments: [String] = []
        var remainder = trimmed
        while !remainder.isEmpty {
            remainder = remainder.trimmingCharacters(in: .whitespaces)
            if remainder.isEmpty { break }

            if let hrRange = remainder.range(of: "^<hr\\s*/?>", options: [.regularExpression, .caseInsensitive]) {
                segments.append("---")
                remainder = String(remainder[hrRange.upperBound...])
                continue
            }

            if let match = firstTopLevelBlock(in: remainder, tag: "p", close: "</p>") {
                segments.append(paragraphPlain(fromInnerHTML: match.inner))
                guard let next = remainderSuffix(from: remainder, after: match.end) else { break }
                remainder = next
                continue
            }

            if let match = firstTopLevelBlock(in: remainder, tag: "ul", close: "</ul>") {
                segments.append(bulletListPlain(fromInnerHTML: match.inner))
                guard let next = remainderSuffix(from: remainder, after: match.end) else { break }
                remainder = next
                continue
            }

            if let match = firstTopLevelBlock(in: remainder, tag: "ol", close: "</ol>") {
                segments.append(orderedListPlain(fromInnerHTML: match.inner))
                guard let next = remainderSuffix(from: remainder, after: match.end) else { break }
                remainder = next
                continue
            }

            if let match = firstTopLevelBlock(in: remainder, tag: "div", close: "</div>") {
                let nested = htmlToPlainBody("<p>\(match.inner)</p>")
                if !nested.isEmpty { segments.append(nested) }
                guard let next = remainderSuffix(from: remainder, after: match.end) else { break }
                remainder = next
                continue
            }

            // Skip unknown tags / stray markup
            if let tagEnd = remainder.firstIndex(of: ">") {
                remainder = String(remainder[remainder.index(after: tagEnd)...])
            } else {
                break
            }
        }

        return joinPlainSegments(segments)
    }

    /// Pulls per-pill accent overrides out of server pill markup, keyed by reference
    /// string (e.g. `["John 3:16": "warmAmber"]`). Only spans that actually carry a
    /// `data-pill-accent` attribute are returned.
    static func extractPillAccents(fromHTML html: String) -> [String: String] {
        guard !html.isEmpty, html.contains("data-pill-accent") else { return [:] }
        var map: [String: String] = [:]
        let ns = html as NSString
        let full = NSRange(location: 0, length: ns.length)
        let tags = spanOpenRegex.matches(in: html, range: full)
        for tag in tags {
            let tagStr = ns.substring(with: tag.range)
            guard let ref = firstCapture(refAttrRegex, in: tagStr),
                  let accent = firstCapture(accentAttrRegex, in: tagStr) else { continue }
            map[ref] = accent
        }
        return map
    }

    // MARK: - HTML → plain block parsing

    private struct TopLevelBlock {
        let inner: String
        let end: String.Index
    }

    private static func matchesOpenTagPrefix(_ html: String, tag: String) -> Bool {
        guard let open = html.range(of: "<\(tag)", options: [.caseInsensitive, .anchored]) else { return false }
        let afterTag = open.upperBound
        guard afterTag < html.endIndex else { return true }
        switch html[afterTag] {
        case ">", " ", "/", "\n", "\t":
            return true
        default:
            return false
        }
    }

    private static func firstTopLevelBlock(in html: String, tag: String, close: String) -> TopLevelBlock? {
        guard matchesOpenTagPrefix(html, tag: tag) else { return nil }
        guard let openEnd = html.firstIndex(of: ">") else { return nil }
        guard let closeRange = html.range(of: close, options: .caseInsensitive, range: openEnd..<html.endIndex) else {
            return nil
        }
        let inner = String(html[html.index(after: openEnd)..<closeRange.lowerBound])
        return TopLevelBlock(inner: inner, end: closeRange.upperBound)
    }

    /// Returns the suffix after `end`, or `nil` when `end` is out of bounds (malformed HTML).
    private static func remainderSuffix(from remainder: String, after end: String.Index) -> String? {
        guard end <= remainder.endIndex else { return nil }
        return String(remainder[end...])
    }

    private static func paragraphPlain(fromInnerHTML inner: String) -> String {
        let trimmed = inner.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        let brOnly = trimmed
            .replacingOccurrences(of: "&nbsp;", with: " ", options: .caseInsensitive)
            .replacingOccurrences(of: "&#160;", with: "", options: .caseInsensitive)
            .replacingOccurrences(of: "<br\\s*/?>", with: "", options: [.regularExpression, .caseInsensitive])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if brOnly.isEmpty { return "" }
        return inlinePlain(fromHTML: inner)
    }

    private static func bulletListPlain(fromInnerHTML inner: String) -> String {
        listItems(fromInnerHTML: inner).map { "\u{2022} \($0)" }.joined(separator: "\n")
    }

    private static func orderedListPlain(fromInnerHTML inner: String) -> String {
        listItems(fromInnerHTML: inner).enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
    }

    private static func listItems(fromInnerHTML inner: String) -> [String] {
        var items: [String] = []
        var remainder = inner
        while !remainder.isEmpty {
            remainder = remainder.trimmingCharacters(in: .whitespacesAndNewlines)
            if remainder.isEmpty { break }
            if let match = firstTopLevelBlock(in: remainder, tag: "li", close: "</li>") {
                let text = inlinePlain(fromHTML: match.inner).trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { items.append(text) }
                guard let next = remainderSuffix(from: remainder, after: match.end) else { break }
                remainder = next
            } else if let tagEnd = remainder.firstIndex(of: ">") {
                remainder = String(remainder[remainder.index(after: tagEnd)...])
            } else {
                break
            }
        }
        return items
    }

    private static func joinPlainSegments(_ segments: [String]) -> String {
        guard !segments.isEmpty else { return "" }
        var out = segments[0]
        for i in 1..<segments.count {
            let prev = segments[i - 1]
            let segment = segments[i]
            if segment == "---" || prev == "---" {
                out += "\n"
                out += segment
            } else if segment.isEmpty {
                // Intentional blank-line paragraph (`<p><br></p>`). The first blank after
                // content also closes the preceding line (`\n\n`); each *additional*
                // consecutive blank adds a single line (`\n`) so N stacked `<p><br></p>`
                // map to N blank lines, not 2N.
                out += prev.isEmpty ? "\n" : "\n\n"
            } else if prev.isEmpty {
                // Content after blank-line paragraph — no extra separator.
                out += segment
            } else {
                // Normal paragraph break — single `\n` matches native Enter behavior in NSTextView.
                out += "\n" + segment
            }
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func inlinePlain(fromHTML html: String) -> String {
        var s = html
        // Scripture pills → plain reference text
        s = s.replacingOccurrences(
            of: "<span[^>]*data-scripture-reference\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>[\\s\\S]*?</span>",
            with: "$1",
            options: [.regularExpression, .caseInsensitive]
        )
        // Links → markdown-style or bare URL
        s = replaceAnchors(in: s)
        // Line breaks
        s = s.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: [.regularExpression, .caseInsensitive])
        // Strip remaining tags
        s = s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        s = decodeHTMLEntities(s)
        return s
    }

    private static func replaceAnchors(in html: String) -> String {
        guard let regex = try? NSRegularExpression(
            pattern: "<a\\s[^>]*href\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>([\\s\\S]*?)</a>",
            options: [.caseInsensitive]
        ) else { return html }
        let ns = html as NSString
        var out = ""
        var cursor = 0
        let matches = regex.matches(in: html, range: NSRange(location: 0, length: ns.length))
        for m in matches {
            if m.range.location > cursor {
                out += ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor))
            }
            let href = ns.substring(with: m.range(at: 1))
            let label = decodeHTMLEntities(
                ns.substring(with: m.range(at: 2))
                    .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            )
            if label.isEmpty || label == href {
                out += href
            } else {
                out += "[\(label)](\(href))"
            }
            cursor = m.range.location + m.range.length
        }
        if cursor < ns.length {
            out += ns.substring(from: cursor)
        }
        return out.isEmpty ? html : out
    }

    private static func decodeHTMLEntities(_ s: String) -> String {
        s.replacingOccurrences(of: "&nbsp;", with: " ", options: .caseInsensitive)
            .replacingOccurrences(of: "&#160;", with: " ", options: .caseInsensitive)
            .replacingOccurrences(of: "&amp;", with: "&", options: .caseInsensitive)
            .replacingOccurrences(of: "&lt;", with: "<", options: .caseInsensitive)
            .replacingOccurrences(of: "&gt;", with: ">", options: .caseInsensitive)
            .replacingOccurrences(of: "&quot;", with: "\"", options: .caseInsensitive)
            .replacingOccurrences(of: "&#39;", with: "'", options: .caseInsensitive)
            .replacingOccurrences(of: "&apos;", with: "'", options: .caseInsensitive)
    }

    // MARK: - Inline conversion (plain → HTML)

    private static func inlineHTML(_ text: String, accents: [String: String]) -> String {
        let ns = text as NSString
        let full = NSRange(location: 0, length: ns.length)
        let matches = linkRegex.matches(in: text, range: full)
        guard !matches.isEmpty else { return injectAccentPills(text, accents: accents) }

        var out = ""
        var cursor = 0
        for m in matches {
            if m.range.location > cursor {
                out += injectAccentPills(ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor)), accents: accents)
            }
            out += linkHTML(ns.substring(with: m.range))
            cursor = m.range.location + m.range.length
        }
        if cursor < ns.length {
            out += injectAccentPills(ns.substring(from: cursor), accents: accents)
        }
        return out
    }

    private static func linkHTML(_ token: String) -> String {
        if token.hasPrefix("["),
           let close = token.firstIndex(of: "]"),
           let lp = token.firstIndex(of: "("),
           let rp = token.lastIndex(of: ")") {
            let label = String(token[token.index(after: token.startIndex)..<close])
            let href = String(token[token.index(after: lp)..<rp])
            return "<a href=\"\(escapeAttribute(href))\">\(escapeHTML(label))</a>"
        }
        // Bare URL
        return "<a href=\"\(escapeAttribute(token))\">\(escapeHTML(token))</a>"
    }

    /// Wraps only those detected references that have an accent override in a pending
    /// pill span; everything else is escaped plain text for the server to pill normally.
    private static func injectAccentPills(_ text: String, accents: [String: String]) -> String {
        guard !accents.isEmpty else { return escapeHTML(text) }
        let matches = ScriptureDetector.detect(in: text)
        guard !matches.isEmpty else { return escapeHTML(text) }

        let ns = text as NSString
        var out = ""
        var cursor = 0
        for match in matches.sorted(by: { $0.range.location < $1.range.location }) {
            guard match.range.location >= cursor, let accent = accents[match.displayText] else { continue }
            if match.range.location > cursor {
                out += escapeHTML(ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor)))
            }
            out += "<span data-scripture-reference=\"\(escapeAttribute(match.displayText))\" data-pill-accent=\"\(escapeAttribute(accent))\">\(escapeHTML(match.displayText))</span>"
            cursor = match.range.location + match.range.length
        }
        if cursor < ns.length {
            out += escapeHTML(ns.substring(from: cursor))
        }
        return out
    }

    // MARK: - List markers

    private static func isBullet(_ line: String) -> Bool { line.hasPrefix("\u{2022} ") }
    private static func stripBullet(_ line: String) -> String { String(line.dropFirst(2)) }

    private static func isOrdered(_ line: String) -> Bool {
        let r = NSRange(location: 0, length: (line as NSString).length)
        return orderedRegex.firstMatch(in: line, range: r) != nil
    }
    private static func stripOrdered(_ line: String) -> String {
        let ns = line as NSString
        guard let m = orderedRegex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) else { return line }
        return ns.substring(from: m.range.length)
    }

    // MARK: - Escaping

    private static func escapeHTML(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
    private static func escapeAttribute(_ s: String) -> String {
        escapeHTML(s).replacingOccurrences(of: "\"", with: "&quot;")
    }

    // MARK: - Regex

    /// Labeled `[label](href)` (longest alternative first) or a bare http(s) URL.
    private static let linkRegex = try! NSRegularExpression(
        pattern: "(\\[[^\\]]+\\]\\(https?://[^)\\s]+\\))|(https?://[^\\s<]+)")
    private static let orderedRegex = try! NSRegularExpression(pattern: "^\\d+\\.\\s+")
    private static let spanOpenRegex = try! NSRegularExpression(pattern: "<span\\b[^>]*>", options: [.caseInsensitive])
    private static let refAttrRegex = try! NSRegularExpression(pattern: "data-scripture-reference\\s*=\\s*[\"']([^\"']+)[\"']", options: [.caseInsensitive])
    private static let accentAttrRegex = try! NSRegularExpression(pattern: "data-pill-accent\\s*=\\s*[\"']([^\"']+)[\"']", options: [.caseInsensitive])

    private static func firstCapture(_ regex: NSRegularExpression, in text: String) -> String? {
        let ns = text as NSString
        guard let m = regex.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges > 1 else { return nil }
        return ns.substring(with: m.range(at: 1))
    }
}
