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
        className={`relative ${className}`}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
        {isVisible && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
            <div className="bg-[var(--color-deep-grey)] text-[var(--color-fog-white)] text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
              {content}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                <div className="border-4 border-transparent border-t-[var(--color-deep-grey)]"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
}

