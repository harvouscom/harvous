#if canImport(UIKit)
import UIKit

/// Template catalog images backed by Font Awesome bundles in `Assets.xcassets` (`Harvous.*`).
enum HarvousCatalogUIKitImage {
    static func template(named catalogName: String) -> UIImage? {
        UIImage(named: catalogName)?.withRenderingMode(.alwaysTemplate)
    }
}

#endif
