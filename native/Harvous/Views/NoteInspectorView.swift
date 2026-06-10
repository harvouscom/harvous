import SwiftData
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Right-side inspector panel — shown via `.inspector(isPresented:)`.
/// Sections: Info · Tags · Connected Notes · Folders (+ Scripture / Sources when present).
struct NoteInspectorView: View {
    private enum FieldMetrics {
        static var rowHeight: CGFloat {
            #if os(iOS)
            48
            #else
            38
            #endif
        }

        static var trailingReserve: CGFloat {
            #if os(iOS)
            108
            #else
            84
            #endif
        }

        static var trailingButtonExtent: CGFloat {
            #if os(iOS)
            32
            #else
            26
            #endif
        }

        static var bodyFont: Font {
            #if os(iOS)
            HarvousTypography.body
            #else
            HarvousTypography.subheadline
            #endif
        }
    }

    let note: Note
    var snapshot: ThreadStore.TrailSnapshot = .init(incoming: [], outgoing: [])
    var currentNoteTitle: String = "Current note"
    var onOpenLinkedNote: (UUID) -> Void = { _ in }
    var onConnectionsChanged: (() -> Void)? = nil
    var onDeleteConfirmed: () -> Void = {}
    @Environment(\.modelContext) private var modelContext
    @State private var draftTag = ""
    @State private var simpleNoteIdCopied = false
    @State private var allResourceLines: [String] = []
    @State private var showConnectPicker = false
    @State private var isRetryingSync = false
    @State private var confirmDelete = false
    @State private var deleteHover = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if note.syncError != nil {
                    syncErrorBanner
                    Divider().padding(.vertical, 12)
                }

                sectionHeader("Info")
                infoSection

                Divider().padding(.vertical, 12)

                sectionHeader("Tags")
                tagsSection

                if !allResourceLines.isEmpty {
                    Divider().padding(.vertical, 12)
                    sectionHeader("Sources")
                    sourcesSection
                }

                Divider().padding(.vertical, 12)

                sectionHeader("Connected Notes")
                connectionsSection

                Divider().padding(.vertical, 12)

                sectionHeader("Folders")
                foldersSection

                deleteSection
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
        }
        .confirmationDialog(
            "Delete this note? This cannot be undone.",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) { onDeleteConfirmed() }
            Button("Cancel", role: .cancel) {}
        }
        .task(id: note.id) { loadResourceLines() }
        #if !os(macOS)
        .sheet(isPresented: $showConnectPicker) {
            NavigationStack {
                ConnectNotePicker(
                    spaceId: note.resolvedSpaceId(),
                    parentNoteId: note.id,
                    onPick: { picked in
                        _ = ThreadStore.createUnanchoredConnection(
                            parent: note,
                            linked: picked,
                            modelContext: modelContext
                        )
                        showConnectPicker = false
                        onConnectionsChanged?()
                    },
                    onCancel: { showConnectPicker = false }
                )
                .navigationTitle("Connect note")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            showConnectPicker = false
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        #endif
    }

    // MARK: - Sync status

    /// Surfaced when a local edit failed to upload (`Note.syncError`). Previously the
    /// error was stored but never shown, so stuck notes failed silently. Retry re-flags
    /// the note dirty and kicks `HarvousSyncService` to flush again.
    @ViewBuilder
    private var syncErrorBanner: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 13)
                    .foregroundStyle(Color.harvousWarning)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Changes not synced")
                        .font(HarvousTypography.inspectorBody)
                        .foregroundStyle(.primary)
                    if let detail = note.syncError, !detail.isEmpty {
                        Text(detail)
                            .font(HarvousTypography.inspectorCompact)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }

            Button(action: retrySync) {
                HStack(spacing: 6) {
                    HarvousFAGlyph(assetName: "Harvous.ArrowsRotate", edgePt: 11)
                    Text(isRetryingSync ? "Retrying…" : "Retry sync")
                        .font(HarvousTypography.inspectorCompactMedium)
                }
                .foregroundStyle(Color.harvousAccent)
            }
            .buttonStyle(.plain)
            .disabled(isRetryingSync)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: HarvousRadius.input, style: .continuous)
                .fill(Color.harvousWarning.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: HarvousRadius.input, style: .continuous)
                .strokeBorder(Color.harvousWarning.opacity(0.22), lineWidth: 0.5)
        )
    }

    private func retrySync() {
        guard !isRetryingSync else { return }
        isRetryingSync = true
        // Permanent-rejection path leaves needsSync == false, so re-flag dirty to re-queue.
        note.needsSync = true
        try? modelContext.save()
        let context = modelContext
        Task {
            _ = await HarvousSyncService.shared.flushPending(context: context)
            isRetryingSync = false
        }
    }

    // MARK: - Connected Notes (linked-note markers)

    @ViewBuilder
    private var foldersSection: some View {
        FolderChipPopover(note: note, embeddedInInspector: true)
            .padding(.top, 4)
    }

    private var deleteSection: some View {
        Button {
            confirmDelete = true
        } label: {
            HStack(spacing: 6) {
                HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 12)
                Text("Delete note")
                    .font(HarvousTypography.inspectorCompactMedium)
            }
            .foregroundStyle(Color.harvousDestructive)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(deleteHover ? Color.primary.opacity(0.06) : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .padding(.top, 16)
        .accessibilityLabel("Delete note")
        #if os(macOS)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                deleteHover = hovering
            }
        }
        #endif
    }

    @ViewBuilder
    private var connectionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if snapshot.incoming.isEmpty && snapshot.outgoing.isEmpty {
                Text("No connections yet.")
                    .font(HarvousTypography.inspectorBody)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            } else {
                if !snapshot.incoming.isEmpty {
                    connectionsGroup(
                        label: "Linked from",
                        markers: snapshot.incoming,
                        directionGlyph: "Harvous.ArrowLeft",
                        navigateId: { $0.parentNoteId },
                        resolveTitle: resolvedIncomingTitle,
                        onRemove: removeIncomingMarker
                    )
                }
                if !snapshot.outgoing.isEmpty {
                    connectionsGroup(
                        label: "Links to",
                        markers: snapshot.outgoing.filter { $0.linkedNoteId != nil },
                        directionGlyph: "Harvous.ArrowRight",
                        navigateId: { $0.linkedNoteId },
                        resolveTitle: resolvedOutgoingTitle,
                        onRemove: removeOutgoingMarker
                    )
                }
            }

            addConnectionButton
        }
    }

    @ViewBuilder
    private func connectionsGroup(
        label: String,
        markers: [StudyThread],
        directionGlyph: String,
        navigateId: @escaping (StudyThread) -> UUID?,
        resolveTitle: @escaping (StudyThread) -> String,
        onRemove: @escaping (StudyThread) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(HarvousTypography.inspectorSectionLabel)
                .foregroundStyle(.secondary)
                .tracking(0.6)

            VStack(alignment: .leading, spacing: 6) {
                ForEach(markers, id: \.id) { marker in
                    InspectorConnectionRow(
                        title: resolveTitle(marker),
                        directionGlyph: directionGlyph,
                        onNavigate: {
                            if let id = navigateId(marker) {
                                onOpenLinkedNote(id)
                            }
                        },
                        onRemove: { onRemove(marker) }
                    )
                }
            }
        }
    }

    private var addConnectionButton: some View {
        Button {
            showConnectPicker = true
        } label: {
            HStack(spacing: 6) {
                HarvousFAGlyph(assetName: "Harvous.Plus", edgePt: 11)
                    .foregroundStyle(.secondary)
                Text("Connect note")
                    .font(HarvousTypography.inspectorBody)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                Capsule(style: .continuous)
                    .fill(Color.primary.opacity(0.06))
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Connect note")
        #if os(macOS)
        .popover(isPresented: $showConnectPicker, arrowEdge: .leading) {
            ConnectNotePicker(
                spaceId: note.resolvedSpaceId(),
                parentNoteId: note.id,
                onPick: { picked in
                    _ = ThreadStore.createUnanchoredConnection(
                        parent: note,
                        linked: picked,
                        modelContext: modelContext
                    )
                    showConnectPicker = false
                    onConnectionsChanged?()
                },
                onCancel: { showConnectPicker = false }
            )
        }
        #endif
    }

    private func resolvedIncomingTitle(_ marker: StudyThread) -> String {
        if let parent = ThreadStore.fetchNote(id: marker.parentNoteId, modelContext: modelContext) {
            let live = parent.title.trimmingCharacters(in: .whitespacesAndNewlines)
            if !live.isEmpty { return live }
        }
        let focus = marker.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return focus.isEmpty ? "Untitled note" : focus
    }

    private func resolvedOutgoingTitle(_ marker: StudyThread) -> String {
        if let nid = marker.linkedNoteId,
           let linked = ThreadStore.fetchNote(id: nid, modelContext: modelContext) {
            let live = linked.title.trimmingCharacters(in: .whitespacesAndNewlines)
            if !live.isEmpty { return live }
        }
        let cached = marker.linkedNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cached.isEmpty { return cached }
        let focus = marker.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return focus.isEmpty ? "Untitled note" : focus
    }

    private func removeIncomingMarker(_ marker: StudyThread) {
        ThreadStore.deleteLinkedNoteMarker(marker, modelContext: modelContext)
        if let parent = ThreadStore.fetchNote(id: marker.parentNoteId, modelContext: modelContext) {
            HarvousVaultExporter.scheduleWrite(note: parent, modelContext: modelContext)
        }
        onConnectionsChanged?()
    }

    private func removeOutgoingMarker(_ marker: StudyThread) {
        ThreadStore.deleteLinkedNoteMarker(marker, modelContext: modelContext)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
        onConnectionsChanged?()
    }

    // MARK: - Tags (theme / keyword; not scripture)

    @ViewBuilder
    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if note.tags.isEmpty {
                Text("No tags")
                    .font(HarvousTypography.inspectorBody)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(note.tags.uniquedPreservingOrderCaseInsensitive(), id: \.self) { tag in
                        tagChip(tag)
                    }
                }
                .padding(.top, 4)
            }

            addTagRow
        }
    }

    private func tagChip(_ tag: String) -> some View {
        RemovableInspectorNeutralTagChip(text: tag) {
            removeTag(tag)
        }
    }

    private var addTagRow: some View {
        HStack(spacing: 0) {
            TextField("Add tag", text: $draftTag)
                .textFieldStyle(.plain)
                .font(FieldMetrics.bodyFont)
                .frame(maxWidth: .infinity)
                .padding(.leading, 16)
                .padding(.trailing, FieldMetrics.trailingReserve)
                .onSubmit { addDraftTag() }
        }
        .frame(maxWidth: .infinity, minHeight: FieldMetrics.rowHeight)
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
                    addDraftTag()
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Check", edgePt: 13)
                        .frame(width: FieldMetrics.trailingButtonExtent, height: FieldMetrics.trailingButtonExtent)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.harvousAccent)
                )
                .disabled(draftTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .help("Add tag")
                .accessibilityLabel("Add tag")

                Button {
                    draftTag = ""
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 13)
                        .frame(width: FieldMetrics.trailingButtonExtent, height: FieldMetrics.trailingButtonExtent)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary.opacity(0.85))
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color.secondary.opacity(0.16))
                )
                .help("Clear typed tag")
                .accessibilityLabel("Clear typed tag")
            }
            .padding(.trailing, 10)
        }
    }

    // MARK: - Sources (resource lines from study threads)

    @ViewBuilder
    private var sourcesSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(allResourceLines, id: \.self) { line in
                if let url = URL(string: line), url.scheme?.hasPrefix("http") == true {
                    Link(destination: url) {
                        Text(line)
                            .font(HarvousTypography.inspectorCompact)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text(line)
                        .font(HarvousTypography.inspectorCompact)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(.top, 4)
    }

    @MainActor
    private func loadResourceLines() {
        let nid = note.id
        let descriptor = FetchDescriptor<StudyThread>(
            predicate: #Predicate { t in t.parentNoteId == nid && !t.isArchived }
        )
        let threads = (try? modelContext.fetch(descriptor)) ?? []
        allResourceLines = threads.flatMap(\.resourceLines).filter { !$0.isEmpty }
    }

    // MARK: - Info

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let sid = note.simpleNoteId {
                infoSimpleNoteIdRow(displayText: simpleNoteIdCopied ? "Copied" : formatSimpleNoteId(sid))
            }
            infoRow("Created", value: note.createdAt.formatted(date: .abbreviated, time: .shortened))
            infoRow("Added by", value: note.addedBySourceLabel)
            infoRow("Modified", value: note.updatedAt.formatted(date: .abbreviated, time: .shortened))
            infoRow("Reading", value: readingTimeLabel)
            infoRow("Words", value: wordCount)
            if note.isPublic {
                infoRow("Sharing", value: "Anyone with link")
            }
        }
        .padding(.top, 4)
    }

    private func infoSimpleNoteIdRow(displayText: String) -> some View {
        let clipboardText = note.simpleNoteId.map { formatSimpleNoteId($0) } ?? ""
        return HStack(alignment: .top) {
            Text("ID")
                .font(HarvousTypography.inspectorCompactMedium)
                .foregroundStyle(.secondary)
                .frame(width: 64, alignment: .leading)
            Button {
                copySimpleNoteIdToPasteboard(clipboardText)
            } label: {
                Text(displayText)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)
            .help("Copy note ID")
            .accessibilityLabel("Note ID")
            .accessibilityHint("Copies \(clipboardText) to the clipboard")
        }
    }

    private func formatSimpleNoteId(_ id: Int) -> String {
        String(format: "N%03d", id)
    }

    private func copySimpleNoteIdToPasteboard(_ text: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
        simpleNoteIdCopied = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.5))
            simpleNoteIdCopied = false
        }
    }

    private var readingTimeLabel: String {
        let words = wordCountInt
        if words == 0 { return "<1 min read" }
        if words < 50 { return "<1 min read" }
        let minutes = max(1, Int((Double(words) / 225.0).rounded()))
        return "\(minutes) min read"
    }

    private var wordCountInt: Int {
        note.body.split(whereSeparator: { $0.isWhitespace }).count
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(HarvousTypography.inspectorCompactMedium)
                .foregroundStyle(.secondary)
                .frame(width: 64, alignment: .leading)
            Text(value)
                .font(HarvousTypography.inspectorCompact)
                .foregroundStyle(.primary)
        }
    }

    private var wordCount: String {
        let words = wordCountInt
        return "\(words) word\(words == 1 ? "" : "s")"
    }

    private func persistInspectorMutation() {
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
    }

    private func addDraftTag() {
        let trimmed = draftTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard !note.tags.contains(where: { $0.caseInsensitiveCompare(trimmed) == .orderedSame }) else {
            draftTag = ""
            return
        }

        note.tags.append(trimmed)
        note.tags = note.tags.uniquedPreservingOrderCaseInsensitive()
        note.updatedAt = Date()
        draftTag = ""
        persistInspectorMutation()
    }

    private func removeTag(_ tag: String) {
        note.tags.removeAll { $0.caseInsensitiveCompare(tag) == .orderedSame }
        note.updatedAt = Date()
        persistInspectorMutation()
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(HarvousTypography.inspectorSectionLabel)
            .foregroundStyle(.secondary)
            .tracking(0.8)
            .padding(.bottom, 6)
    }
}

// MARK: - Note Details chips

private enum InspectorDetailChipMetrics {
    /// Slightly larger than legacy 12pt inspector pills for readability while staying secondary UI.
    static var labelFont: Font {
        #if os(iOS)
        HarvousFonts.font(size: 15, weight: 500)
        #else
        HarvousFonts.font(size: 14, weight: 500)
        #endif
    }

    static let horizontalPadding: CGFloat = 12
    static let verticalPadding: CGFloat = 8
    static let capsuleFillOpacity: Double = 0.07
    static let capsuleStrokeOpacity: Double = 0.12
    static let rowIconSpacing: CGFloat = 6

    static var removeGlyphPt: CGFloat {
        #if os(iOS)
        12
        #else
        11
        #endif
    }

    /// Width of the remove (×) button column.
    static var tagGlyphColumnWidth: CGFloat {
        #if os(iOS)
        18
        #else
        16
        #endif
    }
}

private struct RemovableInspectorNeutralTagChip: View {
    let text: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: InspectorDetailChipMetrics.rowIconSpacing) {
            Text(text)
                .font(InspectorDetailChipMetrics.labelFont)
                .foregroundStyle(.primary)
                .lineLimit(1)

            Button(action: onRemove) {
                HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: InspectorDetailChipMetrics.removeGlyphPt)
                    .foregroundStyle(.primary.opacity(0.55))
                    .frame(width: InspectorDetailChipMetrics.tagGlyphColumnWidth)
            }
            .buttonStyle(.plain)
            .help("Remove tag")
            .accessibilityLabel("Remove tag \(text)")
        }
        .padding(.horizontal, InspectorDetailChipMetrics.horizontalPadding)
        .padding(.vertical, InspectorDetailChipMetrics.verticalPadding)
        .background(
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(InspectorDetailChipMetrics.capsuleFillOpacity))
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(
                    Color.primary.opacity(InspectorDetailChipMetrics.capsuleStrokeOpacity),
                    lineWidth: 0.5
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Tag \(text)")
        .accessibilityActions {
            Button("Remove tag", role: .destructive) { onRemove() }
        }
    }
}

// MARK: - Simple flow layout for pills/tags

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let width = proposal.width ?? 200
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > width && currentX > 0 {
                currentX = 0
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, currentX)
        }

        return CGSize(width: maxX, height: currentY + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: currentX, y: currentY), proposal: ProposedViewSize(size))
            currentX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

private struct InspectorConnectionRow: View {
    let title: String
    let directionGlyph: String
    let onNavigate: () -> Void
    let onRemove: () -> Void

    @State private var hoverRemoval = false

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onNavigate) {
                HStack(spacing: 8) {
                    HarvousFAGlyph(assetName: directionGlyph, edgePt: 11)
                        .foregroundStyle(.secondary.opacity(0.75))
                    Text(title)
                        .font(InspectorDetailChipMetrics.labelFont)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            #if os(macOS)
            .help("Open linked note")
            #endif

            Button(action: onRemove) {
                HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: InspectorDetailChipMetrics.removeGlyphPt)
                    .foregroundStyle(.primary.opacity(0.55))
                    .frame(width: InspectorDetailChipMetrics.tagGlyphColumnWidth)
            }
            .buttonStyle(.plain)
            #if os(macOS)
            .help("Remove connection")
            #endif
            .opacity(hoverRemoval ? 1 : 0)
            .frame(width: hoverRemoval ? 22 : 0)
            .clipped()
            .allowsHitTesting(hoverRemoval)
            .accessibilityLabel("Remove connection to \(title)")
        }
        .padding(.horizontal, InspectorDetailChipMetrics.horizontalPadding)
        .padding(.vertical, InspectorDetailChipMetrics.verticalPadding)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.primary.opacity(InspectorDetailChipMetrics.capsuleFillOpacity))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(
                    Color.primary.opacity(InspectorDetailChipMetrics.capsuleStrokeOpacity),
                    lineWidth: 0.5
                )
        )
        .animation(.easeInOut(duration: 0.18), value: hoverRemoval)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.18)) {
                hoverRemoval = hovering
            }
        }
        .contextMenu {
            Button("Open note") { onNavigate() }
            Button("Remove connection", role: .destructive) { onRemove() }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Connected note, \(title)")
        .accessibilityActions {
            Button("Open note") { onNavigate() }
            Button("Remove connection", role: .destructive) { onRemove() }
        }
    }
}

#Preview {
    let note = Note(title: "Test Note", body: "John 3:16 is a beautiful verse.")
    note.tags = ["Faith", "Love"]
    note.detectedRefs = ["John 3:16", "Psalm 23"]
    note.simpleNoteId = 42
    return NoteInspectorView(note: note)
        .frame(width: 280)
        .modelContainer(for: [Note.self], inMemory: true)
}
