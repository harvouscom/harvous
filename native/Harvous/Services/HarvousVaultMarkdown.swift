import Foundation

/// Parsed Harvous note document (subset of YAML we emit).
struct HarvousVaultParsedDocument {
    var id: UUID?
    var createdAt: Date?
    var updatedAt: Date?
    var spaceName: String?
    var tags: [String] = []
    var collection: String?
    var refs: [String] = []
    var pinned: Bool = false
    var rating: Int?
    var accentJSON: String?
    var body: String

    init(body: String = "") {
        self.body = body
    }
}

enum HarvousVaultMarkdown {
    private static let cal = Calendar(identifier: .gregorian)

    static func sanitizeSpaceFolderName(_ name: String) -> String {
        let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return "Space" }
        let banned = CharacterSet(charactersIn: "/:\\?%*|\"<>")
        return String(t.unicodeScalars.map { banned.contains($0) ? "_" : Character($0) })
    }

    static func slugTitleForFilename(_ title: String, emptyFallback: String = "Untitled") -> String {
        let t0 = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = t0.isEmpty ? emptyFallback : t0
        let banned = CharacterSet(charactersIn: "/:\\?%*|\"<>\n\r")
        var s = String(base.unicodeScalars.map { banned.contains($0) ? "_" : Character($0) })
        while s.hasSuffix(".") { s.removeLast() }
        if s.count > 80 { s = String(s.prefix(80)) }
        return s.isEmpty ? emptyFallback : s
    }

    static func datePrefix(for date: Date) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: date)
        let y = c.year ?? 0
        let m = c.month ?? 0
        let d = c.day ?? 0
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    static func parseDocument(_ text: String) -> HarvousVaultParsedDocument {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("---\n") || trimmed.hasPrefix("---\r\n") else {
            return HarvousVaultParsedDocument(body: text)
        }
        let rest = String(trimmed.dropFirst(4))
        guard let rEnd = rest.range(of: "\n---") else {
            return HarvousVaultParsedDocument(body: text)
        }
        let fmBlock = String(rest[..<rEnd.lowerBound])
        var bodyStart = rest.index(rEnd.upperBound, offsetBy: 0)
        if bodyStart < rest.endIndex, rest[bodyStart] == "\n" {
            bodyStart = rest.index(after: bodyStart)
        } else if bodyStart < rest.endIndex, rest[bodyStart] == "\r" {
            bodyStart = rest.index(after: bodyStart)
            if bodyStart < rest.endIndex, rest[bodyStart] == "\n" {
                bodyStart = rest.index(after: bodyStart)
            }
        }
        let body = String(rest[bodyStart...])
        var doc = HarvousVaultParsedDocument(body: body)
        parseFrontmatterLines(fmBlock, into: &doc)
        return doc
    }

    private static func parseFrontmatterLines(_ block: String, into doc: inout HarvousVaultParsedDocument) {
        for raw in block.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw).trimmingCharacters(in: .whitespaces)
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = String(line[..<colon]).trimmingCharacters(in: .whitespaces).lowercased()
            var val = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            if val.hasPrefix("#") { continue }

            switch key {
            case "id":
                val = val.replacingOccurrences(of: "\"", with: "")
                doc.id = UUID(uuidString: val)
            case "created":
                doc.createdAt = parseYMDOrISO(val)
            case "updated":
                doc.updatedAt = parseYMDOrISO(val)
            case "space":
                doc.spaceName = stripQuotes(val)
            case "collection":
                doc.collection = stripQuotes(val)
            case "tags":
                doc.tags = parseStringArray(val)
            case "refs":
                doc.refs = parseStringArray(val)
            case "pinned":
                doc.pinned = val.lowercased() == "true" || val == "1"
            case "rating":
                doc.rating = Int(val.replacingOccurrences(of: "\"", with: ""))
            case "scripturepillaccentsjson", "accents":
                doc.accentJSON = stripQuotes(val)
            default:
                break
            }
        }
    }

    private static func stripQuotes(_ s: String) -> String {
        var v = s
        if (v.hasPrefix("\"") && v.hasSuffix("\"")) || (v.hasPrefix("'") && v.hasSuffix("'")) {
            v.removeFirst()
            v.removeLast()
        }
        return v
    }

    private static func parseStringArray(_ val: String) -> [String] {
        let t = val.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("[") && t.hasSuffix("]") {
            let inner = t.dropFirst().dropLast()
            return inner.split(separator: ",").map { stripQuotes(String($0).trimmingCharacters(in: .whitespaces)) }.filter { !$0.isEmpty }
        }
        if !t.isEmpty { return [stripQuotes(t)] }
        return []
    }

    private static func parseYMDOrISO(_ s: String) -> Date? {
        let t = stripQuotes(s.trimmingCharacters(in: .whitespaces))
        let df = DateFormatter()
        df.calendar = cal
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(secondsFromGMT: 0)
        df.dateFormat = "yyyy-MM-dd"
        if let d = df.date(from: t) { return d }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: t) { return d }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: t)
    }

    static func buildMarkdown(note: Note, spaceName: String) -> String {
        let id = note.id.uuidString
        let created = datePrefix(for: note.createdAt)
        let updated = datePrefix(for: note.updatedAt)
        let tags = note.tags.map { quoteYamlString($0) }.joined(separator: ", ")
        let refs = note.detectedRefs.map { quoteYamlString($0) }.joined(separator: ", ")
        let pins = note.isPinned ? "true" : "false"
        var lines: [String] = []
        lines.append("---")
        lines.append("id: \(id)")
        lines.append("created: \(created)")
        lines.append("updated: \(updated)")
        lines.append("space: \(quoteYamlString(spaceName))")
        if !note.tags.isEmpty {
            lines.append("tags: [\(tags)]")
        }
        if let pc = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines), !pc.isEmpty {
            lines.append("collection: \(quoteYamlString(pc))")
        }
        if !note.detectedRefs.isEmpty {
            lines.append("refs: [\(refs)]")
        }
        if let r = note.rating, (1...7).contains(r) {
            lines.append("rating: \(r)")
        }
        lines.append("pinned: \(pins)")
        if note.scripturePillAccentsJSON != "{}" && !note.scripturePillAccentsJSON.isEmpty {
            lines.append("scripturePillAccentsJSON: \(quoteYamlString(note.scripturePillAccentsJSON))")
        }
        lines.append("---")
        lines.append("")
        let titleLine = note.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !titleLine.isEmpty {
            lines.append("# \(titleLine)")
            lines.append("")
        }
        lines.append(note.body)
        if !note.body.isEmpty, !note.body.hasSuffix("\n") {
            lines.append("")
        }
        return lines.joined(separator: "\n")
    }

    private static func quoteYamlString(_ s: String) -> String {
        if s.contains(":") || s.contains("\"") || s.contains("'") || s.contains("\n") || s.contains("[") {
            let escaped = s.replacingOccurrences(of: "\"", with: "\\\"")
            return "\"\(escaped)\""
        }
        return s
    }
}
