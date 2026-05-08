import SwiftData
import SwiftUI

/// "Time-Machine"-style version history UI (not mounted in the inspector — snapshots still
/// accumulate via `NoteSnapshotter` for a future entry point). Lists `NoteSnapshot` rows newest-first; tapping a row opens a diff sheet
/// showing highlighted changes vs. the current note and offering a Restore action.
struct NoteHistorySection: View {
    let note: Note
    @Binding var isExpanded: Bool
    @Environment(\.modelContext) private var modelContext

    @Query private var snapshots: [NoteSnapshot]

    @State private var previewSnapshot: NoteSnapshot?

    init(note: Note, isExpanded: Binding<Bool>) {
        self.note = note
        self._isExpanded = isExpanded
        let noteID = note.id
        self._snapshots = Query(
            filter: #Predicate<NoteSnapshot> { $0.noteID == noteID },
            sort: [SortDescriptor(\.capturedAt, order: .reverse)]
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            summaryRow
            if isExpanded {
                if snapshots.isEmpty {
                    Text("Versions are saved automatically as you write. None yet — keep writing.")
                        .font(HarvousTypography.inspectorBody)
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    VStack(spacing: 6) {
                        ForEach(snapshots) { snapshot in
                            snapshotRow(snapshot)
                        }
                    }
                    .padding(.top, 2)
                }
            }
        }
        .padding(.top, 4)
        .sheet(item: $previewSnapshot) { snapshot in
            NoteVersionDiffView(
                currentBody: note.body,
                snapshot: snapshot,
                onRestore: {
                    NoteSnapshotter.shared.restore(note: note, to: snapshot, in: modelContext)
                }
            )
        }
    }

    // MARK: - Summary header (collapsed default)

    private var summaryRow: some View {
        Button {
            withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.harvousAccent)
                    .frame(width: 20, alignment: .center)

                VStack(alignment: .leading, spacing: 2) {
                    Text(summaryTitle)
                        .font(HarvousTypography.inspectorCompactMedium)
                        .foregroundStyle(.primary)
                    Text(summarySubtitle)
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.secondary)
                }
                .multilineTextAlignment(.leading)

                Spacer(minLength: 0)

                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .rotationEffect(.degrees(isExpanded ? 0 : -90))
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Shows saved versions of this note")
    }

    private var summaryTitle: String {
        switch snapshots.count {
        case 0: return "No versions yet"
        case 1: return "1 version"
        default: return "\(snapshots.count) versions"
        }
    }

    private var summarySubtitle: String {
        guard let last = snapshots.first else { return "Auto-saved as you write" }
        return "Last \(relative(last.capturedAt))"
    }

    // MARK: - Snapshot row

    private func snapshotRow(_ snapshot: NoteSnapshot) -> some View {
        Button {
            previewSnapshot = snapshot
        } label: {
            HStack(alignment: .center, spacing: 10) {
                Circle()
                    .fill(reasonColor(snapshot.reason))
                    .frame(width: 7, height: 7)
                    .overlay(Circle().stroke(Color.primary.opacity(0.08), lineWidth: 0.5))

                VStack(alignment: .leading, spacing: 2) {
                    Text(relative(snapshot.capturedAt))
                        .font(HarvousTypography.inspectorCompactMedium)
                        .foregroundStyle(.primary)
                    Text(rowSubtitle(snapshot))
                        .font(HarvousTypography.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(Color.secondary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func rowSubtitle(_ snapshot: NoteSnapshot) -> String {
        let prefix: String? = {
            switch snapshot.reason {
            case .autoInterval, .autoIdle: return nil
            case .manual: return "Manual"
            case .preRestore: return "Pre-restore"
            }
        }()
        let raw = snapshot.body
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\n", with: " ")
        let snippet = raw.isEmpty ? "Empty" : String(raw.prefix(50))
        return prefix.map { "\($0) · \(snippet)" } ?? snippet
    }

    private func reasonColor(_ reason: SnapshotReason) -> Color {
        switch reason {
        case .autoInterval, .autoIdle: return Color.harvousAccent.opacity(0.6)
        case .manual: return .green
        case .preRestore: return .orange
        }
    }

    // MARK: - Date formatting

    private func relative(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
