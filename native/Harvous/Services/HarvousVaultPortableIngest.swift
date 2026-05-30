import Foundation

/// Normalize external annotated documents into `HarvousVaultParsedDocument`.
enum HarvousVaultPortableIngest {
    static func parseExternalMarkdown(_ text: String, titleFallback: String) -> HarvousVaultParsedDocument {
        var doc = HarvousVaultMarkdown.parseDocument(text)
        if doc.title == nil || doc.title?.isEmpty == true {
            let heading = firstHeadingTitle(from: doc.body)
            if !heading.isEmpty {
                doc.title = heading
            } else {
                doc.title = titleFallback
            }
        }
        return doc
    }

    static func parseHTML(_ html: String, titleFallback: String) -> HarvousVaultParsedDocument {
        var highlights: [HarvousVaultPortableHighlight] = []

        if let markRe = try? NSRegularExpression(pattern: "<mark[^>]*data-color=\"([^\"]*)\"[^>]*>([\\s\\S]*?)</mark>", options: [.caseInsensitive]) {
            let range = NSRange(html.startIndex..., in: html)
            for m in markRe.matches(in: html, options: [], range: range) {
                guard m.numberOfRanges >= 3,
                      let accentR = Range(m.range(at: 1), in: html),
                      let textR = Range(m.range(at: 2), in: html) else { continue }
                let accent = String(html[accentR])
                let text = stripHTML(String(html[textR])).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { continue }
                highlights.append(HarvousVaultPortableHighlight(kind: StudyThread.EntryKind.miniNote.rawValue, accent: accent, anchorText: text))
            }
        }

        let body = stripHTML(html)
        var doc = HarvousVaultParsedDocument(body: body)
        doc.title = titleFallback
        doc.highlights = highlights.isEmpty ? HarvousVaultMarkdown.inferHighlightsFromBody(body) : highlights
        doc.body = HarvousVaultMarkdown.injectObsidianHighlights(body, highlights: doc.highlights)
        return doc
    }

    #if os(macOS)
    static func parseDocx(at url: URL, titleFallback: String) -> HarvousVaultParsedDocument? {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("harvous-docx-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: tmp) }
        do {
            try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
            p.arguments = ["-q", "-o", url.path, "-d", tmp.path]
            try p.run()
            p.waitUntilExit()
            guard p.terminationStatus == 0 else { return nil }

            let docURL = tmp.appendingPathComponent("word/document.xml")
            let commentsURL = tmp.appendingPathComponent("word/comments.xml")
            let documentXML = (try? String(contentsOf: docURL, encoding: .utf8)) ?? ""
            let commentsXML = (try? String(contentsOf: commentsURL, encoding: .utf8)) ?? ""
            let plain = stripXML(documentXML)
            var highlights = parseDocxHighlights(documentXML: documentXML, commentsXML: commentsXML, plainText: plain)
            if highlights.isEmpty {
                highlights = HarvousVaultMarkdown.inferHighlightsFromBody(plain)
            }
            var doc = HarvousVaultParsedDocument(body: plain)
            doc.title = titleFallback
            doc.highlights = highlights
            doc.body = HarvousVaultMarkdown.injectObsidianHighlights(plain, highlights: highlights)
            return doc
        } catch {
            return nil
        }
    }
    #endif

    private static func parseDocxHighlights(documentXML: String, commentsXML: String, plainText: String) -> [HarvousVaultPortableHighlight] {
        var comments: [String: String] = [:]
        if let re = try? NSRegularExpression(pattern: "<w:comment[^>]*w:id=\"(\\d+)\"[^>]*>([\\s\\S]*?)</w:comment>", options: []) {
            let range = NSRange(commentsXML.startIndex..., in: commentsXML)
            for m in re.matches(in: commentsXML, options: [], range: range) {
                guard m.numberOfRanges >= 3,
                      let idR = Range(m.range(at: 1), in: commentsXML),
                      let bodyR = Range(m.range(at: 2), in: commentsXML) else { continue }
                let id = String(commentsXML[idR])
                let text = stripXML(String(commentsXML[bodyR])).trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { comments[id] = text }
            }
        }

        var highlights: [HarvousVaultPortableHighlight] = []
        if let startRe = try? NSRegularExpression(pattern: "<w:commentRangeStart w:id=\"(\\d+)\"", options: []) {
            let range = NSRange(documentXML.startIndex..., in: documentXML)
            for m in startRe.matches(in: documentXML, options: [], range: range) {
                guard m.numberOfRanges >= 2, let idR = Range(m.range(at: 1), in: documentXML) else { continue }
                let id = String(documentXML[idR])
                let annotation = comments[id] ?? ""
                let sliceStart = m.range.location
                let endPattern = "<w:commentRangeEnd w:id=\"\(id)\"/>"
                let endRange = (documentXML as NSString).range(of: endPattern, options: [], range: NSRange(location: sliceStart, length: documentXML.count - sliceStart))
                guard endRange.location != NSNotFound else { continue }
                let slice = (documentXML as NSString).substring(with: NSRange(location: sliceStart, length: endRange.location + endRange.length - sliceStart))
                let anchor = stripXML(slice).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !anchor.isEmpty || !annotation.isEmpty else { continue }
                highlights.append(
                    HarvousVaultPortableHighlight(
                        kind: StudyThread.EntryKind.miniNote.rawValue,
                        accent: StudyHighlightAccentToken.warmAmber.rawValue,
                        anchorText: anchor.isEmpty ? String(annotation.prefix(40)) : anchor,
                        annotation: annotation.isEmpty ? nil : annotation
                    )
                )
            }
        }

        if highlights.isEmpty, !plainText.isEmpty, let first = comments.values.first {
            highlights.append(
                HarvousVaultPortableHighlight(
                    kind: StudyThread.EntryKind.miniNote.rawValue,
                    accent: StudyHighlightAccentToken.warmAmber.rawValue,
                    anchorText: String(plainText.prefix(min(80, plainText.count))),
                    annotation: first
                )
            )
        }
        return highlights
    }

    private static func stripXML(_ xml: String) -> String {
        xml.replacingOccurrences(of: "<w:tab/>", with: "\t")
            .replacingOccurrences(of: "<w:br[^>]*/>", with: "\n", options: .regularExpression)
            .replacingOccurrences(of: "</w:p>", with: "\n")
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func stripHTML(_ html: String) -> String {
        html.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: "</p>", with: "\n\n", options: .caseInsensitive)
            .replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func firstHeadingTitle(from body: String) -> String {
        let b = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let r = b.range(of: "^#\\s+.+$", options: .regularExpression) else { return "" }
        let line = String(b[r])
        return line.dropFirst().trimmingCharacters(in: .whitespacesAndNewlines).description
    }
}
