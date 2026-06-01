import CoreGraphics

/// Layout constants shared with web study dock CSS (`--study-dock-max-width`).
enum StudyDockLayoutMetrics {
    /// Paper 720pt + 12pt overhang × 2 + 24pt chrome = 768pt (`study-dock-card.css`).
    static let maxCardWidth: CGFloat = 768
}
