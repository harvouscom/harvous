import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Supported third-party / file imports (non-Harvous markdown).
enum HarvousVaultImportFormats {
    // MARK: - Plain / HTML / Doc

    static func loadPlainText(from url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
    }

    static func loadRTFAttributed(from url: URL) throws -> NSAttributedString {
        let opts: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.rtf
        ]
        return try NSAttributedString(url: url, options: opts, documentAttributes: nil)
    }

    static func loadHTMLAttributed(from url: URL) throws -> NSAttributedString {
        let data = try Data(contentsOf: url)
        let opts: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue
        ]
        return try NSAttributedString(data: data, options: opts, documentAttributes: nil)
    }

    static func loadOfficeDocAttributed(from url: URL) throws -> NSAttributedString {
        #if os(macOS)
        let opts: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.officeOpenXML
        ]
        return try NSAttributedString(url: url, options: opts, documentAttributes: nil)
        #else
        throw NSError(
            domain: "HarvousVault",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "Word (.docx) import is only available on macOS. Export as HTML or plain text and try again."]
        )
        #endif
    }

    static func attributedPlain(_ attr: NSAttributedString) -> String {
        attr.string
    }

    // MARK: - Notion-style filename

    /// Strips trailing ` <32 hex>.md` Notion export suffix from the basename.
    static func notionStrippedBasename(_ filename: String) -> String {
        let base = (filename as NSString).deletingPathExtension
        guard let r = base.range(of: " [0-9a-f]{32}$", options: .regularExpression) else { return base }
        return String(base[..<r.lowerBound])
    }

    // MARK: - ENEX (Evernote)

    struct ParsedEnexNote {
        var title: String
        var created: Date?
        var updated: Date?
        var tags: [String]
        var htmlBody: String
    }

    static func parseEnex(data: Data) throws -> [ParsedEnexNote] {
        guard let xml = String(data: data, encoding: .utf8) else { return [] }
        var notes: [ParsedEnexNote] = []
        let chunks = xml.components(separatedBy: "<note>")
        for chunk in chunks.dropFirst() {
            guard let notePart = chunk.split(separator: "</note>", maxSplits: 1).first else { continue }
            let block = String(notePart)
            let title = firstXMLTagContent(block, tag: "title") ?? "Untitled"
            let created = enexDate(firstXMLTagContent(block, tag: "created"))
            let updated = enexDate(firstXMLTagContent(block, tag: "updated"))
            var tags: [String] = []
            for m in matches(block, pattern: "<tag>([^<]+)</tag>") {
                let t = m.trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty { tags.append(t) }
            }
            let content = extractCDATA(afterTag: "content", in: block) ?? ""
            let htmlInner = firstXMLTagContent(content, tag: "en-note") ?? content
            notes.append(ParsedEnexNote(title: title, created: created, updated: updated, tags: tags, htmlBody: htmlInner))
        }
        return notes
    }

    private static func enexDate(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(secondsFromGMT: 0)
        df.dateFormat = "yyyyMMdd'T'HHmmssZ"
        return df.date(from: raw)
    }

    private static func firstXMLTagContent(_ xml: String, tag: String) -> String? {
        let open = "<\(tag)>"
        let close = "</\(tag)>"
        guard let s = xml.range(of: open), let e = xml.range(of: close) else { return nil }
        let inner = xml[s.upperBound..<e.lowerBound]
        return String(inner).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func extractCDATA(afterTag tag: String, in xml: String) -> String? {
        guard let r = xml.range(of: "<\(tag)>") else { return nil }
        let rest = xml[r.upperBound...]
        guard let cdataStart = rest.range(of: "<![CDATA[") else { return nil }
        let after = rest[cdataStart.upperBound...]
        guard let cdataEnd = after.range(of: "]]>") else { return nil }
        return String(after[..<cdataEnd.lowerBound])
    }

    private static func matches(_ text: String, pattern: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: []) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return re.matches(in: text, options: [], range: range).compactMap { m in
            guard m.numberOfRanges >= 2, let r = Range(m.range(at: 1), in: text) else { return nil }
            return String(text[r])
        }
    }

    // MARK: - ZIP (macOS)

    #if os(macOS)
    static func unzipNotionExport(at zipURL: URL, to destDir: URL) throws {
        try FileManager.default.createDirectory(at: destDir, withIntermediateDirectories: true)
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        p.arguments = ["-q", "-o", zipURL.path, "-d", destDir.path]
        try p.run()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else {
            throw NSError(domain: "HarvousVault", code: 1, userInfo: [NSLocalizedDescriptionKey: "unzip failed"])
        }
    }
    #endif
}
