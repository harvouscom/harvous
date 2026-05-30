import Foundation
import OSLog

#if canImport(Supabase)
import Supabase
#endif

/// Listens for Supabase Realtime Broadcast invalidations and triggers a debounced cloud pull.
@MainActor
final class HarvousRealtimeSync {
    static let shared = HarvousRealtimeSync()

    private var listenTask: Task<Void, Never>?

    private init() {}

    func start(userId: String) {
        stop()
        guard HarvousSupabaseConfig.isConfigured else { return }
        listenTask = Task { await self.run(userId: userId) }
    }

    func stop() {
        listenTask?.cancel()
        listenTask = nil
    }

    private func run(userId: String) async {
        #if canImport(Supabase)
        guard let url = HarvousSupabaseConfig.projectURL,
              let anonKey = HarvousSupabaseConfig.anonKey else { return }

        let client = SupabaseClient(supabaseURL: url, supabaseKey: anonKey)

        if let token = await HarvousClerkBridge.shared.supabaseRealtimeToken() {
            await client.realtimeV2.setAuth(token)
        } else {
            Logger.app.warning("Supabase Realtime: no Clerk supabase JWT; subscription may fail until template is configured")
        }

        let channelName = HarvousSupabaseConfig.syncChannelName(userId: userId)
        let channel = client.channel(channelName)

        let subscription = channel.onBroadcast(event: "invalidate") { [weak self] message in
            guard self != nil else { return }
            Task { @MainActor in
                HarvousSyncScheduler.scheduleRealtimePull()
            }
            _ = message
        }

        do {
            try await channel.subscribe()
        } catch {
            Logger.app.error("Supabase Realtime subscribe failed: \(error.localizedDescription, privacy: .public)")
            return
        }

        defer {
            Task {
                await subscription.cancel()
                await channel.unsubscribe()
            }
        }

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        #endif
    }
}
