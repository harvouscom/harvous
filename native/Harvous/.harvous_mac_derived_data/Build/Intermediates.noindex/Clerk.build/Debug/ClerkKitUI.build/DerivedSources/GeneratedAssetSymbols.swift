import Foundation
#if canImport(DeveloperToolsSupport)
import DeveloperToolsSupport
#endif

#if SWIFT_PACKAGE
private let resourceBundle = Foundation.Bundle.module
#else
private class ResourceBundleClass {}
private let resourceBundle = Foundation.Bundle(for: ResourceBundleClass.self)
#endif

// MARK: - Color Symbols -

@available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *)
extension DeveloperToolsSupport.ColorResource {

    /// The "Background" asset catalog color resource.
    static let background = DeveloperToolsSupport.ColorResource(name: "Background", bundle: resourceBundle)

    /// The "ClerkDanger" asset catalog color resource.
    static let clerkDanger = DeveloperToolsSupport.ColorResource(name: "ClerkDanger", bundle: resourceBundle)

    /// The "ClerkMuted" asset catalog color resource.
    static let clerkMuted = DeveloperToolsSupport.ColorResource(name: "ClerkMuted", bundle: resourceBundle)

    /// The "ClerkNeutral" asset catalog color resource.
    static let clerkNeutral = DeveloperToolsSupport.ColorResource(name: "ClerkNeutral", bundle: resourceBundle)

    /// The "ClerkPrimary" asset catalog color resource.
    static let clerkPrimary = DeveloperToolsSupport.ColorResource(name: "ClerkPrimary", bundle: resourceBundle)

    /// The "ClerkPrimaryForeground" asset catalog color resource.
    static let clerkPrimaryForeground = DeveloperToolsSupport.ColorResource(name: "ClerkPrimaryForeground", bundle: resourceBundle)

    /// The "Danger" asset catalog color resource.
    static let danger = DeveloperToolsSupport.ColorResource(name: "Danger", bundle: resourceBundle)

    /// The "Foreground" asset catalog color resource.
    static let foreground = DeveloperToolsSupport.ColorResource(name: "Foreground", bundle: resourceBundle)

    /// The "Input" asset catalog color resource.
    static let input = DeveloperToolsSupport.ColorResource(name: "Input", bundle: resourceBundle)

    /// The "InputForeground" asset catalog color resource.
    static let inputForeground = DeveloperToolsSupport.ColorResource(name: "InputForeground", bundle: resourceBundle)

    /// The "Muted" asset catalog color resource.
    static let muted = DeveloperToolsSupport.ColorResource(name: "Muted", bundle: resourceBundle)

    /// The "Neutral" asset catalog color resource.
    static let neutral = DeveloperToolsSupport.ColorResource(name: "Neutral", bundle: resourceBundle)

    /// The "Primary" asset catalog color resource.
    static let primary = DeveloperToolsSupport.ColorResource(name: "Primary", bundle: resourceBundle)

    /// The "PrimaryForeground" asset catalog color resource.
    static let primaryForeground = DeveloperToolsSupport.ColorResource(name: "PrimaryForeground", bundle: resourceBundle)

    /// The "Success" asset catalog color resource.
    static let success = DeveloperToolsSupport.ColorResource(name: "Success", bundle: resourceBundle)

    /// The "Warning" asset catalog color resource.
    static let warning = DeveloperToolsSupport.ColorResource(name: "Warning", bundle: resourceBundle)

    /// The "mutedForeground" asset catalog color resource.
    static let mutedForeground = DeveloperToolsSupport.ColorResource(name: "mutedForeground", bundle: resourceBundle)

}

// MARK: - Image Symbols -

@available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *)
extension DeveloperToolsSupport.ImageResource {

    /// The "clerk-logo" asset catalog image resource.
    static let clerkLogo = DeveloperToolsSupport.ImageResource(name: "clerk-logo", bundle: resourceBundle)

    /// The "device-desktop" asset catalog image resource.
    static let deviceDesktop = DeveloperToolsSupport.ImageResource(name: "device-desktop", bundle: resourceBundle)

    /// The "device-mobile" asset catalog image resource.
    static let deviceMobile = DeveloperToolsSupport.ImageResource(name: "device-mobile", bundle: resourceBundle)

    /// The "icon-check" asset catalog image resource.
    static let iconCheck = DeveloperToolsSupport.ImageResource(name: "icon-check", bundle: resourceBundle)

    /// The "icon-check-circle" asset catalog image resource.
    static let iconCheckCircle = DeveloperToolsSupport.ImageResource(name: "icon-check-circle", bundle: resourceBundle)

    /// The "icon-chevron-right" asset catalog image resource.
    static let iconChevronRight = DeveloperToolsSupport.ImageResource(name: "icon-chevron-right", bundle: resourceBundle)

    /// The "icon-clipboard" asset catalog image resource.
    static let iconClipboard = DeveloperToolsSupport.ImageResource(name: "icon-clipboard", bundle: resourceBundle)

    /// The "icon-cog" asset catalog image resource.
    static let iconCog = DeveloperToolsSupport.ImageResource(name: "icon-cog", bundle: resourceBundle)

    /// The "icon-credit-card" asset catalog image resource.
    static let iconCreditCard = DeveloperToolsSupport.ImageResource(name: "icon-credit-card", bundle: resourceBundle)

    /// The "icon-edit" asset catalog image resource.
    static let iconEdit = DeveloperToolsSupport.ImageResource(name: "icon-edit", bundle: resourceBundle)

    /// The "icon-email" asset catalog image resource.
    static let iconEmail = DeveloperToolsSupport.ImageResource(name: "icon-email", bundle: resourceBundle)

    /// The "icon-fingerprint" asset catalog image resource.
    static let iconFingerprint = DeveloperToolsSupport.ImageResource(name: "icon-fingerprint", bundle: resourceBundle)

    /// The "icon-key" asset catalog image resource.
    static let iconKey = DeveloperToolsSupport.ImageResource(name: "icon-key", bundle: resourceBundle)

    /// The "icon-lock" asset catalog image resource.
    static let iconLock = DeveloperToolsSupport.ImageResource(name: "icon-lock", bundle: resourceBundle)

    /// The "icon-phone" asset catalog image resource.
    static let iconPhone = DeveloperToolsSupport.ImageResource(name: "icon-phone", bundle: resourceBundle)

    /// The "icon-plus" asset catalog image resource.
    static let iconPlus = DeveloperToolsSupport.ImageResource(name: "icon-plus", bundle: resourceBundle)

    /// The "icon-profile" asset catalog image resource.
    static let iconProfile = DeveloperToolsSupport.ImageResource(name: "icon-profile", bundle: resourceBundle)

    /// The "icon-security" asset catalog image resource.
    static let iconSecurity = DeveloperToolsSupport.ImageResource(name: "icon-security", bundle: resourceBundle)

    /// The "icon-sign-out" asset catalog image resource.
    static let iconSignOut = DeveloperToolsSupport.ImageResource(name: "icon-sign-out", bundle: resourceBundle)

    /// The "icon-sms" asset catalog image resource.
    static let iconSms = DeveloperToolsSupport.ImageResource(name: "icon-sms", bundle: resourceBundle)

    /// The "icon-spinner" asset catalog image resource.
    static let iconSpinner = DeveloperToolsSupport.ImageResource(name: "icon-spinner", bundle: resourceBundle)

    /// The "icon-switch" asset catalog image resource.
    static let iconSwitch = DeveloperToolsSupport.ImageResource(name: "icon-switch", bundle: resourceBundle)

    /// The "icon-three-dots-vertical" asset catalog image resource.
    static let iconThreeDotsVertical = DeveloperToolsSupport.ImageResource(name: "icon-three-dots-vertical", bundle: resourceBundle)

    /// The "icon-triangle-right" asset catalog image resource.
    static let iconTriangleRight = DeveloperToolsSupport.ImageResource(name: "icon-triangle-right", bundle: resourceBundle)

    /// The "icon-up-down" asset catalog image resource.
    static let iconUpDown = DeveloperToolsSupport.ImageResource(name: "icon-up-down", bundle: resourceBundle)

    /// The "icon-user" asset catalog image resource.
    static let iconUser = DeveloperToolsSupport.ImageResource(name: "icon-user", bundle: resourceBundle)

    /// The "icon-warning" asset catalog image resource.
    static let iconWarning = DeveloperToolsSupport.ImageResource(name: "icon-warning", bundle: resourceBundle)

}

