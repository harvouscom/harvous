import Foundation
import SwiftData
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Report

struct HarvousImportReport {
    var imported: Int = 0
    var updated: Int = 0
    var highlightsImported: Int = 0
    /// Distinct folder labels (primary + secondary) touched during import.
    var foldersTouched: Set<String> = []
    var skipped: [(url: URL, reason: String)] = []
    var logLines: [String] = []

    /// Notes/highlights/folders counts, matching the web My Data import summary.
    var summaryLine: String {
        let notes = imported + updated
        var parts: [String] = ["\(notes) note\(notes == 1 ? "" : "s")"]
        if highlightsImported > 0 {
            parts.append("\(highlightsImported) highlight\(highlightsImported == 1 ? "" : "s")")
        }
        if !foldersTouched.isEmpty {
            parts.append("\(foldersTouched.count) folder\(foldersTouched.count == 1 ? "" : "s")")
        }
        if !skipped.isEmpty {
            parts.append("\(skipped.count) skipped")
        }
        return "Import complete (\(parts.joined(separator: ", ")))."
    }

    func writeLog(to url: URL) throws {
        var t = logLines.joined(separator: "\n")
        if !t.isEmpty { t += "\n" }
        t += summaryLine + "\n"
        try t.write(to: url, atomically: true, encoding: .utf8)
    }
}

extension Notification.Name {
    /// Posted after `HarvousVaultImporter.importItems` when `surfaceImportSummary` is true.
    static let harvousVaultImportSummary = Notification.Name("Harvous.vaultImportSummary")
}

/// Boxed report for `NotificationCenter` delivery.
final class HarvousVaultImportSummaryPayload: NSObject {
    let report: HarvousImportReport
    let logFileURL: URL?

    init(report: HarvousImportReport, logFileURL: URL? = nil) {
        self.report = report
        self.logFileURL = logFileURL
    }
}

// MARK: - Importer

@MainActor
enum HarvousVaultImporter {
    private static let skipDirNames: Set<String> = ["_harvous", ".git", ".obsidian"]

    /// Import files or folders into the given space.
    static func importItems(
        urls: [URL],
        targetSpaceId: UUID,
        modelContext: ModelContext,
        skipVaultRewrite: Bool = false,
        surfaceImportSummary: Bool = false
    ) -> HarvousImportReport {
        var report = HarvousImportReport()
        for url in urls {
            importOne(url: url, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report)
        }
        try? modelContext.saveWithLogging()
        if !skipVaultRewrite {
            HarvousVaultExporter.rewriteAllNotes(modelContext: modelContext)
        }
        if surfaceImportSummary {
            NotificationCenter.default.post(
                name: .harvousVaultImportSummary,
                object: HarvousVaultImportSummaryPayload(report: report)
            )
        }
        return report
    }

    /// Scan the vault mirror and upsert notes + study threads from Markdown + sidecars. Never deletes SwiftData rows missing from disk.
    static func rebuildLibraryFromVault(modelContext: ModelContext) -> HarvousImportReport {
        var report = HarvousImportReport()
        do {
            try HarvousVaultLocation.withSecurityScopeIfNeeded {
                let root = try HarvousVaultLocation.vaultRootURL()
                let fm = FileManager.default
                let top = try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
                for dirURL in top {
                    let name = dirURL.lastPathComponent
                    if name == "_harvous" || name.hasPrefix(".") { continue }
                    let isDir = (try? dirURL.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
                    guard isDir else { continue }
                    guard let spaceId = spaceIdMatchingFolderName(name, modelContext: modelContext) else {
                        report.logLines.append("no space match for folder \(name)")
                        continue
                    }
                    let files = (try? fm.contentsOfDirectory(at: dirURL, includingPropertiesForKeys: nil)) ?? []
                    for file in files where file.pathExtension.lowercased() == "md" {
                        do {
                            let raw = try String(contentsOf: file, encoding: .utf8)
                            let doc = HarvousVaultMarkdown.parseDocument(raw)
                            let (note, _) = applyVaultMirrorDoc(
                                doc: doc,
                                fallbackTitle: file.deletingPathExtension().lastPathComponent,
                                targetSpaceId: spaceId,
                                modelContext: modelContext,
                                report: &report,
                                sourceLabel: file.path
                            )
                            if !doc.highlights.isEmpty {
                                applyPortableHighlights(doc.highlights, to: note, modelContext: modelContext, report: &report)
                            } else {
                                try restoreHighlightsIfPresent(noteId: note.id, root: root, modelContext: modelContext, report: &report)
                            }
                        } catch {
                            report.logLines.append("rebuild read error \(file.lastPathComponent): \(error)")
                        }
                    }
                }
                try? modelContext.saveWithLogging()
                HarvousVaultExporter.rewriteAllNotes(modelContext: modelContext)
            }
        } catch {
            report.logLines.append("rebuild vault scan failed: \(error.localizedDescription)")
        }
        return report
    }

    private static func spaceIdMatchingFolderName(_ folder: String, modelContext: ModelContext) -> UUID? {
        let fd = FetchDescriptor<Space>(predicate: #Predicate { !$0.isArchived })
        let spaces = (try? modelContext.fetch(fd)) ?? []
        for s in spaces {
            if HarvousVaultMarkdown.sanitizeSpaceFolderName(s.name) == folder { return s.id }
        }
        if folder == "My Home" { return HarvousSpaceBootstrap.personalHomeSpaceId }
        return spaces.first?.id
    }

    private static func restoreHighlightsIfPresent(noteId: UUID?, root: URL, modelContext: ModelContext, report: inout HarvousImportReport) throws {
        guard let noteId else { return }
        let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == noteId })
        guard let parent = try modelContext.fetch(fd).first else { return }
        let hl = root
            .appendingPathComponent("_harvous", isDirectory: true)
            .appendingPathComponent("highlights", isDirectory: true)
            .appendingPathComponent("\(noteId.uuidString).json")
        guard FileManager.default.fileExists(atPath: hl.path) else { return }
        let data = try Data(contentsOf: hl)
        let file = try JSONDecoder().decode(HarvousVaultStudyThreadsFile.self, from: data)
        for t in parent.studyThreads {
            modelContext.delete(t)
        }
        parent.studyThreads.removeAll()
        for dto in file.threads {
            let st = dto.makeStudyThread(parent: parent)
            modelContext.insert(st)
        }
        report.highlightsImported += file.threads.count
    }

    private static func importOne(
        url: URL,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport,
        folderPath: String = ""
    ) {
        let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
        if isDir {
            let name = url.lastPathComponent
            let dirPath = folderPath.isEmpty ? name : "\(folderPath)/\(name)"
            importDirectory(url: url, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, folderPath: dirPath)
            return
        }
        let ext = url.pathExtension.lowercased()
        switch ext {
        case "md", "markdown", "txt":
            importMarkdownFile(url: url, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, folderPath: folderPath)
        case "enex":
            importEnex(url: url, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report)
        case "html", "htm":
            importHTML(url: url, title: url.deletingPathExtension().lastPathComponent, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, folderPath: folderPath)
        case "rtf":
            importAttributedTry(url: url, loader: HarvousVaultImportFormats.loadRTFAttributed, titleFallback: url.deletingPathExtension().lastPathComponent, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, folderPath: folderPath)
        case "docx":
            importDocx(url: url, titleFallback: url.deletingPathExtension().lastPathComponent, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, folderPath: folderPath)
        case "csv":
            importCSV(url: url, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report)
        case "zip":
            #if os(macOS)
            importZip(url: url, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report)
            #else
            report.skipped.append((url, "ZIP: extract the archive first, then import the folder (full ZIP support is on macOS)."))
            report.logLines.append("skipped zip (iOS): \(url.lastPathComponent)")
            #endif
        default:
            report.skipped.append((url, "Unsupported type (.\(ext))"))
            report.logLines.append("skipped unsupported: \(url.path)")
        }
    }

    #if os(macOS)
    private static func importZip(
        url: URL,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport
    ) {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("harvous-unzip-\(UUID().uuidString)", isDirectory: true)
        do {
            try HarvousVaultImportFormats.unzipNotionExport(at: url, to: tmp)
            importDirectory(url: tmp, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report)
            try? FileManager.default.removeItem(at: tmp)
        } catch {
            report.skipped.append((url, "Could not read ZIP: \(error.localizedDescription)"))
            report.logLines.append("zip error: \(error)")
            try? FileManager.default.removeItem(at: tmp)
        }
    }
    #endif

    /// `folderPath` is the import-relative path of `url` (including its own name),
    /// used to derive note folders (leaf = primary, ancestors = secondary).
    private static func importDirectory(
        url: URL,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport,
        folderPath: String = ""
    ) {
        let fm = FileManager.default
        guard let iter = try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) else {
            report.skipped.append((url, "Could not read directory"))
            return
        }
        for child in iter {
            let name = child.lastPathComponent
            if name.hasPrefix(".") { continue }
            if skipDirNames.contains(name) { continue }
            // Children (file or dir) pass through importOne, which appends a dir's
            // own name to folderPath before recursing.
            importOne(url: child, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, folderPath: folderPath)
        }
    }

    private static func importMarkdownFile(
        url: URL,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport,
        folderPath: String = ""
    ) {
        do {
            let raw = try HarvousVaultImportFormats.loadPlainText(from: url)
            let baseTitle = HarvousVaultImportFormats.notionStrippedBasename(url.lastPathComponent)
            let doc = HarvousVaultPortableIngest.parseExternalMarkdown(raw, titleFallback: baseTitle)
            let (note, _) = applyVaultMirrorDoc(doc: doc, fallbackTitle: baseTitle, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, sourceLabel: url.lastPathComponent, folderPath: folderPath)
            if !doc.highlights.isEmpty {
                applyPortableHighlights(doc.highlights, to: note, modelContext: modelContext, report: &report)
            }
        } catch {
            report.skipped.append((url, error.localizedDescription))
            report.logLines.append("md error \(url.lastPathComponent): \(error)")
        }
    }

    private static func importEnex(
        url: URL,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport
    ) {
        do {
            let data = try Data(contentsOf: url)
            let parsed = try HarvousVaultImportFormats.parseEnex(data: data)
            for note in parsed {
                let plain: String = {
                    if let d = note.htmlBody.data(using: .utf8) {
                        let opts: [NSAttributedString.DocumentReadingOptionKey: Any] = [
                            .documentType: NSAttributedString.DocumentType.html,
                            .characterEncoding: String.Encoding.utf8.rawValue
                        ]
                        if let a = try? NSAttributedString(data: d, options: opts, documentAttributes: nil) {
                            return a.string
                        }
                    }
                    return note.htmlBody
                }()
                var doc = HarvousVaultParsedDocument(body: plain)
                doc.tags = note.tags
                doc.createdAt = note.created
                doc.updatedAt = note.updated
                _ = applyVaultMirrorDoc(doc: doc, fallbackTitle: note.title, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, sourceLabel: "enex:\(note.title)")
            }
        } catch {
            report.skipped.append((url, error.localizedDescription))
            report.logLines.append("enex error: \(error)")
        }
    }

    private static func importHTML(
        url: URL,
        title: String,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport,
        folderPath: String = ""
    ) {
        do {
            let html = try HarvousVaultImportFormats.loadPlainText(from: url)
            let doc = HarvousVaultPortableIngest.parseHTML(html, titleFallback: title)
            let (note, _) = applyVaultMirrorDoc(doc: doc, fallbackTitle: title, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, sourceLabel: url.lastPathComponent, folderPath: folderPath)
            if !doc.highlights.isEmpty {
                applyPortableHighlights(doc.highlights, to: note, modelContext: modelContext, report: &report)
            }
        } catch {
            report.skipped.append((url, error.localizedDescription))
        }
    }

    private static func importDocx(
        url: URL,
        titleFallback: String,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport,
        folderPath: String = ""
    ) {
        #if os(macOS)
        if let doc = HarvousVaultPortableIngest.parseDocx(at: url, titleFallback: titleFallback) {
            let (note, _) = applyVaultMirrorDoc(doc: doc, fallbackTitle: titleFallback, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, sourceLabel: url.lastPathComponent, folderPath: folderPath)
            if !doc.highlights.isEmpty {
                applyPortableHighlights(doc.highlights, to: note, modelContext: modelContext, report: &report)
            }
            return
        }
        #endif
        importAttributedTry(url: url, loader: HarvousVaultImportFormats.loadOfficeDocAttributed, titleFallback: titleFallback, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, folderPath: folderPath)
    }

    private static func importAttributedTry(
        url: URL,
        loader: (URL) throws -> NSAttributedString,
        titleFallback: String,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport,
        folderPath: String = ""
    ) {
        do {
            let a = try loader(url)
            let doc = HarvousVaultParsedDocument(body: HarvousVaultImportFormats.attributedPlain(a))
            _ = applyVaultMirrorDoc(doc: doc, fallbackTitle: titleFallback, targetSpaceId: targetSpaceId, modelContext: modelContext, report: &report, sourceLabel: url.lastPathComponent, folderPath: folderPath)
        } catch {
            report.skipped.append((url, error.localizedDescription))
        }
    }

    /// Harvous web **csv-threads** export: thread title → native `primaryFolder` (not legacy `threadName`).
    private static func importCSV(
        url: URL,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport
    ) {
        do {
            var raw = try HarvousVaultImportFormats.loadPlainText(from: url)
            raw = HarvousVaultImportFormats.stripLeadingBOM(raw)
            let rows = HarvousVaultImportFormats.parseHarvousCSVThreads(raw)
            if rows.isEmpty {
                report.skipped.append((url, "No data rows in CSV"))
                report.logLines.append("csv empty: \(url.lastPathComponent)")
                return
            }
            for row in rows {
                let titleRaw = row.noteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                let title = titleRaw.isEmpty ? "Untitled" : titleRaw
                let body = row.content.trimmingCharacters(in: .whitespacesAndNewlines)
                let n = Note(title: title, body: body, tags: row.tags, spaceId: targetSpaceId)
                modelContext.insert(n)
                NoteSimpleIDAssigner.assignIfMissing(n, in: modelContext)

                let normThread = normalizeCSVThreadTitleForFolder(row.threadTitle)
                if !normThread.isEmpty, !HarvousVaultImportFormats.isMyPileDisplayTitle(normThread) {
                    n.primaryFolder = normThread
                    n.isFolderUserOverride = true
                    report.foldersTouched.insert(normThread)
                }
                if let tc = row.threadColor?.trimmingCharacters(in: .whitespacesAndNewlines), !tc.isEmpty {
                    n.threadColor = tc
                }
                n.createdAt = parseCSVImportDateString(row.createdDate)
                n.updatedAt = Date()

                setDetectedRefsForImportedNote(n, title: title, body: body, explicitRefs: [])
                let existingFolders = fetchDistinctPrimaryFolders(modelContext: modelContext)
                BibleStudyTagSuggester.applyToNote(n, allowPrimaryUpdate: !n.isFolderUserOverride, existingFolders: existingFolders)
                HarvousNoteSpotlightIndexer.reindex(note: n)
                report.imported += 1
                let titleSnippet = title.count > 32 ? String(title.prefix(32)) + "…" : title
                report.logLines.append("ok import: csv:\(titleSnippet) → \(n.id.uuidString)")
            }
        } catch {
            report.skipped.append((url, error.localizedDescription))
            report.logLines.append("csv error \(url.lastPathComponent): \(error.localizedDescription)")
        }
    }

    /// Last path segment when thread name contains `/` (matches web CSV import).
    private static func normalizeCSVThreadTitleForFolder(_ raw: String) -> String {
        var t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.contains("/") {
            let parts = t.split(separator: "/").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            if let last = parts.last { t = last }
        }
        return t
    }

    /// Mirrors `parseExportDate` in `server/routes/user.ts` (`Date` parse with fallback).
    private static func parseCSVImportDateString(_ raw: String) -> Date {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return Date() }

        let frac = ISO8601DateFormatter()
        frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = frac.date(from: t) { return d }
        let basic = ISO8601DateFormatter()
        basic.formatOptions = [.withInternetDateTime]
        if let d = basic.date(from: t) { return d }

        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        df.timeZone = TimeZone(secondsFromGMT: 0)
        df.dateFormat = "yyyy-MM-dd"
        if let d = df.date(from: t) { return d }
        return Date()
    }

    /// Title + body detection (editor parity), union with optional explicit YAML `refs` (deduped, case-insensitive).
    private static func setDetectedRefsForImportedNote(_ note: Note, title: String, body: String, explicitRefs: [String]) {
        let bodyRefs = ScriptureDetector.uniqueDisplayRefs(in: body)
        let merged = ScriptureDetector.mergedDetectedRefs(title: title, bodyRefs: bodyRefs)
        guard !explicitRefs.isEmpty else {
            note.detectedRefs = merged
            return
        }
        var seenLC = Set<String>()
        var out: [String] = []
        for r in explicitRefs {
            let tr = r.trimmingCharacters(in: .whitespacesAndNewlines)
            if tr.isEmpty { continue }
            let lc = tr.lowercased()
            if seenLC.insert(lc).inserted { out.append(tr) }
        }
        for r in merged {
            let lc = r.lowercased()
            if seenLC.insert(lc).inserted { out.append(r) }
        }
        note.detectedRefs = out
    }

    private static func fetchDistinctPrimaryFolders(modelContext: ModelContext) -> [String] {
        let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.primaryFolder != nil })
        let notes = (try? modelContext.fetch(fd)) ?? []
        var seen = Set<String>()
        for n in notes {
            guard let col = n.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines), !col.isEmpty else { continue }
            seen.insert(col)
        }
        return Array(seen)
    }

    private static func firstHeadingTitle(from body: String) -> String {
        let b = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let r = b.range(of: "^#\\s+.+$", options: .regularExpression) else { return "" }
        let line = String(b[r])
        let t = line.dropFirst().trimmingCharacters(in: .whitespaces)
        return String(t)
    }

    /// Applies a parsed Harvous-native markdown doc or plain import (no id → new note).
    private static func applyVaultMirrorDoc(
        doc: HarvousVaultParsedDocument,
        fallbackTitle: String,
        targetSpaceId: UUID,
        modelContext: ModelContext,
        report: inout HarvousImportReport,
        sourceLabel: String,
        folderPath: String = ""
    ) -> (Note, Bool) {
        let heading = firstHeadingTitle(from: doc.body)
        let title: String = {
            if let t = doc.title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { return t }
            if !heading.isEmpty { return heading }
            return fallbackTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Imported note" : fallbackTitle
        }()

        var body = doc.body
        if !heading.isEmpty {
            if let r = body.range(of: "^#\\s+.+\\n*", options: .regularExpression) {
                body.removeSubrange(r)
            }
        }
        body = body.trimmingCharacters(in: .whitespacesAndNewlines)

        let note: Note
        var isUpdate = false
        if let pid = doc.id {
            let fd = FetchDescriptor<Note>(predicate: #Predicate { $0.id == pid })
            if let existing = try? modelContext.fetch(fd).first {
                note = existing
                isUpdate = true
            } else {
                let n = Note(title: title, body: body, spaceId: targetSpaceId)
                n.id = pid
                modelContext.insert(n)
                NoteSimpleIDAssigner.assignIfMissing(n, in: modelContext)
                note = n
            }
        } else {
            // No embedded ID — match by title+space to avoid creating duplicates when
            // rebuildLibraryFromVault re-scans files that were already imported.
            let fd2 = FetchDescriptor<Note>(predicate: #Predicate { $0.title == title && $0.spaceId == targetSpaceId })
            if let existing = try? modelContext.fetch(fd2).first {
                note = existing
                isUpdate = true
            } else {
                let n = Note(title: title, body: body, spaceId: targetSpaceId)
                modelContext.insert(n)
                NoteSimpleIDAssigner.assignIfMissing(n, in: modelContext)
                note = n
            }
        }

        note.title = title
        note.body = body
        note.spaceId = targetSpaceId
        if !doc.tags.isEmpty { note.tags = doc.tags }
        // Frontmatter `folder`/`folders` win over directory structure; leaf = primary,
        // ancestors = secondary. Folderless content stays Unsorted (no override).
        let resolvedFolders = HarvousVaultMarkdown.resolveImportFolders(
            metaFolder: doc.folder,
            metaFolders: doc.folders,
            folderPath: folderPath
        )
        if let primary = resolvedFolders.primary, !primary.isEmpty {
            note.primaryFolder = primary
            note.isFolderUserOverride = true
            report.foldersTouched.insert(primary)
        }
        if !resolvedFolders.secondary.isEmpty {
            let secondary = HarvousVaultMarkdown.normalizeSecondaryFolderLabels(
                resolvedFolders.secondary,
                primary: note.primaryFolder
            )
            note.secondaryFolders = secondary
            for label in secondary { report.foldersTouched.insert(label) }
        }
        if let r = doc.rating, (1...7).contains(r) { note.rating = r }
        note.isPinned = doc.pinned
        if let acc = doc.accentJSON, !acc.isEmpty { note.scripturePillAccentsJSON = acc }
        if let tr = doc.threadName?.trimmingCharacters(in: .whitespacesAndNewlines), !tr.isEmpty {
            note.threadName = tr
        }
        if let tc = doc.threadColor?.trimmingCharacters(in: .whitespacesAndNewlines), !tc.isEmpty {
            note.threadColor = tc
        }
        if let ca = doc.createdAt { note.createdAt = ca }
        if let ua = doc.updatedAt { note.updatedAt = ua }
        var dedupedExplicitRefs: [String] = []
        if !doc.refs.isEmpty {
            var seen = Set<String>()
            dedupedExplicitRefs = doc.refs.filter { seen.insert($0).inserted }
        }
        setDetectedRefsForImportedNote(note, title: title, body: body, explicitRefs: dedupedExplicitRefs)
        let existingFolders = fetchDistinctPrimaryFolders(modelContext: modelContext)
        BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: !note.isFolderUserOverride, existingFolders: existingFolders)

        HarvousNoteSpotlightIndexer.reindex(note: note)

        if isUpdate {
            report.updated += 1
        } else {
            report.imported += 1
        }
        report.logLines.append("ok \(isUpdate ? "update" : "import"): \(sourceLabel) → \(note.id.uuidString)")
        return (note, isUpdate)
    }

    private static func applyPortableHighlights(
        _ highlights: [HarvousVaultPortableHighlight],
        to note: Note,
        modelContext: ModelContext,
        report: inout HarvousImportReport
    ) {
        guard !highlights.isEmpty else { return }
        for t in note.studyThreads {
            modelContext.delete(t)
        }
        note.studyThreads.removeAll()
        for h in highlights {
            let st = HarvousVaultMarkdown.makeStudyThread(from: h, parent: note)
            modelContext.insert(st)
        }
        report.highlightsImported += highlights.count
    }
}

#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers

@MainActor
enum HarvousVaultDropImport {
    static func handle(providers: [NSItemProvider], spaceId: UUID, modelContext: ModelContext) {
        Task { @MainActor in
            var urls: [URL] = []
            for p in providers {
                if let item = try? await p.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) {
                    if let d = item as? Data, let u = URL(dataRepresentation: d, relativeTo: nil) {
                        urls.append(u)
                    } else if let u = item as? URL {
                        urls.append(u)
                    }
                }
            }
            guard !urls.isEmpty else { return }
            _ = HarvousVaultImporter.importItems(
                urls: urls,
                targetSpaceId: spaceId,
                modelContext: modelContext,
                surfaceImportSummary: true
            )
        }
    }
}
#endif
