import Foundation

/// Biblical names too universal for memory-layer arcs, passage net-new tags, and fingerprints.
/// Keep in sync with web `universal-bible-entities.ts`.
enum UniversalBibleEntities {
    static let names: Set<String> = [
        "god", "jesus", "christ", "holy spirit", "lord", "the lord",
    ]

    static func contains(_ name: String) -> Bool {
        names.contains(name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
