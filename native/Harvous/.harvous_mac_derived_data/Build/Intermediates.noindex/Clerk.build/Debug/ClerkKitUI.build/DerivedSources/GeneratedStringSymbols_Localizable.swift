// 
// GeneratedStringSymbols_Localizable.swift
// Auto-Generated symbols for localized strings defined in “Localizable.xcstrings”.
// 

import Foundation

#if SWIFT_PACKAGE
private nonisolated let resourceBundle = Foundation.Bundle.module
@available(macOS 13, iOS 16, tvOS 16, watchOS 9, *)
private nonisolated let resourceBundleDescription = LocalizedStringResource.BundleDescription.atURL(resourceBundle.bundleURL)
#else

private class ResourceBundleClass {}
@available(macOS 13, iOS 16, tvOS 16, watchOS 9, *)
private nonisolated let resourceBundleDescription = LocalizedStringResource.BundleDescription.forClass(ResourceBundleClass.self)
#endif

@available(macOS 13, iOS 16, tvOS 16, watchOS 9, *)
nonisolated extension LocalizedStringResource {
    /**
     Localized string for key “Redirect URL is missing or invalid. Unable to start external authentication flow.” in table “Localizable.xcstrings”.
     */
    static var redirectUrlIsMissingOrInvalidUnableToStartExternalAuthenticationFlow: LocalizedStringResource {
        LocalizedStringResource("Redirect URL is missing or invalid. Unable to start external authentication flow.", table: "Localizable", bundle: resourceBundleDescription)
    }
}