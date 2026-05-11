import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Diff engine

private enum DiffOp {
    case same(String)
    case add(String)    // in snapshot, not in current — would come back after restore
    case remove(String) // in current, not in snapshot — would disappear after restore
}

private func tokenize(_ text: String) -> [String] {
    var tokens: [String] = []
    var word = ""
    for ch in text {
        if ch.isNewline || ch.isWhitespace {
            if !word.isEmpty { tokens.append(word); word = "" }
            tokens.append(String(ch))
        } else {
            word.append(ch)
        }
    }
    if !word.isEmpty { tokens.append(word) }
    return tokens
}

private func lcsWordDiff(from a: [String], to b: [String]) -> [DiffOp] {
    let m = a.count, n = b.count
    guard m > 0 || n > 0 else { return [] }
    if m == 0 { return b.map { .add($0) } }
    if n == 0 { return a.map { .remove($0) } }

    var table = [[Int]](repeating: [Int](repeating: 0, count: n + 1), count: m + 1)
    for i in 1...m {
        for j in 1...n {
            table[i][j] = a[i - 1] == b[j - 1]
                ? table[i - 1][j - 1] + 1
                : max(table[i - 1][j], table[i][j - 1])
        }
    }

    var ops: [DiffOp] = []
    var i = m, j = n
    while i > 0 || j > 0 {
        if i > 0 && j > 0 && a[i - 1] == b[j - 1] {
            ops.append(.same(a[i - 1])); i -= 1; j -= 1
        } else if j > 0 && (i == 0 || table[i][j - 1] >= table[i - 1][j]) {
            ops.append(.add(b[j - 1])); j -= 1
        } else {
            ops.append(.remove(a[i - 1])); i -= 1
        }
    }
    return ops.reversed()
}

private func buildDiffAttributedString(current: String, snapshot: String) -> NSAttributedString {
    let ops = lcsWordDiff(from: tokenize(current), to: tokenize(snapshot))
    let result = NSMutableAttributedString()

    #if os(macOS)
    let baseFont = NSFont.systemFont(ofSize: NSFont.systemFontSize)
    let textColor = NSColor.labelColor
    let addBG = NSColor.systemGreen.withAlphaComponent(0.28)
    let removeBG = NSColor.systemRed.withAlphaComponent(0.2)
    let removeStrike = NSColor.systemRed
    #else
    let baseFont = UIFont.preferredFont(forTextStyle: .body)
    let textColor = UIColor.label
    let addBG = UIColor.systemGreen.withAlphaComponent(0.28)
    let removeBG = UIColor.systemRed.withAlphaComponent(0.2)
    let removeStrike = UIColor.systemRed
    #endif

    let baseAttrs: [NSAttributedString.Key: Any] = [
        .font: baseFont,
        .foregroundColor: textColor,
    ]

    for op in ops {
        switch op {
        case .same(let text):
            result.append(NSAttributedString(string: text, attributes: baseAttrs))
        case .add(let text):
            var attrs = baseAttrs
            attrs[.backgroundColor] = addBG
            result.append(NSAttributedString(string: text, attributes: attrs))
        case .remove(let text):
            var attrs = baseAttrs
            attrs[.backgroundColor] = removeBG
            attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
            attrs[.strikethroughColor] = removeStrike
            result.append(NSAttributedString(string: text, attributes: attrs))
        }
    }

    return result
}

// MARK: - Platform text view

#if os(macOS)
private struct DiffTextNativeView: NSViewRepresentable {
    let attributedString: NSAttributedString

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        guard let textView = scrollView.documentView as? NSTextView else { return scrollView }
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        textView.textContainerInset = NSSize(width: 20, height: 16)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }
        textView.textStorage?.setAttributedString(attributedString)
    }
}
#else
private struct DiffTextNativeView: UIViewRepresentable {
    let attributedString: NSAttributedString

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.isScrollEnabled = true
        tv.backgroundColor = .clear
        tv.textContainerInset = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        tv.attributedText = attributedString
    }
}
#endif

// MARK: - View

struct NoteVersionDiffView: View {
    let currentBody: String
    let snapshot: NoteSnapshot
    let onRestore: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showRestoreConfirm = false

    private var diffString: NSAttributedString {
        buildDiffAttributedString(current: currentBody, snapshot: snapshot.body)
    }

    private var identical: Bool { currentBody == snapshot.body }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                headerSection
                Divider()
                if !identical {
                    legendRow
                    Divider()
                }
                contentSection
                Divider()
                restoreSection
            }
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .confirmationDialog(
            "Restore this version?",
            isPresented: $showRestoreConfirm
        ) {
            Button("Restore", role: .destructive) {
                onRestore()
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Replaces the current text. Your current version will be saved first so you can return to it.")
        }
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(snapshot.capturedAt.formatted(date: .complete, time: .shortened))
                .font(.headline)
                .foregroundStyle(.primary)
            Text("vs. current version")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private var legendRow: some View {
        HStack(spacing: 20) {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.green.opacity(0.38))
                    .frame(width: 18, height: 14)
                Text("Added")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.red.opacity(0.28))
                    .frame(width: 18, height: 14)
                Text("Removed")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(Color.secondary.opacity(0.04))
    }

    @ViewBuilder
    private var contentSection: some View {
        if identical {
            VStack(spacing: 10) {
                HarvousFAGlyph(assetName: "Harvous.CircleCheck", edgePt: 30)
                    .foregroundStyle(.secondary)
                Text("This version is identical to the current note.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            DiffTextNativeView(attributedString: diffString)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var restoreSection: some View {
        Button {
            showRestoreConfirm = true
        } label: {
            Text("Restore to This Version")
                .font(.system(.body, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(
                    Color.harvousAccent.opacity(0.1),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .foregroundStyle(Color.harvousAccent)
        }
        .buttonStyle(.plain)
        .padding(16)
    }
}
