import Foundation
import FoundationModels

@available(macOS 26.0, iOS 26.0, *)
enum ScriptureReflectionGenerator {

    @Generable
    struct Output {
        var questions: [String]
    }

    static func generate(excerpt: String, reference: String) async throws -> [String] {
        guard case .available = SystemLanguageModel.default.availability else {
            throw GeneratorError.modelUnavailable
        }
        let session = LanguageModelSession(instructions: """
            You help people engage honestly with scripture they're studying. Write reflection \
            questions that feel personal and grounded in the specific language of the passage — \
            not generic Bible study boilerplate. The best questions come from the particular words \
            and imagery in the text. Think: what a spiritually honest friend would ask, not a \
            curriculum worksheet. Avoid phrases like "apply to your life," "what does this teach," \
            or anything interchangeable with another verse.
            """)
        let prompt = """
            Highlighted passage (\(reference)): "\(excerpt)"

            Write 3 short reflection questions rooted in the specific language of this passage. \
            Each under 12 words. Personal and honest, not preachy. Unanswerable with a simple yes \
            or no. No numbering or extra text — just the 3 questions.
            """
        let result = try await session.respond(to: prompt, generating: Output.self)
        let questions = result.content.questions
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !questions.isEmpty else { throw GeneratorError.emptyResponse }
        return Array(questions.prefix(3))
    }

    enum GeneratorError: Error {
        case modelUnavailable
        case emptyResponse
    }
}
