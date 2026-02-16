import type { ReactNode } from 'react';
import { getThreadTextColorCSS } from '../../../src/utils/colors';

interface CardStackProps {
  title?: string;
  subtitle?: string;
  headerBgColor?: string;
  centerTitle?: boolean;
  id?: string;
  threadId?: string;
  className?: string;
  /**
   * Optional fully-custom header node — rendered directly instead of the
   * default .card-stack__header wrapper.  Use this when passing a
   * ThreadCardStackHeader / ProfileCardStackHeader that already contains its
   * own header styling.
   */
  header?: ReactNode;
  children?: ReactNode;
}

export default function CardStack({
  title = 'Welcome to Harvous',
  subtitle,
  headerBgColor = 'var(--color-paper)',
  centerTitle = false,
  id,
  threadId,
  className = '',
  header,
  children,
}: CardStackProps) {
  const textColor = getThreadTextColorCSS(
    headerBgColor.match(/--color-([a-z-]+)/)?.[1] ?? null
  );

  return (
    <div className={`card-stack ${className}`} {...(id ? { id } : {})}>
      <div className="card-stack__container">

        {/* Either a fully-custom header, or the default title header */}
        {header ?? (
          <div
            className="card-stack__header"
            style={{ backgroundColor: headerBgColor, color: textColor }}
            {...(threadId ? { 'data-thread-id': threadId } : {})}
          >
            {subtitle ? (
              <>
                <div className={`page-heading ${centerTitle ? 'page-heading--center' : ''}`}>
                  <p>{title}</p>
                </div>
                <div className="card-stack__subtitle">
                  <p>{subtitle}</p>
                </div>
              </>
            ) : (
              <div className={`page-heading ${centerTitle ? 'page-heading--center' : ''}`}>
                <p>{title}</p>
              </div>
            )}
          </div>
        )}

        <div className="card-stack__content">
          <div className="card-stack__inner">
            <div className="card-stack__inner-content">
              {children}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
