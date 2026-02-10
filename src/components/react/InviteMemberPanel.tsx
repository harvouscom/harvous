import { useState } from 'react';
import { createPortal } from 'react-dom';

interface InviteMemberPanelProps {
  spaceId: string;
  spaceName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type InviteMethod = 'email' | 'link';

export default function InviteMemberPanel({
  spaceId,
  spaceName,
  onClose,
  onSuccess,
}: InviteMemberPanelProps) {
  const [method, setMethod] = useState<InviteMethod>('link');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [expiresIn, setExpiresIn] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleInvite = async () => {
    setError('');
    setInviteLink('');
    setShowSuccess(false);

    // Validation
    if (method === 'email') {
      if (!email.trim()) {
        setError('Please enter an email address');
        return;
      }
      if (!validateEmail(email)) {
        setError('Please enter a valid email address');
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/spaces/${spaceId}/members/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method,
          email: method === 'email' ? email : undefined,
          message: message.trim() || undefined,
          expiresIn,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }

      // Success!
      if (method === 'link') {
        setInviteLink(data.inviteUrl);
        setShowSuccess(true);
      } else {
        setShowSuccess(true);
        setEmail('');
        setMessage('');

        // Auto-close after 2 seconds for email invites
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 2000);
      }

    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);

      // Show toast notification
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'Link copied to clipboard!', type: 'success' },
        })
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'Failed to copy link', type: 'error' },
        })
      );
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-[24px] w-full max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-fog-white)]">
          <h2 className="text-[18px] font-semibold text-[var(--color-deep-grey)] m-0">
            Invite to {spaceName}
          </h2>
          <button
            className="bg-transparent border-none text-[32px] leading-none text-[var(--color-pebble-grey)] cursor-pointer p-0 w-8 h-8 flex items-center justify-center hover:text-[var(--color-deep-grey)] transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Method Toggle - Using button group pattern */}
        <div className="button-group m-4 mb-0">
          <div className="button-group__container">
            <button
              type="button"
              onClick={() => setMethod('link')}
              className={`button-group__button button-group__button--left h-[64px] flex items-center justify-center gap-2 px-4 border-none cursor-pointer ${
                method === 'link' ? '' : 'bg-transparent'
              }`}
              style={method === 'link' ? { backgroundImage: 'var(--color-gradient-gray)' } : {}}
            >
              <span className="text-[18px]">📎</span>
              <span
                className={`font-sans text-[18px] font-semibold whitespace-nowrap ${
                  method === 'link'
                    ? 'text-[var(--color-deep-grey)]'
                    : 'text-[var(--color-pebble-grey)]'
                }`}
              >
                Share Link
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMethod('email')}
              className={`button-group__button button-group__button--right h-[64px] flex items-center justify-center gap-2 px-4 border-none cursor-pointer ${
                method === 'email' ? '' : 'bg-transparent'
              }`}
              style={method === 'email' ? { backgroundImage: 'var(--color-gradient-gray)' } : {}}
            >
              <span className="text-[18px]">✉️</span>
              <span
                className={`font-sans text-[18px] font-semibold whitespace-nowrap ${
                  method === 'email'
                    ? 'text-[var(--color-deep-grey)]'
                    : 'text-[var(--color-pebble-grey)]'
                }`}
              >
                Email Invite
              </span>
            </button>
          </div>
        </div>

        {/* Success Message */}
        {showSuccess && !inviteLink && (
          <div className="bg-[var(--color-green)] text-[var(--color-deep-grey)] px-4 py-3 rounded-xl m-4 text-[14px] font-medium">
            ✓ Invitation sent to {email}!
          </div>
        )}

        {/* Invite Link Display */}
        {inviteLink && (
          <div className="p-6">
            <div className="bg-[var(--color-green)] text-[var(--color-deep-grey)] px-4 py-3 rounded-xl mb-4 text-[14px] font-medium">
              ✓ Invitation link created!
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="flex-1 p-3 border border-[var(--color-fog-white)] rounded-xl text-[13px] font-mono bg-[var(--color-snow-white)] text-[var(--color-deep-grey)]"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                className="px-5 bg-[var(--color-bold-blue)] text-white border-none rounded-xl text-[14px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
                onClick={copyToClipboard}
              >
                Copy
              </button>
            </div>
            <p className="text-[13px] text-[var(--color-pebble-grey)] m-0">
              Anyone with this link can join this space
            </p>
          </div>
        )}

        {/* Form (show only if not showing invite link) */}
        {!inviteLink && (
          <div className="p-6 flex-1 overflow-y-auto">
            {/* Email Input (only for email method) */}
            {method === 'email' && (
              <div className="form-group mb-5">
                <label htmlFor="email" className="form-label">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  className="text-input"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            {/* Personal Message (optional) */}
            <div className="form-group mb-5">
              <label htmlFor="message" className="form-label">
                Personal Message <span className="text-[var(--color-pebble-grey)] font-normal">(optional)</span>
              </label>
              <textarea
                id="message"
                className="text-input resize-none"
                placeholder="Come study with us!"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                maxLength={500}
              />
            </div>

            {/* Expiration */}
            <div className="form-group mb-5">
              <label htmlFor="expiration" className="form-label">
                Expires In
              </label>
              <select
                id="expiration"
                className="select"
                value={expiresIn}
                onChange={(e) => setExpiresIn(Number(e.target.value))}
                disabled={loading}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={0}>Never</option>
              </select>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-[#FED7D7] text-[var(--color-red)] px-4 py-3 rounded-xl mb-4 text-[14px]">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 p-4 border-t border-[var(--color-fog-white)]">
          {inviteLink ? (
            <button
              className="flex-1 px-6 py-3 bg-[var(--color-bold-blue)] text-white border-none rounded-xl text-[14px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
              onClick={onClose}
            >
              Done
            </button>
          ) : (
            <>
              <button
                className="flex-1 px-6 py-3 bg-[var(--color-fog-white)] text-[var(--color-deep-grey)] border-none rounded-xl text-[14px] font-semibold cursor-pointer hover:bg-[var(--color-soft-gray)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-6 py-3 bg-[var(--color-bold-blue)] text-white border-none rounded-xl text-[14px] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleInvite}
                disabled={loading}
              >
                {loading
                  ? 'Creating...'
                  : method === 'email'
                  ? 'Send Invite'
                  : 'Generate Link'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
