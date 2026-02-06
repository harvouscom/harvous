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
      className="panel-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="panel-container invite-member-panel">
        {/* Header */}
        <div className="panel-header">
          <h2 className="panel-title">Invite to {spaceName}</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Method Tabs */}
        <div className="invite-method-tabs">
          <button
            className={`method-tab ${method === 'link' ? 'active' : ''}`}
            onClick={() => setMethod('link')}
          >
            📎 Share Link
          </button>
          <button
            className={`method-tab ${method === 'email' ? 'active' : ''}`}
            onClick={() => setMethod('email')}
          >
            ✉️ Email Invite
          </button>
        </div>

        {/* Success Message */}
        {showSuccess && !inviteLink && (
          <div className="success-message">
            ✓ Invitation sent to {email}!
          </div>
        )}

        {/* Invite Link Display */}
        {inviteLink && (
          <div className="invite-link-section">
            <div className="success-message">✓ Invitation link created!</div>
            <div className="invite-link-container">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="invite-link-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button className="copy-button" onClick={copyToClipboard}>
                Copy
              </button>
            </div>
            <p className="helper-text">
              Anyone with this link can join this space
            </p>
          </div>
        )}

        {/* Form (show only if not showing invite link) */}
        {!inviteLink && (
          <div className="panel-content">
            {/* Email Input (only for email method) */}
            {method === 'email' && (
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            {/* Personal Message (optional) */}
            <div className="form-group">
              <label htmlFor="message">
                Personal Message <span className="optional">(optional)</span>
              </label>
              <textarea
                id="message"
                className="form-textarea"
                placeholder="Come study with us!"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                maxLength={500}
              />
            </div>

            {/* Expiration */}
            <div className="form-group">
              <label htmlFor="expiration">Expires In</label>
              <select
                id="expiration"
                className="form-select"
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
            {error && <div className="error-message">{error}</div>}

            {/* Action Buttons */}
            <div className="panel-actions">
              <button
                className="button-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="button-primary"
                onClick={handleInvite}
                disabled={loading}
              >
                {loading
                  ? 'Creating...'
                  : method === 'email'
                  ? 'Send Invite'
                  : 'Generate Link'}
              </button>
            </div>
          </div>
        )}

        {/* Done Button (for link method) */}
        {inviteLink && (
          <div className="panel-actions">
            <button className="button-primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>

      <style>{`
        .panel-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
        }

        .invite-member-panel {
          background: white;
          border-radius: 12px;
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px;
          border-bottom: 1px solid #e2e8f0;
        }

        .panel-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a202c;
          margin: 0;
        }

        .panel-close {
          background: none;
          border: none;
          font-size: 32px;
          line-height: 1;
          color: #718096;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .panel-close:hover {
          color: #2d3748;
        }

        .invite-method-tabs {
          display: flex;
          gap: 8px;
          padding: 16px 24px 0;
        }

        .method-tab {
          flex: 1;
          padding: 12px;
          border: 2px solid #e2e8f0;
          background: white;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .method-tab:hover {
          border-color: #cbd5e0;
        }

        .method-tab.active {
          border-color: #667eea;
          background: #eef2ff;
          color: #667eea;
        }

        .panel-content {
          padding: 24px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #2d3748;
          margin-bottom: 8px;
        }

        .optional {
          font-weight: 400;
          color: #718096;
        }

        .form-input,
        .form-textarea,
        .form-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #cbd5e0;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.2s;
        }

        .form-input:focus,
        .form-textarea:focus,
        .form-select:focus {
          outline: none;
          border-color: #667eea;
        }

        .form-input:disabled,
        .form-textarea:disabled,
        .form-select:disabled {
          background: #f7fafc;
          cursor: not-allowed;
        }

        .success-message {
          background: #c6f6d5;
          color: #22543d;
          padding: 12px 16px;
          border-radius: 8px;
          margin: 16px 24px;
          font-size: 14px;
          font-weight: 500;
        }

        .error-message {
          background: #fed7d7;
          color: #c53030;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .invite-link-section {
          padding: 24px;
        }

        .invite-link-container {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }

        .invite-link-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #cbd5e0;
          border-radius: 6px;
          font-size: 13px;
          font-family: monospace;
          background: #f7fafc;
        }

        .copy-button {
          padding: 10px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .copy-button:hover {
          background: #5a67d8;
        }

        .helper-text {
          font-size: 13px;
          color: #718096;
          margin: 0;
        }

        .panel-actions {
          display: flex;
          gap: 12px;
          padding: 16px 24px 24px;
        }

        .button-primary,
        .button-secondary {
          flex: 1;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .button-primary {
          background: #667eea;
          color: white;
        }

        .button-primary:hover:not(:disabled) {
          background: #5a67d8;
        }

        .button-secondary {
          background: #e2e8f0;
          color: #4a5568;
        }

        .button-secondary:hover:not(:disabled) {
          background: #cbd5e0;
        }

        .button-primary:disabled,
        .button-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 600px) {
          .invite-member-panel {
            max-height: 95vh;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
