import SwiftUI

enum HarvousTypography {
    /// 34pt / weight 800 — empty states, page headers
    static let largeTitle = Font.system(size: 34, weight: .heavy)

    /// 20pt / weight 700 — card titles, section headers
    static let title      = Font.system(size: 20, weight: .bold)

    /// 16pt / weight 450 — body text (SwiftUI `.medium` is closest to 500)
    static let body       = Font.system(size: 16, weight: .regular)

    /// 13pt / weight 500 — metadata, dates, tags
    static let caption    = Font.system(size: 13, weight: .medium)

    /// 11pt / weight 400 — secondary metadata
    static let footnote   = Font.system(size: 11, weight: .regular)
}
