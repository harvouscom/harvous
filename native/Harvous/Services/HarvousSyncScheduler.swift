import Foundation
import SwiftData

/// Debounced cloud sync after local mutations.
///
/// - `scheduleFlush()` (from `markDirty()`): upload only — avoids re-ingesting the full
///   library on every keystroke/autosave.
/// - `schedulePull()`: debounced download after uploads settle (only when flush changed server data).
/// - `scheduleFullSync()`: flush → pull → flush (sign-in paths, deletes).
///
/// Register context from `SignInGate` before `markDirty()`-driven flushes run.
enum HarvousSyncScheduler {
    private static let flushDebounceNanos: UInt64 = 1_500_000_000
    /// Coalesce pulls after typing; long enough that a 100+ note ingest does not run per autosave.
    private static let pullDebounceNanos: UInt64 = 10_000_000_000
    /// Faster pull when another device signals a change via Supabase Realtime.
    private static let realtimePullDebounceNanos: UInt64 = 500_000_000

    @MainActor
    private static var registeredContext: ModelContext?

    @MainActor
    private static var flushTask: Task<Void, Never>?

    @MainActor
    private static var pullTask: Task<Void, Never>?

    @MainActor
    private static var fullSyncTask: Task<Void, Never>?

    /// Registers the active SwiftData context (typically from `SignInGate`).
    @MainActor
    static func registerContext(_ context: ModelContext) {
        registeredContext = context
    }

    /// Cancels debounced flush/pull/full-sync work before an explicit sign-in or refresh sync.
    @MainActor
    static func cancelPendingScheduledSync() {
        flushTask?.cancel()
        flushTask = nil
        pullTask?.cancel()
        pullTask = nil
        fullSyncTask?.cancel()
        fullSyncTask = nil
    }

    /// Upload pending rows after local edits. Safe from nonisolated `markDirty()`.
    nonisolated static func scheduleFlush() {
        Task { @MainActor in
            scheduleFlushOnMainActor()
        }
    }

    /// Download remote changes (debounced). Usually scheduled after a successful flush.
    nonisolated static func schedulePull() {
        Task { @MainActor in
            schedulePullOnMainActor()
        }
    }

    /// Pull after a remote Realtime invalidation (shorter debounce than post-upload pull).
    nonisolated static func scheduleRealtimePull() {
        Task { @MainActor in
            scheduleRealtimePullOnMainActor()
        }
    }

    /// Full upload + download cycle (deletes, infrequent explicit refresh).
    nonisolated static func scheduleFullSync() {
        Task { @MainActor in
            scheduleFullSyncOnMainActor()
        }
    }

    @MainActor
    private static func scheduleFlushOnMainActor() {
        fullSyncTask?.cancel()
        flushTask?.cancel()
        flushTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: flushDebounceNanos)
            guard !Task.isCancelled else { return }
            let didUpload = await runFlush()
            if didUpload {
                schedulePullOnMainActor()
            }
        }
    }

    @MainActor
    private static func schedulePullOnMainActor() {
        schedulePullOnMainActor(debounceNanos: pullDebounceNanos)
    }

    @MainActor
    private static func scheduleRealtimePullOnMainActor() {
        schedulePullOnMainActor(debounceNanos: realtimePullDebounceNanos)
    }

    @MainActor
    private static func schedulePullOnMainActor(debounceNanos: UInt64) {
        pullTask?.cancel()
        pullTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: debounceNanos)
            guard !Task.isCancelled else { return }
            await runPull()
        }
    }

    @MainActor
    private static func scheduleFullSyncOnMainActor() {
        cancelPendingScheduledSync()
        fullSyncTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            _ = await runFlush()
            await runPull()
            _ = await runFlush()
        }
    }

    @MainActor
    @discardableResult
    private static func runFlush() async -> Bool {
        guard HarvousClerkBridge.shared.isAuthenticated else { return false }
        guard let context = registeredContext else { return false }
        return await HarvousSyncService.shared.flushPending(context: context)
    }

    @MainActor
    private static func runPull() async {
        guard HarvousClerkBridge.shared.isAuthenticated else { return }
        guard let context = registeredContext else { return }
        await HarvousSyncService.shared.pullAll(context: context)
    }
}
