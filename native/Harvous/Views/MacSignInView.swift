import SwiftUI

#if canImport(ClerkKit)
import ClerkKit
#endif

#if canImport(AuthenticationServices)
import AuthenticationServices
#endif

/// Native sign-in / sign-up surface used on macOS (and as a fallback on any
/// platform without ClerkKitUI's `AuthView`). Visual language is taken from
/// the marketing site (`/site/`) — Scorekard display headline with an inline
/// marker highlight on "Bible," warm paper background, soft rule borders,
/// gradient blue CTA pill, "Secured by Clerk" footer.
///
/// Auth backends (ClerkKit core APIs):
///   - Email code (magic-code): same flow for sign-in and sign-up; sign-up
///     additionally collects optional first/last name.
///   - Sign in with Apple: gated behind `HarvousAuthCapability.appleSignInEnabled`
///     because the entitlement requires a paid Apple Developer Program team.
struct MacSignInView: View {
    @State private var mode: Mode = .signIn
    @State private var step: Step = .enterDetails
    @State private var email: String = ""
    @State private var code: String = ""
    @State private var isBusy: Bool = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    #if canImport(ClerkKit)
    @State private var pendingSignIn: SignIn?
    @State private var pendingSignUp: SignUp?
    #endif

    private enum Mode { case signIn, signUp }
    private enum Step { case enterDetails, enterCode }
    private enum Field { case email, code }

    var body: some View {
        ZStack(alignment: .top) {
            HarvousSitePalette.paper.ignoresSafeArea()

            // Blend the macOS title bar (traffic-light strip) into the paper
            // background so there's no hard separator across the top.
            #if os(macOS)
            HarvousPaperWindowChrome(background: HarvousSitePalette.paper)
                .frame(width: 0, height: 0)
                .allowsHitTesting(false)
            #endif

            // Floating site-style header pinned to the top.
            siteHeaderBar
                .padding(.top, 16)

            // Vertically centered content cluster (heading + form + footer
            // sit together as a single group, not scattered with Spacers).
            VStack(spacing: 0) {
                hero
                    .padding(.horizontal, 24)
                Color.clear.frame(height: 20)
                formStack
                    .padding(.horizontal, 24)
                Color.clear.frame(height: 18)
                footerLine
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        #if os(macOS)
        .frame(minWidth: 560, minHeight: 560)
        #endif
    }

    // MARK: - Floating site-style header bar (mirrors /site/ Header.astro)

    private var siteHeaderBar: some View {
        HStack(spacing: 8) {
            // Same `app-icon.png` the marketing site uses (`/icons/app-icon.png`,
            // rendered as `h-6 w-6 rounded-md` on the web). Bundled in the
            // native Assets catalog as `HarvousAppIcon` so both platforms can
            // share the exact same artwork.
            Image("HarvousAppIcon")
                .resizable()
                .interpolation(.high)
                .frame(width: 22, height: 22)
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            Text("Harvous")
                .font(.system(size: 15, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(HarvousSitePalette.ink)
        }
        .padding(.leading, 12)
        .padding(.trailing, 18)
        .padding(.vertical, 7)
        .background(
            Capsule(style: .continuous)
                .fill(.white.opacity(0.85))
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(HarvousSitePalette.rule, lineWidth: 0.5)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 12, y: 4)
    }

    // MARK: - Hero (display headline + subtitle)

    private var hero: some View {
        heroHeadline
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: 520)
    }

    @ViewBuilder
    private var heroHeadline: some View {
        switch step {
        case .enterDetails where mode == .signIn:
            headlineLayout(line1Start: "Open ", line2: "study Bible.")
        case .enterDetails where mode == .signUp:
            headlineLayout(line1Start: "Create ", line2: "study Bible.")
        case .enterCode:
            headlineLayout(line1Start: "Check ", line2: "inbox.")
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private func headlineLayout(line1Start: String, line2: String) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                displayWord(line1Start)
                displayWord("your", marked: true)
            }
            displayWord(line2)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }

    private func displayWord(_ text: String, marked: Bool = false) -> some View {
        let fontSize: CGFloat = {
            #if os(iOS)
            return UIScreen.main.bounds.width * 0.105
            #else
            return 44
            #endif
        }()
        let view = Text(text)
            .font(.harvousDisplay(size: fontSize))
            .foregroundStyle(HarvousSitePalette.ink)
        if marked {
            return AnyView(
                view.background(
                    GeometryReader { geo in
                        HarvousSitePalette.highlight
                            .frame(height: geo.size.height * 0.42)
                            .offset(y: geo.size.height * 0.30)
                    }
                )
            )
        } else {
            return AnyView(view)
        }
    }

    // MARK: - Form stack (Apple button + email/code form)

    private var formStack: some View {
        VStack(spacing: 14) {
            if step == .enterDetails {
                if HarvousAuthCapability.appleSignInEnabled {
                    #if canImport(AuthenticationServices)
                    appleButton
                    orDivider
                    #endif
                }
                detailsForm
                primaryButton
            } else {
                codeForm
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if step == .enterDetails {
                switcherLine.padding(.top, 6)
            }
        }
        .frame(maxWidth: 380)
    }

    // MARK: - Apple

    #if canImport(AuthenticationServices)
    private var appleButton: some View {
        SignInWithAppleButton(
            mode == .signIn ? .signIn : .signUp,
            onRequest: { _ in },
            onCompletion: { _ in }
        )
        .signInWithAppleButtonStyle(.black)
        .frame(height: 46)
        .clipShape(Capsule(style: .continuous))
        .allowsHitTesting(false)
        .overlay(
            Button { Task { await signInWithApple() } } label: { Color.clear }
            .buttonStyle(.plain)
        )
        .disabled(isBusy)
    }
    #endif

    private var orDivider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(HarvousSitePalette.rule).frame(height: 0.5)
            Text("or")
                .font(.system(size: 12))
                .foregroundStyle(HarvousSitePalette.inkFaint)
            Rectangle().fill(HarvousSitePalette.rule).frame(height: 0.5)
        }
        .padding(.vertical, 4)
    }

    // MARK: - Inputs

    private var detailsForm: some View {
        pillField(text: $email, prompt: "Enter your email", field: .email, kind: .email)
    }

    private enum FieldKind { case generic, email, code }

    @ViewBuilder
    private func pillField(
        text: Binding<String>,
        prompt: String,
        field: Field,
        kind: FieldKind = .generic
    ) -> some View {
        let base = TextField("", text: text, prompt: Text(prompt).foregroundColor(HarvousSitePalette.inkFaint))
            .textFieldStyle(.plain)
            .font(.system(size: 15))
            .padding(.horizontal, 20)
            .padding(.vertical, 13)
            .background(
                Capsule(style: .continuous)
                    .fill(HarvousSitePalette.card)
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(
                        focusedField == field ? HarvousSitePalette.accent : HarvousSitePalette.rule,
                        lineWidth: focusedField == field ? 1.5 : 0.5
                    )
            )
            .shadow(color: Color.black.opacity(0.03), radius: 4, y: 1)
            .disableAutocorrection(true)
            .focused($focusedField, equals: field)

        #if os(iOS)
        switch kind {
        case .email:
            base.textContentType(.emailAddress).keyboardType(.emailAddress).autocapitalization(.none)
        case .code:
            base.textContentType(.oneTimeCode).keyboardType(.numberPad)
        case .generic:
            base
        }
        #else
        base
        #endif
    }

    // MARK: - Code form

    private var codeForm: some View {
        VStack(spacing: 12) {
            pillField(text: $code, prompt: "123456", field: .code, kind: .code)

            Button { Task { await verifyCode() } } label: {
                primaryButtonLabel(title: "Verify and continue")
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.defaultAction)
            .disabled(isBusy || code.trimmingCharacters(in: .whitespaces).count < 4)

            Button("Use a different email") {
                step = .enterDetails
                code = ""
                errorMessage = nil
                pendingSignInClear()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { focusedField = .email }
            }
            .buttonStyle(.plain)
            .font(.system(size: 13))
            .foregroundStyle(HarvousSitePalette.accent)
        }
    }

    // MARK: - Primary CTA (site-style gradient blue pill)

    private var primaryButton: some View {
        Button { Task { await beginEmailFlow() } } label: {
            primaryButtonLabel(title: mode == .signIn ? "Sign in with email" : "Send sign-in code")
        }
        .buttonStyle(.plain)
        .keyboardShortcut(.defaultAction)
        .disabled(isBusy || !isValidEmail(email))
    }

    private func primaryButtonLabel(title: String) -> some View {
        ZStack {
            Capsule(style: .continuous)
                .fill(LinearGradient(
                    colors: [
                        Color(red: 0.353, green: 0.573, blue: 1.0),  // #5A92FF
                        Color(red: 0.220, green: 0.412, blue: 0.902), // #3869E6
                        Color(red: 0.141, green: 0.337, blue: 0.851)  // #2456D9
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                ))
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(Color(red: 0.141, green: 0.337, blue: 0.851).opacity(0.4), lineWidth: 1)
                )
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(Color.white.opacity(0.35), lineWidth: 1)
                        .blendMode(.plusLighter)
                        .padding(0.5)
                )
                .shadow(color: Color(red: 0.220, green: 0.412, blue: 0.902).opacity(0.45), radius: 12, y: 6)
            if isBusy {
                ProgressView().controlSize(.small).tint(.white)
            } else {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(height: 46)
        .opacity(isBusy || (!isValidEmail(email) && step == .enterDetails) ? 0.7 : 1.0)
    }

    private var switcherLine: some View {
        HStack(spacing: 4) {
            Text(mode == .signIn ? "Don't have an account?" : "Already have an account?")
                .font(.system(size: 13))
                .foregroundStyle(HarvousSitePalette.inkSoft)
            Button(mode == .signIn ? "Sign up" : "Sign in") {
                mode = mode == .signIn ? .signUp : .signIn
                errorMessage = nil
            }
            .buttonStyle(.plain)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(HarvousSitePalette.accent)
        }
    }

    private var footerLine: some View {
        Text("Secured by Clerk")
            .font(.system(size: 11))
            .foregroundStyle(HarvousSitePalette.inkFaint)
    }

    // MARK: - Validation + actions

    private func isValidEmail(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespaces)
        return t.contains("@") && t.contains(".") && t.count >= 5
    }

    private func pendingSignInClear() {
        #if canImport(ClerkKit)
        pendingSignIn = nil
        pendingSignUp = nil
        #endif
    }

    private func beginEmailFlow() async {
        #if canImport(ClerkKit)
        isBusy = true; errorMessage = nil
        defer { isBusy = false }
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        do {
            switch mode {
            case .signIn:
                let signIn = try await Clerk.shared.auth.signInWithEmailCode(emailAddress: trimmed)
                pendingSignIn = signIn
                pendingSignUp = nil
            case .signUp:
                // Name is collected later in the in-app profile editor, not here —
                // keeps the sign-up surface as light as the sign-in one.
                let signUp = try await Clerk.shared.auth.signUp(emailAddress: trimmed)
                let prepared = try await signUp.sendEmailCode()
                pendingSignUp = prepared
                pendingSignIn = nil
            }
            step = .enterCode
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { focusedField = .code }
        } catch {
            errorMessage = friendlyError(error)
        }
        #else
        errorMessage = "Clerk SDK not linked."
        #endif
    }

    private func verifyCode() async {
        #if canImport(ClerkKit)
        isBusy = true; errorMessage = nil
        defer { isBusy = false }
        let trimmed = code.trimmingCharacters(in: .whitespaces)
        do {
            if let signIn = pendingSignIn {
                _ = try await signIn.verifyCode(trimmed)
            } else if let signUp = pendingSignUp {
                _ = try await signUp.verifyEmailCode(trimmed)
            } else {
                errorMessage = "Sign-in session expired. Please request a new code."
                step = .enterDetails
                return
            }
        } catch {
            errorMessage = friendlyError(error)
        }
        #else
        errorMessage = "Clerk SDK not linked."
        #endif
    }

    #if canImport(AuthenticationServices)
    private func signInWithApple() async {
        #if canImport(ClerkKit)
        isBusy = true; errorMessage = nil
        defer { isBusy = false }
        do {
            _ = try await Clerk.shared.auth.signInWithApple()
        } catch {
            errorMessage = friendlyError(error)
        }
        #endif
    }
    #endif

    private func friendlyError(_ error: Error) -> String {
        let m = error.localizedDescription
        if let r = m.range(of: ": ") { return String(m[r.upperBound...]) }
        return m
    }
}

// MARK: - Capability gate

enum HarvousAuthCapability {
    /// Flip to `true` after upgrading to a paid Apple Developer Program account
    /// AND adding the "Sign in with Apple" capability via Xcode for both targets.
    static let appleSignInEnabled: Bool = false
}

// MARK: - Site-style palette (mirrors `/site/src/styles/global.css` tokens)

enum HarvousSitePalette {
    /// `--color-paper` — warm off-white background.
    static let paper    = Color(red: 0.969, green: 0.965, blue: 0.953)
    /// `--color-warm`  — slightly warmer paper variant for hover states.
    static let warm     = Color(red: 0.945, green: 0.929, blue: 0.886)
    /// `--color-ink`   — near-black body text.
    static let ink      = Color(red: 0.102, green: 0.098, blue: 0.086)
    /// `--color-ink-soft` — muted secondary text.
    static let inkSoft  = Color(red: 0.353, green: 0.345, blue: 0.310)
    /// `--color-ink-faint` — placeholder / very muted text.
    static let inkFaint = Color(red: 0.541, green: 0.529, blue: 0.486)
    /// `--color-rule`  — subtle dividers and borders.
    static let rule     = Color(red: 0.906, green: 0.894, blue: 0.863)
    /// `--color-card`  — pure white cards.
    static let card     = Color.white
    /// `--color-accent` — bold blue links / focus rings.
    static let accent   = Color(red: 0.220, green: 0.412, blue: 0.902)
    /// `--color-highlight` — yellow marker swipe under display headlines.
    static let highlight = Color(red: 1.0, green: 0.910, blue: 0.659)

    // Pastel palette (mirrors `/site/`):
    /// `--color-sky` + `--color-sky-ink` — used by the "Linked references" card.
    static let sky      = Color(red: 0.761, green: 0.863, blue: 0.973)
    static let skyInk   = Color(red: 0.078, green: 0.227, blue: 0.431)
    /// `--color-lilac` + `--color-lilac-ink` — "Sorts itself" card.
    static let lilac    = Color(red: 0.871, green: 0.773, blue: 0.929)
    static let lilacInk = Color(red: 0.290, green: 0.102, blue: 0.439)
    /// Highlight-yellow ink (matches site's `#7a5410`) — "Study highlights" card.
    static let highlightInk = Color(red: 0.478, green: 0.329, blue: 0.063)
}

// MARK: - Display font helper

extension Font {
    /// Scorekard display font (bundled via `Resources/Fonts/`). Falls back to
    /// the system rounded design if the font isn't registered (e.g. during
    /// previews where resource registration may be skipped).
    static func harvousDisplay(size: CGFloat, weight: Weight = .semibold) -> Font {
        let psName: String = {
            switch weight {
            case .bold: return "Scorekard-Bold"
            case .regular: return "Scorekard-Regular"
            default: return "Scorekard-Semibold"
            }
        }()
        return .custom(psName, size: size).weight(weight)
    }
}

// MARK: - App glyph (the same H-square used on the site)

struct HarvousAppMarkGlyph: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(HarvousSitePalette.ink)
            HarvousWordmarkShape()
                .fill(.white, style: FillStyle(eoFill: true))
                .padding(4.5)
        }
    }
}

// MARK: - macOS window chrome adapter

#if os(macOS)
/// Hosts a zero-size NSView whose `viewDidMoveToWindow` callback dresses the
/// containing `NSWindow` so the title bar (and traffic-light strip) blends
/// into the sign-in screen's warm paper background:
///   - `titlebarAppearsTransparent = true` removes the hairline divider
///   - `.fullSizeContentView` lets paper extend behind the title bar
///   - `backgroundColor = paper` matches the chrome to the content
///
/// On disappear we revert the changes so the main app window (post-sign-in)
/// keeps its normal chrome.
struct HarvousPaperWindowChrome: NSViewRepresentable {
    let background: Color

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSView {
        let view = ChromeAnchorView()
        view.onAttach = { window in
            context.coordinator.attach(to: window, paper: background)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        coordinator.restore()
    }

    final class Coordinator {
        private weak var window: NSWindow?
        private var paperColor: NSColor?
        private var savedBackground: NSColor?
        private var savedStyleMask: NSWindow.StyleMask?
        private var savedTitlebarAppearsTransparent: Bool?
        private var savedTitleVisibility: NSWindow.TitleVisibility?
        private var observers: [NSObjectProtocol] = []

        func attach(to window: NSWindow, paper: Color) {
            self.window = window
            self.paperColor = NSColor(paper)
            savedBackground = window.backgroundColor
            savedStyleMask = window.styleMask
            savedTitlebarAppearsTransparent = window.titlebarAppearsTransparent
            savedTitleVisibility = window.titleVisibility

            applyChrome()

            // macOS re-applies its natural window chrome when the app loses
            // and regains focus (the user's "switch away → switch back"
            // scenario). Re-stamp our settings on every key/main event so
            // the paper title bar survives those transitions.
            let nc = NotificationCenter.default
            observers.append(nc.addObserver(
                forName: NSWindow.didBecomeKeyNotification,
                object: window,
                queue: .main
            ) { [weak self] _ in self?.applyChrome() })
            observers.append(nc.addObserver(
                forName: NSWindow.didBecomeMainNotification,
                object: window,
                queue: .main
            ) { [weak self] _ in self?.applyChrome() })
            observers.append(nc.addObserver(
                forName: NSApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in self?.applyChrome() })
        }

        private func applyChrome() {
            guard let window, let paperColor else { return }
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.styleMask.insert(.fullSizeContentView)
            window.backgroundColor = paperColor
            window.isOpaque = false
        }

        func restore() {
            for token in observers {
                NotificationCenter.default.removeObserver(token)
            }
            observers.removeAll()
            guard let window else { return }
            if let v = savedTitlebarAppearsTransparent { window.titlebarAppearsTransparent = v }
            if let v = savedTitleVisibility { window.titleVisibility = v }
            if let v = savedStyleMask { window.styleMask = v }
            if let v = savedBackground { window.backgroundColor = v }
            window.isOpaque = true
            self.window = nil
        }
    }

    /// Custom NSView so we can fire a callback once the SwiftUI hierarchy
    /// has attached us to the hosting window (window is `nil` during `init`).
    private final class ChromeAnchorView: NSView {
        var onAttach: ((NSWindow) -> Void)?
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let win = window {
                onAttach?(win)
            }
        }
    }
}
#endif

/// The Harvous "H-square" mark from `/site/` and the SPA, expressed as a
/// SwiftUI shape so the brand mark renders crisply at any size.
struct HarvousWordmarkShape: Shape {
    func path(in rect: CGRect) -> Path {
        // Source viewBox is 45×64. Scale path to the supplied rect.
        var p = Path()
        let sx = rect.width / 45.0
        let sy = rect.height / 64.0
        func pt(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: rect.minX + CGFloat(x) * sx, y: rect.minY + CGFloat(y) * sy)
        }
        p.move(to: pt(44.8037, 63.9941))
        p.addLine(to: pt(0.0078125, 63.9941))
        p.addLine(to: pt(0.0078125, 0))
        p.addLine(to: pt(44.8037, 0))
        p.closeSubpath()

        p.move(to: pt(34.5645, 31.168))
        p.addCurve(to: pt(15.3711, 50.543), control1: pt(25.6988, 34.2637), control2: pt(18.5024, 41.2949))
        p.addLine(to: pt(14.2842, 53.752))
        p.addLine(to: pt(34.5645, 53.752))
        p.closeSubpath()

        p.move(to: pt(10.2471, 37.8643))
        p.addCurve(to: pt(34.5645, 20.4824), control1: pt(15.8921, 29.2487), control2: pt(24.5827, 23.0353))
        p.addLine(to: pt(34.5645, 10.2393))
        p.addLine(to: pt(10.2471, 10.2393))
        p.closeSubpath()

        return p
    }
}
