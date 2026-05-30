import Foundation

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// User feedback after applying scripture pill edits (non-blocking; works with VoiceOver).
enum ScriptureApplyFeedback {
    @MainActor
    static func notifyScripturePillApplied() {
        let message = String(localized: "Scripture reference updated in note", comment: "Announced after Apply on scripture editor")
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.prepare()
        generator.impactOccurred(intensity: 0.85)
        UIAccessibility.post(notification: .announcement, argument: message)
        #elseif os(macOS)
        NSHapticFeedbackManager.defaultPerformer.perform(.generic, performanceTime: .default)
        if let el = NSApp.keyWindow ?? NSApp.mainWindow {
            NSAccessibility.post(
                element: el,
                notification: .announcementRequested,
                userInfo: [NSAccessibility.NotificationUserInfoKey.announcement: message]
            )
        }
        #endif
    }
}
