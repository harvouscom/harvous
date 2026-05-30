import Foundation
import SwiftData

/// Generates context-aware study prompts seeded into `StudyThread.suggestedQuestions` at creation time.
///
/// Start with keyword heuristics; the calling layer can swap in richer context
/// (passage genre, detected refs, etc.) as the system matures — similar to
/// how `BibleStudyTagSuggester` improves its folder predictions over time.
enum StudyPromptSuggester {

    /// Returns 2–3 prompts tailored to the highlighted snippet and the note's detected references.
    static func questions(forSnippet snippet: String, detectedRefs: [String] = []) -> [String] {
        let lower = snippet.lowercased()
        var prompts: [String] = []

        // God/character prompt — vary wording when the text is explicitly about God
        let godsCharacter = lower.contains("god") || lower.contains("lord") || lower.contains("jesus") || lower.contains("christ") || lower.contains("father")
        prompts.append(godsCharacter
            ? "What does this reveal about God's character?"
            : "What does this show about God?"
        )

        // Obedience/application prompt — vary when the text issues a command or imperative
        let imperativeWords = ["command", "shall ", "must ", "obey", "do not", "do this", "be holy", "repent", "follow"]
        let isImperative = imperativeWords.contains(where: lower.contains)
        prompts.append(isImperative
            ? "What is God calling me to do in response?"
            : "How should I respond to this today?"
        )

        // Prayer prompt — add when the snippet touches emotions, fear, trust, or prayer directly
        let prayerWords = ["fear", "trust", "hope", "pray", "peace", "anxiety", "worry", "joy", "thankful", "praise"]
        let hasPrayerContext = prayerWords.contains(where: lower.contains)
        if hasPrayerContext || detectedRefs.count >= 2 {
            prompts.append("How can I bring this before God in prayer?")
        }

        return prompts
    }

    /// Returns 3 prompts tailored to a scripture passage excerpt.
    /// Unlike `questions(forSnippet:)`, the prayer prompt is always included —
    /// every passage is worth praying through regardless of keyword content.
    static func questions(forScriptureExcerpt excerpt: String, reference: String = "") -> [String] {
        let lower = excerpt.lowercased()
        var prompts: [String] = []

        let godsCharacter = lower.contains("god") || lower.contains("lord") || lower.contains("jesus")
            || lower.contains("christ") || lower.contains("father")
        prompts.append(godsCharacter
            ? "What does this reveal about God's character?"
            : "What does this show about God?"
        )

        let imperativeWords = ["command", "shall ", "must ", "obey", "do not", "do this", "be holy", "repent", "follow"]
        let isImperative = imperativeWords.contains(where: lower.contains)
        prompts.append(isImperative
            ? "What is God calling me to do in response?"
            : "How should I respond to this today?"
        )

        prompts.append("How can I bring this before God in prayer?")
        return prompts
    }

    /// Fills heuristic Respond chips immediately while Apple Intelligence generation is still pending.
    @MainActor
    static func seedScriptureRespondQuestionsIfNeeded(thread: StudyThread, modelContext: ModelContext) {
        guard thread.entryKind == .scriptureLink else { return }
        guard !thread.aiSuggestedQuestionsGenerated else { return }
        guard thread.suggestedQuestions.isEmpty else { return }
        let trimmed = (thread.scriptureReference ?? thread.miniNoteBody).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let excerpt = thread.scripturePassageExcerpt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let snippet = excerpt.isEmpty ? trimmed : excerpt
        thread.suggestedQuestions = questions(forScriptureExcerpt: snippet, reference: trimmed)
        try? modelContext.saveWithLogging()
    }
}
