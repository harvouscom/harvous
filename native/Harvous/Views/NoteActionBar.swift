import SwiftUI

#if os(macOS)

/// Always-visible bottom bar — note-level context and actions.
struct NoteActionBar: View {
    let note: Note
    var trailSnapshot: ThreadStore.TrailSnapshot = .init(incoming: [], outgoing: [])
    var currentNoteTitle: String = ""
    var onOpenLinkedNote: ((UUID) -> Void)?
    /// Called after a new note-to-note connection is created from the trail UI.
    var onConnectionsChanged: (() -> Void)? = nil
    var isCollectionContextUpdating = false

    @Environment(\.modelContext) private var modelContext
    @Environment(\.harvousScriptureTheme) private var theme
    @State private var showCollectionText = true
    @State private var draftCollection = ""
    @State private var isEditingCollection = false
    @FocusState private var collectionFieldFocused: Bool

    private var normalizedCollection: String? {
        let trimmed = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private var normalizedDraftCollection: String? {
        let trimmed = draftCollection.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private var hasDraftChanges: Bool {
        normalizedDraftCollection != normalizedCollection
    }

    private var canLockCurrentAutoCollection: Bool {
        normalizedCollection != nil && !note.isCollectionPinned && !note.isCollectionUserOverride && !hasDraftChanges
    }

    private var showsConnectionsBar: Bool {
        onOpenLinkedNote != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            Color(nsColor: .separatorColor).frame(height: 0.5)

            HStack(alignment: .center, spacing: 20) {
                collectionChip
                    .layoutPriority(1)
                if showsConnectionsBar, let onOpen = onOpenLinkedNote {
                    NoteConnectionsBar(
                        note: note,
                        snapshot: trailSnapshot,
                        currentNoteTitle: currentNoteTitle,
                        onOpenLinkedNote: onOpen,
                        onConnectionsChanged: onConnectionsChanged
                    )
                    .layoutPriority(0)
                    .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 20)
            .frame(height: 44)
        }
        .background(.thinMaterial)
        .onAppear {
            showCollectionText = normalizedCollection != nil
            draftCollection = normalizedCollection ?? ""
        }
        .onChange(of: normalizedCollection) { _, newValue in
            if !isEditingCollection {
                draftCollection = newValue ?? ""
            }
            guard newValue != nil else {
                showCollectionText = true
                return
            }
            animateCollectionTextReveal()
        }
        .onChange(of: collectionFieldFocused) { _, focused in
            guard isEditingCollection, !focused else { return }
            cancelCollectionEditing()
        }
        .onChange(of: isCollectionContextUpdating) { _, updating in
            guard updating, normalizedCollection != nil else { return }
            animateCollectionTextReveal()
        }
        .onExitCommand {
            guard isEditingCollection else { return }
            cancelCollectionEditing()
        }
    }

    private func animateCollectionTextReveal() {
        showCollectionText = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            withAnimation(.easeOut(duration: 0.18)) {
                showCollectionText = true
            }
        }
    }

    // MARK: - Collection chip (theme / subject only)

    @ViewBuilder
    private var collectionChip: some View {
        HStack(spacing: 7) {
            if normalizedCollection != nil {
                CollectionSymbol(isContextUpdating: isCollectionContextUpdating, font: .system(size: 14))
            } else {
                CollectionSymbol(
                    isContextUpdating: isCollectionContextUpdating,
                    font: .system(size: 14)
                )
            }

            Group {
                if isEditingCollection {
                    TextField("No collection", text: $draftCollection)
                        .textFieldStyle(.plain)
                        .font(HarvousTypography.actionBarChip)
                        .focused($collectionFieldFocused)
                        .onSubmit {
                            applyCollectionDraftFromActionBar()
                        }
                        .frame(minWidth: 150)
                } else if let collection = normalizedCollection {
                    Text(collection)
                        .font(HarvousTypography.actionBarChip)
                        .opacity(showCollectionText ? 1 : 0)
                        .offset(x: showCollectionText ? 0 : -8)
                        .animation(.easeOut(duration: 0.18), value: showCollectionText)
                } else {
                    Text("No collection")
                        .font(HarvousTypography.actionBarMeta)
                }
            }

            if isEditingCollection {
                HStack(spacing: 4) {
                    if hasDraftChanges {
                        Button {
                            applyCollectionDraftFromActionBar()
                        } label: {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                                .background(
                                    RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                                        .fill(HarvousColors.themeAccent(theme))
                                )
                        }
                        .buttonStyle(.plain)
                        .help("Apply and lock collection")
                    } else {
                        Button {
                            guard canLockCurrentAutoCollection else { return }
                            lockCurrentCollectionFromActionBar()
                        } label: {
                            Image(systemName: canLockCurrentAutoCollection ? "lock.open.fill" : "lock.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(canLockCurrentAutoCollection ? .white : Color.primary.opacity(0.55))
                                .frame(width: 30, height: 30)
                                .background(
                                    RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                                        .fill(
                                            canLockCurrentAutoCollection
                                                ? HarvousColors.themeAccent(theme)
                                                : Color(nsColor: .windowBackgroundColor)
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                                                .stroke(Color.primary.opacity(canLockCurrentAutoCollection ? 0 : 0.14), lineWidth: 0.7)
                                        )
                                )
                        }
                        .buttonStyle(.plain)
                        .disabled(!canLockCurrentAutoCollection)
                        .help(canLockCurrentAutoCollection ? "Lock auto-suggested collection" : "Collection already locked")
                    }

                    Button {
                        cancelCollectionEditing()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color.primary.opacity(0.68))
                            .frame(width: 30, height: 30)
                            .background(
                                RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                                    .fill(Color(nsColor: .windowBackgroundColor))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: HarvousRadius.scripturePill, style: .continuous)
                                            .stroke(Color.primary.opacity(0.14), lineWidth: 0.7)
                                    )
                            )
                    }
                    .buttonStyle(.plain)
                    .help("Cancel edits")
                }
            }
        }
        .foregroundStyle(
            normalizedCollection != nil
                ? AnyShapeStyle(HarvousColors.themeAccent(theme))
                : AnyShapeStyle(.tertiary)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            guard !isEditingCollection else { return }
            beginCollectionEditing()
        }
    }

    private func beginCollectionEditing() {
        draftCollection = normalizedCollection ?? ""
        isEditingCollection = true
        DispatchQueue.main.async {
            collectionFieldFocused = true
        }
    }

    private func cancelCollectionEditing() {
        draftCollection = normalizedCollection ?? ""
        isEditingCollection = false
        collectionFieldFocused = false
    }

    private func applyCollectionDraftFromActionBar() {
        let trimmed = draftCollection.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            note.primaryCollection = nil
            note.isCollectionUserOverride = false
            note.isCollectionPinned = false
            note.collectionAutoConfidence = nil
            note.collectionLastAutoUpdatedAt = nil
        } else {
            note.primaryCollection = trimmed
            note.isCollectionUserOverride = true
            note.isCollectionPinned = true
            note.collectionAutoConfidence = nil
            note.collectionLastAutoUpdatedAt = nil
        }
        try? modelContext.save()
        isEditingCollection = false
        collectionFieldFocused = false
    }

    private func lockCurrentCollectionFromActionBar() {
        guard normalizedCollection != nil else { return }
        note.isCollectionPinned = true
        try? modelContext.save()
        isEditingCollection = false
        collectionFieldFocused = false
    }
}

#Preview {
    let note = Note(title: "Test", body: "Faith and grace in Paul’s letters.")
    note.primaryCollection = "Faith"
    return NoteActionBar(note: note, onOpenLinkedNote: { _ in })
        .frame(width: 600)
        .modelContainer(for: [Note.self, StudyThread.self], inMemory: true)
}

#endif
