import React from 'react';

export interface CondensedThreadItemProps {
  title: string;
  /** Accent bar color, e.g. 'purple' -> var(--color-purple). Defaults to paper. */
  color?: string;
  /** When true, show user-group icon; otherwise single user icon. */
  isPublic?: boolean;
  /** Override icon: 'layer-group' shows the stacked-layers icon (shared space context). */
  icon?: 'layer-group';
  /** Optional right-side action (e.g. remove button). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Condensed thread row matching AddToSpaceSection ThreadItem layout:
 * accent bar, user/group icon, title, optional action on the right.
 */
export default function CondensedThreadItem({
  title,
  color,
  isPublic = false,
  icon,
  action,
  className = ''
}: CondensedThreadItemProps) {
  const threadAccentColor = color ? `var(--color-${color})` : 'var(--color-light-paper)';

  return (
    <div
      className={`block ${className}`.trim()}
      style={{
        position: 'relative',
        borderRadius: '0.75rem',
        height: '48px',
        width: '100%',
        textAlign: 'left',
        backgroundColor: 'white',
        boxShadow: '0px 2px 8px 0px rgba(120, 118, 111, 0.1)'
      }}
    >
      {/* Accent bar on left */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '2.75rem',
          borderTopLeftRadius: '0.75rem',
          borderBottomLeftRadius: '0.75rem',
          overflow: 'hidden',
          backgroundColor: threadAccentColor,
          zIndex: 10
        }}
      />

      {/* White background for content area */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '2.75rem',
          right: 0,
          borderTopRightRadius: '0.75rem',
          borderBottomRightRadius: '0.75rem',
          backgroundColor: 'white'
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          paddingLeft: '0.75rem',
          paddingRight: action != null ? '0.75rem' : '3rem',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 20
        }}
      >
        {/* Layer-group (shared space context), user-group (shared), or single-user (private) icon */}
        <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
          {icon === 'layer-group' ? (
            <svg
              style={{
                display: 'block',
                maxWidth: 'none',
                width: '100%',
                height: '100%',
                color: 'var(--color-deep-grey)',
                opacity: 0.3
              }}
              fill="currentColor"
              viewBox="0 0 576 512"
            >
              <path d="M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2zM476.9 209.6l53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 277.8C37.4 273.8 32 265.3 32 256s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0l152-70.2zm-152 198.2l152-70.2 53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 405.8C37.4 401.8 32 393.3 32 384s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0z"/>
            </svg>
          ) : isPublic ? (
            <svg
              style={{
                display: 'block',
                maxWidth: 'none',
                width: '100%',
                height: '100%',
                color: 'var(--color-deep-grey)',
                opacity: 0.3
              }}
              fill="currentColor"
              viewBox="0 0 640 640"
            >
              <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z" />
            </svg>
          ) : (
            <svg
              style={{
                display: 'block',
                maxWidth: 'none',
                width: '100%',
                height: '100%',
                color: 'var(--color-deep-grey)',
                opacity: 0.3
              }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          )}
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              color: 'var(--color-deep-grey)',
              fontSize: '16px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0
            }}
          >
            {title || 'Untitled thread'}
          </div>
        </div>

        {action != null && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </div>
  );
}
