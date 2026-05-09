import SwiftData
import SwiftUI

/// Popover for primary collection edit, secondary membership list, pin, and clear-all.
struct CollectionChipPopover: View {
    @Bindable var note: Note

    @Environment(\.modelContext) private var modelContext
    @State private var draftCollection = ""
    @State private var draftNewSecondary = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            collectionSourceBadge

            Text("Primary")
                .font(HarvousTypography.inspectorCompactMedium)
                .foregroundStyle(.secondary)

            collectionEditorRow

            membershipList

            newSecondaryRow

            if canUseAutoSuggestion {
                Button {
                    applyAutoSuggestedCollection()
                } label: {
                    Label("Use auto suggestion", systemImage: "arrow.uturn.backward.circle")
                        .font(HarvousTypography.inspectorCompactMedium)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Restore the current auto-suggested collections")
                .accessibilityLabel("Use auto suggested collections")
            }

            Divider()
                .opacity(0.45)

            VStack(alignment: .leading, spacing: 6) {
                Toggle(isOn: Binding(
                    get: { note.isCollectionPinned },
                    set: { newValue in
                        note.isCollectionPinned = newValue
                        persist()
                    }
                )) {
                    Text("Lock primary collection")
                        .font(HarvousTypography.inspectorCompactMedium)
                }
                .toggleStyle(.switch)
                .controlSize(.regular)

                Text("When on, Harvous won't change the primary collection automatically; secondary suggestions still update from your note.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if note.isCollectionUserOverride {
                Text("Manual membership is set. Tap “Use auto suggestion” to follow Harvous again.")
                    .font(HarvousTypography.inspectorCompact)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()
                .opacity(0.45)

            Button(role: .destructive) {
                clearAllCollections()
            } label: {
                Label("Remove all collections", systemImage: "trash")
                    .font(HarvousTypography.inspectorCompactMedium)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(width: 300)
        .onAppear {
            draftCollection = note.primaryCollection ?? ""
        }
        .onChange(of: note.primaryCollection) { _, newValue in
            let normalizedDraft = draftCollection.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedNote = (newValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if normalizedDraft.isEmpty || normalizedDraft == normalizedNote {
                draftCollection = newValue ?? ""
            }
        }
        #if os(iOS)
        .presentationCompactAdaptation(.popover)
        #endif
    }

    // MARK: - Subviews

    private var membershipList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Also in")
                .font(HarvousTypography.inspectorCompactMedium)
                .foregroundStyle(.secondary)
            let primaryTrimmed = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
            ForEach(membershipRows(primaryTrimmed: primaryTrimmed), id: \.self) { label in
                HStack {
                    Label {
                        Text(label)
                            .font(HarvousTypography.inspectorCompactMedium)
                            .lineLimit(2)
                    } icon: {
                        Image(systemName: label.caseInsensitiveCompare(primaryTrimmed ?? "") == .orderedSame ? "folder.fill" : "folder")
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    if label.caseInsensitiveCompare(primaryTrimmed ?? "") != .orderedSame {
                        Button {
                            removeSecondary(label)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(.tertiary)
                        }
                        .buttonStyle(.plain)
                        .help("Remove from this note")
                        .accessibilityLabel("Remove \(label)")
                    }
                }
            }
        }
    }

    private func membershipRows(primaryTrimmed: String?) -> [String] {
        var rows: [String] = []
        if let p = primaryTrimmed, !p.isEmpty { rows.append(p) }
        for s in note.normalizedSecondaryCollectionLabels() {
            if let p = primaryTrimmed, !p.isEmpty, s.caseInsensitiveCompare(p) == .orderedSame { continue }
            rows.append(s)
        }
        return rows
    }

    private var newSecondaryRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Add collection")
                .font(HarvousTypography.inspectorCompactMedium)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                TextField("Name", text: $draftNewSecondary)
                    .textFieldStyle(.roundedBorder)
                    .font(HarvousTypography.inspectorCompactMedium)
                    .onSubmit { addDraftSecondary() }
                Button("Add") { addDraftSecondary() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(draftNewSecondary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private var collectionEditorRow: some View {
        HStack(spacing: 0) {
            TextField("No collection", text: $draftCollection)
                .textFieldStyle(.plain)
                .font(HarvousTypography.body)
                .frame(maxWidth: .infinity, minHeight: 40, maxHeight: 40)
                .padding(.leading, 12)
                .padding(.trailing, 84)
                .onSubmit { applyCollectionDraft() }
        }
        .frame(maxWidth: .infinity, minHeight: 40)
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
                    applyCollectionDraft()
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.harvousAccent)
                )
                .help("Apply collection")
                .accessibilityLabel("Apply primary collection")

                Button {
                    clearPrimaryOnly()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.primary.opacity(0.85))
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(Color.secondary.opacity(0.16))
                )
                .help("Clear primary only")
                .accessibilityLabel("Clear primary collection")
            }
            .padding(.trailing, 6)
        }
    }

    private var collectionSourceBadge: some View {
        HStack(spacing: 8) {
            Image(systemName: note.isCollectionUserOverride ? "person.crop.circle.badge.checkmark" : "sparkles")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(note.isCollectionUserOverride ? Color.harvousAccent : .secondary)

            Text(note.isCollectionUserOverride ? "Manual" : "Automatic")
                .font(HarvousTypography.inspectorCompactMedium)

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(note.isCollectionUserOverride ? "Collection source: manual" : "Collection source: automatic")
    }

    // MARK: - Computed

    private var normalizedCurrentCollection: String? {
        let trimmed = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func existingLibraryLabels(excludingNote: Note) -> [String] {
        let descriptor = FetchDescriptor<Note>()
        let allNotes = (try? modelContext.fetch(descriptor)) ?? []
        var seen = Set<String>()
        for n in allNotes where n.id != excludingNote.id {
            for label in n.allCollectionMembershipLabels() {
                seen.insert(label)
            }
        }
        return Array(seen)
    }

    private var canUseAutoSuggestion: Bool {
        let existing = existingLibraryLabels(excludingNote: note)
        let r = BibleStudyTagSuggester.result(title: note.title, body: note.body, existingCollections: existing)
        let sugPrimaryRaw = r.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
        let sugSec = normalizeSecondaries(r.secondaryCollections, primary: sugPrimaryRaw)
        if note.isCollectionUserOverride || note.isCollectionPinned {
            return (sugPrimaryRaw != nil && !sugPrimaryRaw!.isEmpty) || !sugSec.isEmpty
        }
        let curP = normalizedCurrentCollection
        let primDiff: Bool = {
            switch (curP, sugPrimaryRaw) {
            case (nil, nil): return false
            case (nil, .some(let s)): return !s.isEmpty
            case (.some(let c), nil): return !c.isEmpty
            case (.some(let c), .some(let s)): return c.caseInsensitiveCompare(s) != .orderedSame
            }
        }()
        let curSec = note.normalizedSecondaryCollectionLabels()
        let secDiff = curSec.map { $0.lowercased() }.sorted() != sugSec.map { $0.lowercased() }.sorted()
        return primDiff || secDiff
    }

    // MARK: - Mutations

    private func persist() {
        try? modelContext.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: note)
        HarvousVaultExporter.scheduleWrite(note: note, modelContext: modelContext)
    }

    private func clearAllCollections() {
        draftCollection = ""
        draftNewSecondary = ""
        note.primaryCollection = nil
        note.secondaryCollections = []
        note.isCollectionUserOverride = false
        note.isCollectionPinned = false
        note.collectionAutoConfidence = nil
        note.collectionLastAutoUpdatedAt = nil
        persist()
    }

    private func clearPrimaryOnly() {
        let secs = note.normalizedSecondaryCollectionLabels()
        draftCollection = ""
        if let first = secs.first {
            note.primaryCollection = first
            note.secondaryCollections = Array(secs.dropFirst())
        } else {
            note.primaryCollection = nil
            note.secondaryCollections = []
        }
        note.isCollectionUserOverride = true
        note.isCollectionPinned = true
        persist()
    }

    private func applyAutoSuggestedCollection() {
        let existing = existingLibraryLabels(excludingNote: note)
        let r = BibleStudyTagSuggester.result(title: note.title, body: note.body, existingCollections: existing)
        if let p = r.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines), !p.isEmpty {
            draftCollection = p
            note.primaryCollection = p
        } else {
            note.primaryCollection = nil
            draftCollection = ""
        }
        note.secondaryCollections = normalizeSecondaries(r.secondaryCollections, primary: note.primaryCollection)
        note.isCollectionUserOverride = false
        note.isCollectionPinned = false
        note.collectionLastAutoUpdatedAt = Date()
        persist()
    }

    private func applyCollectionDraft() {
        let trimmed = draftCollection.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            clearPrimaryOnly()
            return
        } else {
            note.primaryCollection = trimmed
            note.secondaryCollections = normalizeSecondaries(note.secondaryCollections, primary: trimmed)
            note.isCollectionUserOverride = true
            note.isCollectionPinned = true
            note.collectionAutoConfidence = nil
            note.collectionLastAutoUpdatedAt = nil
        }
        persist()
    }

    private func removeSecondary(_ label: String) {
        let next = note.normalizedSecondaryCollectionLabels().filter { $0.caseInsensitiveCompare(label) != .orderedSame }
        note.secondaryCollections = next
        note.isCollectionUserOverride = true
        persist()
    }

    private func addDraftSecondary() {
        let t = draftNewSecondary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        if let p = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines), !p.isEmpty,
           t.caseInsensitiveCompare(p) == .orderedSame {
            draftNewSecondary = ""
            return
        }
        var next = note.normalizedSecondaryCollectionLabels()
        if !next.contains(where: { $0.caseInsensitiveCompare(t) == .orderedSame }) {
            next.append(t)
        }
        note.secondaryCollections = next
        note.isCollectionUserOverride = true
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
