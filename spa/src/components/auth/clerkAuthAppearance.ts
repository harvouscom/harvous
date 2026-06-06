import type { Appearance } from '@clerk/types';

/** Classic Harvous tokens — sign-in/up never follow OS/prototype dark mode. */
const classicClerkVariables: NonNullable<Appearance['variables']> = {
  colorPrimary: 'var(--color-bold-blue)',
  colorBackground: '#ffffff',
  colorText: 'var(--color-deep-grey)',
  colorTextSecondary: 'var(--color-stone-grey)',
  colorInputBackground: '#ffffff',
  colorInputText: 'var(--color-deep-grey)',
  colorForeground: 'var(--color-deep-grey)',
  colorInputForeground: 'var(--color-deep-grey)',
  colorNeutral: 'var(--color-stone-grey)',
  colorDanger: '#ef4444',
  borderRadius: '1rem',
};

/** Pre–site-redesign Clerk styling for app.harvous.com / localhost sign-in/up. */
export const classicClerkAuthAppearance: Appearance = {
  baseTheme: undefined,
  variables: classicClerkVariables,
  elements: {
    rootBox: 'clerk-form-root',
    card: {
      className: 'clerk-form-card',
      style: {
        border: 'none',
        borderWidth: '0',
        overflowX: 'hidden',
        backgroundColor: '#ffffff',
        color: 'var(--color-deep-grey)',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
    },
    headerTitle: 'clerk-form-header-title',
    headerSubtitle: 'clerk-form-header-subtitle',
    formButtonPrimary: 'clerk-form-button-primary primary-button',
    formFieldInput: 'clerk-form-input',
    otpCodeField: 'clerk-form-otp-field',
    otpCodeFieldInputs: 'clerk-form-otp-row',
    otpCodeFieldInput: {
      className: 'clerk-form-otp-input',
      style: {
        minHeight: '3rem',
        maxWidth: '2.75rem',
        width: '2.75rem',
        padding: 0,
        textAlign: 'center',
      },
    },
    otpCodeFieldInputContainer: 'clerk-form-otp-input-container',
    formFieldLabel: {
      className: 'hidden',
      style: { display: 'none' },
    },
    formFieldError: { className: 'clerk-form-error' },
    formFieldAlert: {
      className: 'clerk-form-alert',
      style: {
        maxWidth: '100%',
        width: '100%',
        boxSizing: 'border-box',
        overflowWrap: 'break-word',
        wordWrap: 'break-word',
        whiteSpace: 'normal',
      },
    },
    main: { style: { gap: '12px', backgroundColor: '#ffffff' } },
    form: { style: { gap: '12px' } },
    formContainer: { style: { gap: '12px' } },
    formFieldRow: { style: { marginBottom: 0, marginTop: 0 } },
    formField: { style: { marginBottom: 0, marginTop: 0 } },
    formFieldAction: 'clerk-form-link',
    formResendCodeLink: 'clerk-form-link',
    alternativeMethodsBlockButton: 'clerk-form-alternative-method',
    alternativeMethodsBlockButtonText: 'clerk-form-alternative-method__text',
    footerActionLink: 'clerk-form-link',
    dividerLine: 'clerk-form-divider-line',
    dividerText: 'clerk-form-divider-text',
    buttonArrowIcon: 'hidden',
    footer: { style: { backgroundColor: '#ffffff' } },
  },
};
