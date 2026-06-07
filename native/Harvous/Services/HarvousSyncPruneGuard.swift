import Foundation

/// Safety rails for server-driven note pruning (`HarvousSyncService.pruneDeletedNotes`).
///
/// Notes can be removed locally for two reasons: the user explicitly deleted them (a
/// queued tombstone we sent up), or the server reports them deleted in a sync pull. The
/// first is intent and always applies. The second is data the client must treat
/// defensively — a stale or malformed server payload should never silently destroy work.
enum HarvousSyncPruneGuard {
    /// Minimum server-driven delete count before the bulk-delete sanity cap can trip.
    /// Keeps small, normal deletes (a handful of notes) from ever being withheld.
    static let bulkPruneSanityFloor = 25
    /// Fraction of the local library that, if exceeded by a single pull's server-driven
    /// deletes, is treated as suspicious.
    static let bulkPruneSanityFraction = 0.5

    /// `true` when a server-driven prune should KEEP a note: it was not tombstoned by the
    /// user locally, yet it has unsynced local edits. The local edit wins over a
    /// stale/incorrect server tombstone (the user can still delete it explicitly).
    static func shouldKeepDespiteServerDelete(
        userTombstoned: Bool,
        hasUnsyncedLocalEdits: Bool
    ) -> Bool {
        !userTombstoned && hasUnsyncedLocalEdits
    }

    /// `true` when a batch of server-driven deletes is large enough to look like a
    /// malformed/overbroad payload and should be withheld for this pull.
    static func serverBulkDeleteLooksSuspicious(
        serverDrivenDeleteCount: Int,
        totalLocalNotes: Int
    ) -> Bool {
        serverDrivenDeleteCount >= bulkPruneSanityFloor
            && totalLocalNotes > 0
            && Double(serverDrivenDeleteCount) >= Double(totalLocalNotes) * bulkPruneSanityFraction
    }
}
