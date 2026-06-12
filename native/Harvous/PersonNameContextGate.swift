import Foundation

/// Skip dictionary / character keyword hits when a capitalized token looks like a modern
/// person name in running prose. Shared by reference suggestions and bible-study folder/tag
/// matching — keep in sync with web `person-name-context.ts`.
enum PersonNameContextGate {
    static let honorificPrefixes: Set<String> = [
        "ps", "st", "sr", "dr", "rev", "fr", "pastor", "rabbi", "mr", "mrs", "ms",
    ]

    static let surnameMinLength = 3

    static func isCapitalized(_ word: String) -> Bool {
        guard let first = word.unicodeScalars.first else { return false }
        return CharacterSet.uppercaseLetters.contains(first)
    }

    static func shouldSkip(in string: String, wordRange: Range<String.Index>) -> Bool {
        if let prior = wordToken(in: string, endingBefore: wordRange.lowerBound),
           honorificPrefixes.contains(prior.lowercased()) {
            return true
        }
        let after = string[wordRange.upperBound...]
        if after.hasPrefix("'s") || after.hasPrefix("'s") || after.hasPrefix("'") {
            return false
        }
        if let next = wordToken(in: string, startingAfter: wordRange.upperBound),
           isCapitalized(next),
           next.count >= surnameMinLength {
            return true
        }
        return false
    }

    private static func wordToken(in string: String, endingBefore index: String.Index) -> String? {
        guard index > string.startIndex else { return nil }
        let prefix = string[string.startIndex..<index].trimmingCharacters(in: .whitespaces)
        guard !prefix.isEmpty else { return nil }
        guard let match = prefix.range(of: #"[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ''-]*$"#, options: .regularExpression) else {
            return nil
        }
        let token = String(prefix[match])
        return token.isEmpty ? nil : token
    }

    private static func wordToken(in string: String, startingAfter index: String.Index) -> String? {
        guard index < string.endIndex else { return nil }
        let tail = String(string[index...])
        let nsTail = tail as NSString
        guard let regex = try? NSRegularExpression(pattern: #"^\s*([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ''-]*)"#),
              let match = regex.firstMatch(in: tail, range: NSRange(location: 0, length: nsTail.length)),
              match.numberOfRanges > 1 else { return nil }
        let capture = match.range(at: 1)
        guard capture.location != NSNotFound else { return nil }
        let token = nsTail.substring(with: capture)
        return token.isEmpty ? nil : token
    }
}
