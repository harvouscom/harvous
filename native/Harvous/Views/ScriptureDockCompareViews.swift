import SwiftUI

// MARK: - Scripture dock compare mode

enum ScriptureDockMode: Equatable {
    case study
    case compare
}

/// One read-only passage column in Compare mode — header label, optional translation picker, verse body.
struct ScriptureComparePassageBlock: View {
    let reference: String
    @Binding var translation: String
    let blockLabel: String
    var showTranslationPicker: Bool = false
    var dimmed: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            compareBlockHeader

            ScripturePassageView(
                reference: reference,
                translation: translation,
                showHeader: false,
                useReadingTypography: true,
                showAttribution: true
            )
            .opacity(dimmed ? 0.88 : 1)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private var compareBlockHeader: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(blockLabel)
                .font(HarvousTypography.caption)
                .foregroundStyle(.secondary)

            if showTranslationPicker {
                Picker("Compare translation", selection: $translation) {
                    ForEach(ScriptureReference.availableTranslations, id: \.self) { code in
                        Text(ScriptureReference.displayTranslationLabel(code)).tag(code)
                    }
                }
                .pickerStyle(.menu)
                .controlSize(.small)
                .labelsHidden()
                .accessibilityLabel("Compare translation")
            } else {
                Text(ScriptureReference.displayTranslationLabel(translation))
                    .font(HarvousFonts.font(size: 10, weight: .semibold, design: .default))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
    }
}

/// Stacked (iPhone / narrow) or side-by-side (macOS / iPad wide) compare layout for the scripture dock.
struct ScriptureDockCompareSection: View {
    let reference: String
    let noteTranslation: String
    @Binding var compareTranslation: String
    let noteBlockLabel: String
    let useSideBySide: Bool
    var fillsAvailableHeight: Bool = false

    var body: some View {
        Group {
            if useSideBySide {
                sideBySideLayout
            } else {
                stackedLayout
            }
        }
        .task(id: "\(reference)|\(noteTranslation)|\(compareTranslation)") {
            await ScripturePassageCache.shared.prefetch(reference: reference, translation: noteTranslation)
            if compareTranslation != noteTranslation {
                await ScripturePassageCache.shared.prefetch(reference: reference, translation: compareTranslation)
            }
        }
        .onChange(of: compareTranslation) { _, newValue in
            HarvousStudyDefaults.persistCompareTranslation(newValue)
        }
    }

    private var noteColumn: some View {
        ScriptureComparePassageBlock(
            reference: reference,
            translation: .constant(noteTranslation),
            blockLabel: noteBlockLabel,
            showTranslationPicker: false,
            dimmed: false
        )
    }

    private var compareColumn: some View {
        ScriptureComparePassageBlock(
            reference: reference,
            translation: $compareTranslation,
            blockLabel: "Compare",
            showTranslationPicker: true,
            dimmed: false
        )
    }

    private var stackedLayout: some View {
        compareScrollContainer {
            VStack(alignment: .leading, spacing: 16) {
                noteColumn

                Divider()
                    .opacity(0.35)

                compareColumn
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .padding(.bottom, 10)
        }
    }

    private var sideBySideLayout: some View {
        compareScrollContainer {
            HStack(alignment: .top, spacing: 14) {
                noteColumn
                    .frame(maxWidth: .infinity, alignment: .topLeading)

                Divider()
                    .opacity(0.35)

                compareColumn
                    .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .padding(.bottom, 10)
        }
    }

    @ViewBuilder
    private func compareScrollContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if fillsAvailableHeight {
            ScrollView {
                content()
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
            }
            .frame(maxHeight: .infinity)
        } else {
            ScrollView {
                content()
            }
        }
    }
}
