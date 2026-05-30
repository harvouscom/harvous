import Foundation

/// Portable highlight row (YAML `highlights:` / `highlightsJSON` frontmatter).
struct HarvousVaultPortableHighlight: Codable, Equatable {
    var id: String?
    var kind: String?
    var accent: String?
    var anchorText: String?
    var anchorLocation: Int?
    var anchorLength: Int?
    var annotation: String?
    var focusTitle: String?
    var notesBody: String?
    var scriptureReference: String?
    var scriptureTranslation: String?
    var scriptureExcerpt: String?
    var linkedNoteId: String?
    var linkedNoteTitle: String?
}

/// Parsed Harvous note document (subset of YAML we emit).
struct HarvousVaultParsedDocument {
    var id: UUID?
    var createdAt: Date?
    var updatedAt: Date?
    var spaceName: String?
    var title: String?
    var threadName: String?
    var threadColor: String?
    var noteType: String?
    var scriptureReference: String?
    var scriptureTranslation: String?
    var tags: [String] = []
    /// Primary folder from YAML `folder:` or legacy `collection:`.
    var folder: String?
    var refs: [String] = []
    var pinned: Bool = false
    var rating: Int?
    var accentJSON: String?
    var highlights: [HarvousVaultPortableHighlight] = []
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

    static func isoString(for date: Date) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.string(from: date)
    }

    static func parseDocument(_ text: String) -> HarvousVaultParsedDocument {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("---\n") || trimmed.hasPrefix("---\r\n") else {
            var doc = HarvousVaultParsedDocument(body: text)
            doc.highlights = inferHighlightsFromBody(text)
            return doc
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
        var body = String(rest[bodyStart...])
        body = stripPortableCallouts(body)
        var doc = HarvousVaultParsedDocument(body: body)
        parseFrontmatterLines(fmBlock, into: &doc)
        if let t = doc.title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty {
            doc.body = stripLeadingTitle(doc.body, title: t)
        }
        if doc.highlights.isEmpty {
            doc.highlights = inferHighlightsFromBody(doc.body)
        }
        return doc
    }

    private static func stripLeadingTitle(_ body: String, title: String) -> String {
        let lines = body.split(separator: "\n", omittingEmptySubsequences: false)
        guard let first = lines.first, first.trimmingCharacters(in: .whitespaces) == "# \(title)" else {
            return body.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return lines.dropFirst().joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
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
            case "title":
                doc.title = stripQuotes(val)
            case "created":
                doc.createdAt = parseYMDOrISO(val)
            case "updated":
                doc.updatedAt = parseYMDOrISO(val)
            case "space":
                doc.spaceName = stripQuotes(val)
            case "thread":
                doc.threadName = stripQuotes(val)
            case "threadcolor":
                doc.threadColor = stripQuotes(val)
            case "notetype":
                doc.noteType = stripQuotes(val)
            case "scripturereference":
                doc.scriptureReference = stripQuotes(val)
            case "scripturetranslation":
                doc.scriptureTranslation = stripQuotes(val)
            case "folder":
                doc.folder = stripQuotes(val)
            case "collection":
                if doc.folder == nil {
                    doc.folder = stripQuotes(val)
                }
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
            case "highlightsjson":
                doc.highlights = decodeHighlightsJSON(stripQuotes(val))
            default:
                break
            }
        }
    }

    static func decodeHighlightsJSON(_ json: String) -> [HarvousVaultPortableHighlight] {
        let cleaned = json
            .replacingOccurrences(of: "\\\"", with: "\"")
            .replacingOccurrences(of: "\\\\", with: "\\")
        guard let data = cleaned.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([HarvousVaultPortableHighlight].self, from: data)) ?? []
    }

    static func encodeHighlightsJSON(_ highlights: [HarvousVaultPortableHighlight]) -> String? {
        guard !highlights.isEmpty else { return nil }
        guard let data = try? JSONEncoder().encode(highlights),
              let s = String(data: data, encoding: .utf8) else { return nil }
        return s
    }

    static func portableHighlights(from threads: [StudyThread]) -> [HarvousVaultPortableHighlight] {
        threads.compactMap { thread in
            let kind = thread.entryKindRaw
            if kind == StudyThread.EntryKind.workspace.rawValue,
               thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               thread.notesBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return nil
            }
            let anchor = (thread.anchorTextSnapshot ?? thread.sourceSnippet).trimmingCharacters(in: .whitespacesAndNewlines)
            let annotation = thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? thread.notesBody.trimmingCharacters(in: .whitespacesAndNewlines)
                : thread.miniNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
            var h = HarvousVaultPortableHighlight(
                id: thread.serverId ?? thread.id.uuidString,
                kind: kind,
                accent: thread.highlightAccentRaw,
                anchorText: anchor.isEmpty ? nil : anchor,
                anchorLocation: thread.anchorLocation,
                anchorLength: thread.anchorLength,
                annotation: annotation.isEmpty ? nil : annotation,
                focusTitle: thread.focusTitle.isEmpty ? nil : thread.focusTitle,
                notesBody: thread.notesBody.isEmpty ? nil : thread.notesBody,
                scriptureReference: thread.scriptureReference,
                scriptureTranslation: thread.scripturePassageTranslation,
                scriptureExcerpt: thread.scripturePassageExcerpt
            )
            if let lid = thread.linkedNoteId {
                h.linkedNoteId = lid.uuidString
            }
            if !thread.linkedNoteTitle.isEmpty {
                h.linkedNoteTitle = thread.linkedNoteTitle
            }
            return h
        }
    }

    static func buildMarkdown(note: Note, spaceName: String) -> String {
        let highlights = portableHighlights(from: note.studyThreads)
        let id = note.id.uuidString
        let created = isoString(for: note.createdAt)
        let updated = isoString(for: note.updatedAt)
        let tags = note.tags.map { quoteYamlString($0) }.joined(separator: ", ")
        let refs = note.detectedRefs.map { quoteYamlString($0) }.joined(separator: ", ")
        let pins = note.isPinned ? "true" : "false"
        var lines: [String] = []
        lines.append("---")
        lines.append("id: \(id)")
        lines.append("title: \(quoteYamlString(note.title))")
        lines.append("created: \(created)")
        lines.append("updated: \(updated)")
        lines.append("space: \(quoteYamlString(spaceName))")
        if let tc = note.threadColor?.trimmingCharacters(in: .whitespacesAndNewlines), !tc.isEmpty {
            lines.append("threadColor: \(quoteYamlString(tc))")
        }
        if !note.tags.isEmpty {
            lines.append("tags: [\(tags)]")
        }
        if let pc = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines), !pc.isEmpty {
            lines.append("folder: \(quoteYamlString(pc))")
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
        if let hj = encodeHighlightsJSON(highlights) {
            lines.append("highlightsJSON: \(quoteYamlString(hj))")
        }
        lines.append("---")
        lines.append("")
        let titleLine = note.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !titleLine.isEmpty {
            lines.append("# \(titleLine)")
            lines.append("")
        }
        var body = injectObsidianHighlights(note.body, highlights: highlights)
        lines.append(body)
        for h in highlights {
            if let callout = buildHighlightCallout(h) {
                lines.append(callout)
            }
        }
        if !body.isEmpty, !body.hasSuffix("\n") {
            lines.append("")
        }
        return lines.joined(separator: "\n")
    }

    static func injectObsidianHighlights(_ body: String, highlights: [HarvousVaultPortableHighlight]) -> String {
        var out = body
        for h in highlights {
            guard let text = h.anchorText?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { continue }
            let wrapped = "==\(text)=="
            if out.contains(wrapped) { continue }
            if let range = out.range(of: text) {
                out.replaceSubrange(range, with: wrapped)
            }
        }
        return out
    }

    static func buildHighlightCallout(_ h: HarvousVaultPortableHighlight) -> String? {
        let accent = h.accent ?? StudyHighlightAccentToken.warmAmber.rawValue
        let label: String
        if let anchor = h.anchorText, !anchor.isEmpty {
            label = "Highlight (\(accent)) — \"\(anchor.replacingOccurrences(of: "\"", with: "\\\""))\""
        } else if let ref = h.scriptureReference, !ref.isEmpty {
            label = "Scripture highlight (\(accent)) — \(ref)"
        } else {
            label = "Highlight (\(accent))"
        }
        let text = (h.annotation ?? h.notesBody ?? h.focusTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        var lines = ["", "> [!note] \(label)"]
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            lines.append("> \(line)")
        }
        lines.append("")
        return lines.joined(separator: "\n")
    }

    static func stripPortableCallouts(_ body: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: "\n> \\[!note\\][^\n]*\n(?:> .*\n?)*", options: []) else {
            return body
        }
        let range = NSRange(body.startIndex..., in: body)
        return regex.stringByReplacingMatches(in: body, options: [], range: range, withTemplate: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func inferHighlightsFromBody(_ body: String) -> [HarvousVaultPortableHighlight] {
        guard let regex = try? NSRegularExpression(pattern: "==([^=\\n]+?)==", options: []) else { return [] }
        let range = NSRange(body.startIndex..., in: body)
        let matches = regex.matches(in: body, options: [], range: range)
        return matches.compactMap { m in
            guard m.numberOfRanges >= 2, let r = Range(m.range(at: 1), in: body) else { return nil }
            let text = String(body[r]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return HarvousVaultPortableHighlight(
                kind: StudyThread.EntryKind.miniNote.rawValue,
                accent: StudyHighlightAccentToken.warmAmber.rawValue,
                anchorText: text
            )
        }
    }

    static func makeStudyThread(from h: HarvousVaultPortableHighlight, parent: Note) -> StudyThread {
        let kind = h.kind ?? StudyThread.EntryKind.miniNote.rawValue
        let accent = h.accent ?? StudyHighlightAccentToken.warmAmber.rawValue
        let anchor = h.anchorText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let annotation = h.annotation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let notesBody = h.notesBody?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let miniNote = kind == StudyThread.EntryKind.workspace.rawValue ? "" : annotation
        let workspaceBody = kind == StudyThread.EntryKind.workspace.rawValue ? (notesBody.isEmpty ? annotation : notesBody) : notesBody
        var threadId = UUID()
        if let sid = h.id, let u = UUID(uuidString: sid) {
            threadId = u
        }
        let linkedId = h.linkedNoteId.flatMap { UUID(uuidString: $0) }
        return StudyThread(
            id: threadId,
            spaceId: parent.resolvedSpaceId(),
            parentNoteId: parent.id,
            sourceSnippet: anchor.isEmpty ? (h.scriptureExcerpt ?? "") : anchor,
            focusTitle: h.focusTitle ?? "",
            notesBody: workspaceBody,
            entryKindRaw: kind,
            miniNoteBody: miniNote,
            linkedNoteId: linkedId,
            linkedNoteTitle: h.linkedNoteTitle ?? "",
            anchorLocation: h.anchorLocation,
            anchorLength: h.anchorLength,
            anchorTextSnapshot: anchor.isEmpty ? nil : anchor,
            scriptureReference: h.scriptureReference,
            scripturePassageTranslation: h.scriptureTranslation,
            scripturePassageExcerpt: h.scriptureExcerpt,
            highlightAccentRaw: accent,
            parentNote: parent
        )
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

    private static func quoteYamlString(_ s: String) -> String {
        if s.contains(":") || s.contains("\"") || s.contains("'") || s.contains("\n") || s.contains("[") || s.contains("{") {
            let escaped = s.replacingOccurrences(of: "\"", with: "\\\"")
            return "\"\(escaped)\""
        }
        return s
    }
}
