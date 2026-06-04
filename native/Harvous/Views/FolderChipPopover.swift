import SwiftData
import SwiftUI

/// Popover for primary folder edit, secondary membership list, pin, and clear-all.
struct FolderChipPopover: View {
    private enum Metrics {
        /// Shared height for primary editor and Add-folder row so they match visually.
        static var fieldRowHeight: CGFloat {
            #if os(iOS)
            48
            #else
            38
            #endif
        }

        /// Edge insets — iOS sheets read better with fuller width use and breathing room between sections.
        static var horizontalPadding: CGFloat {
            #if os(iOS)
            22
            #else
            16
            #endif
        }

        static var verticalSectionSpacing: CGFloat {
            #if os(iOS)
            22
            #else
            14
            #endif
        }

        /// Minimum tap/click target for "Also in" row actions (promote / remove).
        static var folderRowActionExtent: CGFloat {
            #if os(iOS)
            48
            #else
            34
            #endif
        }

        static var glyphSection: CGFloat {
            #if os(iOS)
            11
            #else
            11
            #endif
        }

        static var glyphFolderRow: CGFloat {
            #if os(iOS)
            13
            #else
            13
            #endif
        }

        static var glyphRowAction: CGFloat {
            #if os(iOS)
            13
            #else
            13
            #endif
        }

        /// Primary-field trailing chrome (check / clear).
        static var trailButtonExtent: CGFloat {
            #if os(iOS)
            26
            #else
            26
            #endif
        }

        /// Space reserved inside the primary `TextField` for trailing buttons (≈ two buttons + paddings).
        static var primaryFieldTrailingReserve: CGFloat {
            #if os(iOS)
            76
            #else
            76
            #endif
        }

        /// Tighter vertical stacking for "Also in" rows — applied per row alongside `alsoInRowsStackSpacing`.
        static var secondaryFolderRowVerticalPadding: CGFloat {
            #if os(iOS)
            1
            #else
            0
            #endif
        }

        /// Spacing among secondary folder rows (and after the section title).
        static var alsoInRowsStackSpacing: CGFloat {
            #if os(iOS)
            4
            #else
            3
            #endif
        }

        /// Section-title-to-control gap — tighter than the outer section rhythm so labels feel paired with their fields.
        static var sectionTitleControlSpacing: CGFloat {
            #if os(iOS)
            10
            #else
            8
            #endif
        }

        /// Spacing inside the destructive footer group (divider above the "Remove all folders" button sits closer to it).
        static var destructiveGroupSpacing: CGFloat {
            #if os(iOS)
            12
            #else
            8
            #endif
        }
    }

    /// Rounded capsule folder name field matching primary/add-secondary styling (`Metrics.fieldRowHeight`).
    private struct FolderNameChromeRow: View {
        @Binding var text: String
        var placeholder: String
        var onSubmitEditing: () -> Void
        var onApply: () -> Void
        var onClear: () -> Void
        var applyAccessibilityLabel: String
        var applyAccessibilityHint: String
        var applyHelp: String
        var clearAccessibilityLabel: String
        var clearHelp: String
        var applyDisabled: Bool

        var body: some View {
            HStack(spacing: 0) {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .font(Self.rowBodyFontStatic)
                    .frame(maxWidth: .infinity)
                    .padding(.leading, 16)
                    .padding(.trailing, Metrics.primaryFieldTrailingReserve)
                    .onSubmit { onSubmitEditing() }
            }
            .frame(maxWidth: .infinity, minHeight: Metrics.fieldRowHeight)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.secondary.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .overlay(alignment: .trailing) {
                HStack(spacing: 10) {
                    Button {
                        onApply()
                    } label: {
                        HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 11)
                            .frame(width: Metrics.trailButtonExtent, height: Metrics.trailButtonExtent)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Color.harvousAccent)
                    )
                    .help(applyHelp)
                    .accessibilityLabel(applyAccessibilityLabel)
                    .accessibilityHint(applyAccessibilityHint)
                    .disabled(applyDisabled)

                    Button {
                        onClear()
                    } label: {
                        HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 11)
                            .frame(width: Metrics.trailButtonExtent, height: Metrics.trailButtonExtent)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.primary.opacity(0.85))
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Color.secondary.opacity(0.16))
                    )
                    .help(clearHelp)
                    .accessibilityLabel(clearAccessibilityLabel)
                }
                .padding(.trailing, 6)
            }
        }

        /// `rowBodyFont` is instance-only; expose the same typography for nested struct.
        private static var rowBodyFontStatic: Font {
            #if os(iOS)
            HarvousTypography.body
            #else
            HarvousTypography.subheadline
            #endif
        }
    }

    /// Section subtitles ("Primary", "Also in").
    private var sectionLabelFont: Font {
        #if os(iOS)
        HarvousFonts.font(size: 14, weight: 600, design: .default)
        #else
        HarvousTypography.caption
        #endif
    }

    /// Source badge ("Automatic" / "Manual") — kept compact so the row fits in a narrow inspector.
    private var sourceBadgeFont: Font {
        #if os(iOS)
        HarvousFonts.font(size: 14, weight: 500, design: .default)
        #else
        HarvousTypography.subheadline
        #endif
    }

    /// "Use auto suggestion" action label.
    private var sourceActionFont: Font {
        #if os(iOS)
        HarvousFonts.font(size: 13, weight: 500, design: .default)
        #else
        HarvousTypography.caption
        #endif
    }

    /// Body-style labels — "Lock primary folder", "Remove all folders", folder rows.
    private var emphasisBodyFont: Font {
        #if os(iOS)
        HarvousFonts.font(size: 16, weight: 500, design: .default)
        #else
        HarvousTypography.subheadline
        #endif
    }

    private var rowBodyFont: Font {
        #if os(iOS)
        HarvousTypography.body
        #else
        HarvousTypography.subheadline
        #endif
    }

    /// Secondary explanatory copy.
    private var supportingCopyFont: Font {
        #if os(iOS)
        HarvousFonts.font(size: 14, weight: 400, design: .default)
        #else
        HarvousTypography.inspectorCompact
        #endif
    }

    @Bindable var note: Note
    /// When true, renders inline in `NoteInspectorView` (no outer scroll or sheet chrome).
    var embeddedInInspector: Bool = false

    @Environment(\.modelContext) private var modelContext
    @State private var draftFolderLabel = ""
    @State private var draftNewSecondary = ""

    var body: some View {
        Group {
            if embeddedInInspector {
                folderEditorContent
            } else {
                ScrollView {
                    folderEditorContent
                        .padding(.horizontal, Metrics.horizontalPadding)
                        .padding(.vertical, Metrics.horizontalPadding)
                }
                .scrollBounceBehavior(.basedOnSize)
                #if os(iOS)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                #else
                .frame(width: 340, alignment: .topLeading)
                #endif
            }
        }
        .onAppear {
            DispatchQueue.main.async {
                draftFolderLabel = note.primaryFolder ?? ""
            }
        }
        .onChange(of: note.primaryFolder) { _, newValue in
            let normalizedDraft = draftFolderLabel.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedNote = (newValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard normalizedDraft.isEmpty || normalizedDraft == normalizedNote else { return }
            let next = newValue ?? ""
            DispatchQueue.main.async {
                draftFolderLabel = next
            }
        }
        #if os(iOS)
        .modifier(FolderChipPopoverPresentationModifier(enabled: !embeddedInInspector))
        #endif
    }

    private var folderEditorContent: some View {
        VStack(alignment: .leading, spacing: Metrics.verticalSectionSpacing) {
                folderSourceRow

                VStack(alignment: .leading, spacing: Metrics.sectionTitleControlSpacing) {
                    HStack(spacing: 8) {
                        HarvousFAGlyph(assetName: "Harvous.Star", edgePt: Metrics.glyphSection)
                            .foregroundStyle(.secondary)
                        Text("Primary")
                            .font(sectionLabelFont)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Primary folder")

                    folderEditorRow
                }

                membershipList

                newSecondaryRow

                Divider()
                    .opacity(0.45)

                VStack(alignment: .leading, spacing: 10) {
                    Toggle(isOn: Binding(
                        get: { note.isFolderPinned },
                        set: { newValue in
                            note.isFolderPinned = newValue
                            persist()
                        }
                    )) {
                        Text("Lock primary folder")
                            .font(emphasisBodyFont)
                    }
                    .toggleStyle(.switch)
                    #if os(iOS)
                    .controlSize(.large)
                    #else
                    .controlSize(.regular)
                    #endif

                    Text("When on, Harvous won't change the primary folder automatically; secondary suggestions still update from your note.")
                        .font(supportingCopyFont)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if note.isFolderUserOverride {
                    Text("Manual membership is set. Tap \"Use auto suggestion\" to follow Harvous again.")
                        .font(supportingCopyFont)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: Metrics.destructiveGroupSpacing) {
                    Divider()
                        .opacity(0.45)

                    Button(role: .destructive) {
                        clearAllFolders()
                    } label: {
                        Label {
                            Text("Remove all folders")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: Metrics.glyphRowAction)
                        }
                        .font(emphasisBodyFont)
                    }
                    .buttonStyle(.plain)
                }
            }
        }

    // MARK: - Subviews

    private var membershipList: some View {
        let primaryTrimmed = note.primaryFolder?.trimmingCharacters(in: .whitespacesAndNewlines)
        let rows = secondaryFolderRows(primaryTrimmed: primaryTrimmed)
        return Group {
            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: Metrics.alsoInRowsStackSpacing) {
                    Text("Also in")
                        .font(sectionLabelFont)
                        .foregroundStyle(.secondary)
                    ForEach(rows, id: \.self) { label in
                        HStack {
                            Label {
                                Text(label)
                                    .font(rowBodyFont)
                                    .lineLimit(2)
                            } icon: {
                                HarvousFAGlyph(assetName: "Harvous.Folder", edgePt: Metrics.glyphFolderRow)
                                    .opacity(0.55)
                                    .foregroundStyle(.secondary)
                            }
                            .labelStyle(.titleAndIcon)
                            Spacer(minLength: 12)
                            HStack(spacing: 6) {
                                Button {
                                    promoteSecondaryToPrimary(label)
                                } label: {
                                    HarvousFAGlyph(assetName: "Harvous.Star", edgePt: Metrics.glyphRowAction)
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
                                    HarvousFAGlyph(assetName: "Harvous.CircleMinus", edgePt: Metrics.glyphRowAction)
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
                        .padding(.vertical, Metrics.secondaryFolderRowVerticalPadding)
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
        VStack(alignment: .leading, spacing: Metrics.sectionTitleControlSpacing) {
            Text("Add folder")
                .font(sectionLabelFont)
                .foregroundStyle(.secondary)

            FolderNameChromeRow(
                text: $draftNewSecondary,
                placeholder: "New folder",
                onSubmitEditing: addDraftSecondary,
                onApply: addDraftSecondary,
                onClear: { draftNewSecondary = "" },
                applyAccessibilityLabel: "Add secondary folder",
                applyAccessibilityHint: "Adds typed name when it is not blank.",
                applyHelp: "Add folder",
                clearAccessibilityLabel: "Clear typed name",
                clearHelp: "Clears typed text without saving",
                applyDisabled: draftNewSecondary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )
        }
    }

    private var folderEditorRow: some View {
        FolderNameChromeRow(
            text: $draftFolderLabel,
            placeholder: "No folder",
            onSubmitEditing: applyFolderDraft,
            onApply: applyFolderDraft,
            onClear: clearPrimaryOnly,
            applyAccessibilityLabel: "Apply primary folder",
            applyAccessibilityHint: "",
            applyHelp: "Apply folder",
            clearAccessibilityLabel: "Clear primary folder",
            clearHelp: "Clear primary only",
            applyDisabled: false
        )
    }

    /// Manual / Automatic badge plus optional "Use auto suggestion" action on one row.
    /// Matches web: only shows "Use auto suggestion" when the user has manually overridden folders.
    private var folderSourceRow: some View {
        HStack(alignment: .center, spacing: 10) {
            HStack(spacing: 7) {
                HarvousFAGlyph(
                    assetName: note.isFolderUserOverride ? "Harvous.Wrench" : "Harvous.WandMagicSparkles",
                    edgePt: Metrics.glyphSection
                )
                .foregroundStyle(.secondary.opacity(0.6))

                Text(note.isFolderUserOverride ? "Manual" : "Automatic")
                    .font(sourceBadgeFont)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(note.isFolderUserOverride ? "Folder source: manual" : "Folder source: automatic")

            Spacer(minLength: 8)

            if note.isFolderUserOverride {
                Button {
                    applyAutoSuggestedFolder()
                } label: {
                    HStack(spacing: 5) {
                        HarvousFAGlyph(assetName: "Harvous.CircleArrowLeft", edgePt: 11)
                        Text("Use auto suggestion")
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                    .font(sourceActionFont)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(
                        Capsule(style: .continuous)
                            .fill(Color.secondary.opacity(0.10))
                    )
                    .overlay(
                        Capsule(style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.10), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
                .help("Restore the current auto-suggested folders")
                .accessibilityLabel("Use auto suggested folders")
            }
        }
        #if os(iOS)
        .padding(.bottom, 2)
        #endif
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

    // MARK: - Mutations

    private func persist() {
        note.markDirty()
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

#if os(iOS)
private struct FolderChipPopoverPresentationModifier: ViewModifier {
    let enabled: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if enabled {
            content
                .presentationCompactAdaptation(.sheet)
                .presentationDragIndicator(.visible)
                .presentationDetents([.medium, .large])
        } else {
            content
        }
    }
}
#endif
