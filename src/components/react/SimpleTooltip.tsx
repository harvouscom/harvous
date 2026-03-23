import React, { useState } from 'react';

interface SimpleTooltipProps {
  children: React.ReactNode;
  content: string;
  enableTooltip?: boolean;
  className?: string;
}

export default function SimpleTooltip({ children, content, enableTooltip = false, className = '' }: SimpleTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  if (enableTooltip) {
    return (
      <div
        className={`tooltip-wrapper ${className}`}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
        {isVisible && (
          <div className="tooltip-popup">
            <div className="tooltip-content">
              {content}
              <div className="tooltip-arrow"></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
}

