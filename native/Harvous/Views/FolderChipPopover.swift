import SwiftData
import SwiftUI

/// Popover for primary folder edit, secondary membership list, pin, and clear-all.
struct FolderChipPopover: View {
    private enum Metrics {
        /// Shared height for primary editor and Add-folder row so they match visually.
        static let fieldRowHeight: CGFloat = 36

        /// Minimum tap/click target for “Also in” row actions (promote / remove).
        static var folderRowActionExtent: CGFloat {
            #if os(iOS)
            44
            #else
            32
            #endif
        }
    }

    @Bindable var note: Note

    @Environment(\.modelContext) private var modelContext
    @State private var draftFolderLabel = ""
    @State private var draftNewSecondary = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            folderSourceRow

            HStack(spacing: 6) {
                HarvousFAGlyph(assetName: "Harvous.Star", edgePt: 11)
                    .foregroundStyle(.secondary)
                Text("Primary")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Primary folder")

            folderEditorRow

            membershipList

            newSecondaryRow

            Divider()
                .opacity(0.45)

            VStack(alignment: .leading, spacing: 6) {
                Toggle(isOn: Binding(
                    get: { note.isFolderPinned },
                    set: { newValue in
                        note.isFolderPinned = newValue
                        persist()
                    }
                )) {
                    Text("Lock primary folder")
                        .font(HarvousTypography.inspectorCompactMedium)
                }
                .toggleStyle(.switch)
                .controlSize(.regular)

                Text("When on, Harvous won't change the primary folder automatically; secondary suggestions still update from your note.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if note.isFolderUserOverride {
                Text("Manual membership is set. Tap “Use auto suggestion” to follow Harvous again.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()
                .opacity(0.45)

            Button(role: .destructive) {
                clearAllFolders()
            } label: {
                Label {
                    Text("Remove all folders")
                } icon: {
                    HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 13)
                }
                .font(HarvousTypography.inspectorCompactMedium)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(width: 300)
        .onAppear {
            draftFolderLabel = note.primaryFolder ?? ""
        }
        .onChange(of: note.primaryFolder) { _, newValue in
            let normalizedDraft = draftFolderLabel.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedNote = (newValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if normalizedDraft.isEmpty || normalizedDraft == normalizedNote {
                draftFolderLabel = newValue ?? ""
            }
        }
        #if os(iOS)
        .presentationCompactAdaptation(.popover)
        #endif
    }

    // MARK: - Subviews

    private var membershipList: some View {
        let primaryTrimmed = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines)
        let rows = secondaryFolderRows(primaryTrimmed: primaryTrimmed)
        return Group {
            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Also in")
                        .font(HarvousTypography.caption)
                        .foregroundStyle(.secondary)
                    ForEach(rows, id: \.self) { label in
                        HStack {
                            Label {
                                Text(label)
                                    .font(HarvousTypography.subheadline)
                                    .lineLimit(2)
                            } icon: {
                                HarvousFAGlyph(assetName: "Harvous.Folder", edgePt: 13)
                                    .opacity(0.55)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            HStack(spacing: 2) {
                                Button {
                                    promoteSecondaryToPrimary(label)
                                } label: {
                                    HarvousFAGlyph(assetName: "Harvous.Star", edgePt: 14)
                                        .foregroundStyle(Color.secondary)
                                        .frame(
                                            width: Metrics.folderRowActionExtent,
                                            height: Metrics.folderRowActionExtent
                                        )
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .help("Make \(label) the primary folder")
                                .accessibilityLabel("Make \(label) the primary folder")

                                Button {
                                    removeSecondary(label)
                                } label: {
                                    HarvousFAGlyph(assetName: "Harvous.CircleMinus", edgePt: 14)
                                        .foregroundStyle(.tertiary)
                                        .frame(
                                            width: Metrics.folderRowActionExtent,
                                            height: Metrics.folderRowActionExtent
                                        )
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .help("Remove from this note")
                                .accessibilityLabel("Remove \(label)")
                            }
                        }
                    }
                }
            }
        }
    }

    /// Secondary folders only (primary is edited above; never duplicated here).
    private func secondaryFolderRows(primaryTrimmed: String?) -> [String] {
        note.normalizedSecondaryFolderLabels().filter { s in
            if let p = primaryTrimmed, !p.isEmpty, s.caseInsensitiveCompare(p) == .orderedSame {
                return false
            }
            return true
        }
    }

    private var newSecondaryRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Add folder")
                .font(HarvousTypography.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                TextField("Name", text: $draftNewSecondary)
                    .textFieldStyle(.roundedBorder)
                    .font(HarvousTypography.subheadline)
                    .frame(maxWidth: .infinity)
                    .onSubmit { addDraftSecondary() }
                Button("Add") { addDraftSecondary() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.regular)
                    .disabled(draftNewSecondary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .frame(minHeight: Metrics.fieldRowHeight)
        }
    }

    private var folderEditorRow: some View {
        HStack(spacing: 0) {
            TextField("No folder", text: $draftFolderLabel)
                .textFieldStyle(.plain)
                .font(HarvousTypography.subheadline)
                .frame(
                    maxWidth: .infinity,
                    minHeight: Metrics.fieldRowHeight,
                    maxHeight: Metrics.fieldRowHeight
                )
                .padding(.leading, 12)
                .padding(.trailing, 84)
                .onSubmit { applyFolderDraft() }
        }
        .frame(maxWidth: .infinity, minHeight: Metrics.fieldRowHeight)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color.secondary.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .overlay(alignment: .trailing) {
            HStack(spacing: 6) {
                Button {
                    applyFolderDraft()
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 12)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.harvousAccent)
                )
                .help("Apply folder")
                .accessibilityLabel("Apply primary folder")

                Button {
                    clearPrimaryOnly()
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 12)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary.opacity(0.85))
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.secondary.opacity(0.16))
                )
                .help("Clear primary only")
                .accessibilityLabel("Clear primary folder")
            }
            .padding(.trailing, 6)
        }
    }

    /// Manual / Automatic badge plus optional “Use auto suggestion” action on one row.
    private var folderSourceRow: some View {
        HStack(alignment: .center, spacing: 8) {
            HStack(spacing: 8) {
                HarvousFAGlyph(
                    assetName: note.isFolderUserOverride ? "Harvous.Wrench" : "Harvous.WandMagicSparkles",
                    edgePt: 11
                )
                .foregroundStyle(note.isFolderUserOverride ? Color.harvousAccent : .secondary)

                Text(note.isFolderUserOverride ? "Manual" : "Automatic")
                    .font(HarvousTypography.inspectorCompactMedium)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(note.isFolderUserOverride ? "Folder source: manual" : "Folder source: automatic")

            Spacer(minLength: 8)

            if canUseAutoSuggestion {
                Button {
                    applyAutoSuggestedFolder()
                } label: {
                    Label {
                        Text("Use auto suggestion")
                            .lineLimit(2)
                            .multilineTextAlignment(.trailing)
                            .minimumScaleFactor(0.85)
                    } icon: {
                        HarvousFAGlyph(assetName: "Harvous.CircleArrowLeft", edgePt: 13)
                            .foregroundStyle(.secondary)
                    }
                    .font(HarvousTypography.inspectorCompactMedium)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Restore the current auto-suggested folders")
                .accessibilityLabel("Use auto suggested folders")
                .layoutPriority(1)
            }
        }
    }

    // MARK: - Computed

    private var normalizedCurrentPrimaryFolder: String? {
        let trimmed = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func existingLibraryLabels(excludingNote: Note) -> [String] {
        let descriptor = FetchDescriptor<Note>()
        let allNotes = (try? modelContext.fetch(descriptor)) ?? []
        var seen = Set<String>()
        for n in allNotes where n.id != excludingNote.id {
            for label in n.allFolderMembershipLabels() {
                seen.insert(label)
            }
        }
        return Array(seen)
    }

    private var canUseAutoSuggestion: Bool {
        let existing = existingLibraryLabels(excludingNote: note)
        let r = BibleStudyTagSuggester.result(title: note.title, body: note.body, existingFolders: existing)
        let sugPrimaryRaw = r.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines)
        let sugSec = normalizeSecondaries(r.secondaryFolders, primary: sugPrimaryRaw)
        if note.isFolderUserOverride || note.isFolderPinned {
            return (sugPrimaryRaw != nil && !sugPrimaryRaw!.isEmpty) || !sugSec.isEmpty
        }
        let curP = normalizedCurrentPrimaryFolder
        let primDiff: Bool = {
            switch (curP, sugPrimaryRaw) {
            case (nil, nil): return false
            case (nil, .some(let s)): return !s.isEmpty
            case (.some(let c), nil): return !c.isEmpty
            case (.some(let c), .some(let s)): return c.caseInsensitiveCompare(s) != .orderedSame
            }
        }()
        let curSec = note.normalizedSecondaryFolderLabels()
        let secDiff = curSec.map { $0.lowercased() }.sorted() != sugSec.map { $0.lowercased() }.sorted()
        return primDiff || secDiff
    }

    // MARK: - Mutations

    private func persist() {
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
    }

    private func clearAllFolders() {
        draftFolderLabel = ""
        draftNewSecondary = ""
        note.primaryFolder = nil
        note.secondaryFolders = []
        note.isFolderUserOverride = false
        note.isFolderPinned = false
        note.folderAutoConfidence = nil
        note.folderLastAutoUpdatedAt = nil
        persist()
    }

    private func clearPrimaryOnly() {
        let secs = note.normalizedSecondaryFolderLabels()
        draftFolderLabel = ""
        if let first = secs.first {
            note.primaryFolder = first
            note.secondaryFolders = Array(secs.dropFirst())
        } else {
            note.primaryFolder = nil
            note.secondaryFolders = []
        }
        note.isFolderUserOverride = true
        note.isFolderPinned = true
        persist()
    }

    private func applyAutoSuggestedFolder() {
        let existing = existingLibraryLabels(excludingNote: note)
        let r = BibleStudyTagSuggester.result(title: note.title, body: note.body, existingFolders: existing)
        if let p = r.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines), !p.isEmpty {
            draftFolderLabel = p
            note.primaryFolder = p
        } else {
            note.primaryFolder = nil
            draftFolderLabel = ""
        }
        note.secondaryFolders = normalizeSecondaries(r.secondaryFolders, primary: note.primaryFolder)
        note.isFolderUserOverride = false
        note.isFolderPinned = false
        note.folderLastAutoUpdatedAt = Date()
        persist()
    }

    private func applyFolderDraft() {
        let trimmed = draftFolderLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            clearPrimaryOnly()
            return
        } else {
            note.primaryFolder = trimmed
            note.secondaryFolders = normalizeSecondaries(note.secondaryFolders, primary: trimmed)
            note.isFolderUserOverride = true
            note.isFolderPinned = true
            note.folderAutoConfidence = nil
            note.folderLastAutoUpdatedAt = nil
        }
        persist()
    }

    private func removeSecondary(_ label: String) {
        let next = note.normalizedSecondaryFolderLabels().filter { $0.caseInsensitiveCompare(label) != .orderedSame }
        note.secondaryFolders = next
        note.isFolderUserOverride = true
        persist()
    }

    /// Moves a secondary label to `primaryFolder` and pushes the former primary into secondaries when present.
    private func promoteSecondaryToPrimary(_ label: String) {
        let secs = note.normalizedSecondaryFolderLabels()
        guard let promoted = secs.first(where: { $0.caseInsensitiveCompare(label) == .orderedSame }) else {
            return
        }
        let formerPrimary = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines)

        var merged: [String] = []
        if let fp = formerPrimary, !fp.isEmpty,
           fp.caseInsensitiveCompare(promoted) != .orderedSame {
            merged.append(fp)
        }
        for s in secs where s.caseInsensitiveCompare(promoted) != .orderedSame {
            merged.append(s)
        }

        note.primaryFolder = promoted
        note.secondaryFolders = normalizeSecondaries(merged, primary: promoted)
        draftFolderLabel = promoted
        note.isFolderUserOverride = true
        note.isFolderPinned = true
        note.folderAutoConfidence = nil
        note.folderLastAutoUpdatedAt = nil
        persist()
    }

    private func addDraftSecondary() {
        let t = draftNewSecondary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        if let p = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines), !p.isEmpty,
           t.caseInsensitiveCompare(p) == .orderedSame {
            draftNewSecondary = ""
            return
        }
        var next = note.normalizedSecondaryFolderLabels()
        if !next.contains(where: { $0.caseInsensitiveCompare(t) == .orderedSame }) {
            next.append(t)
        }
        note.secondaryFolders = next
        note.isFolderUserOverride = true
        draftNewSecondary = ""
        persist()
    }

    private func normalizeSecondaries(_ raw: [String], primary: String?) -> [String] {
        let p = primary?.trimmingCharacters(in: .whitespacesAndNewlines)
        var seen = Set<String>()
        var out: [String] = []
        for s in raw {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !t.isEmpty else { continue }
            if let p, !p.isEmpty, t.caseInsensitiveCompare(p) == .orderedSame { continue }
            let low = t.lowercased()
            if seen.contains(low) { continue }
            seen.insert(low)
            out.append(t)
        }
        return out
    }
}
