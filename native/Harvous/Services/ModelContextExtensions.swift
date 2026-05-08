import SwiftData
import os.log

private let logger = Logger(subsystem: "com.harvous.app", category: "SwiftData")

extension ModelContext {
    /// Saves the context and logs any failure to the system log before rethrowing.
    /// Use this instead of bare `try context.save()` so failures are visible in Console.app.
    func saveWithLogging(file: String = #fileID, line: Int = #line) throws {
        do {
            try save()
        } catch {
            logger.error("SwiftData save failed at \(file):\(line) — \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }
}
