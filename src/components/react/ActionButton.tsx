// @ts-ignore - React 19 types not fully compatible with Astro's type checker
import React from 'react';

interface ActionButtonProps {
  variant?: "Add" | "Close" | "Remove" | "default";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children?: any;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (e: any) => void;
  disabled?: boolean;
  'aria-label'?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: any;
}

export default function ActionButton({
  variant = "default",
  children,
  className = "",
  onClick,
  disabled,
  'aria-label': ariaLabelProp,
  style,
}: ActionButtonProps) {
  const getAriaLabel = () => {
    if (variant === "Add") return "Add";
    if (variant === "Close") return "Close";
    if (variant === "Remove") return "Remove";
    return ariaLabelProp || undefined;
  };

  return (
    <button
      type="button"
      className={`btn-action ${className}`}
      aria-label={getAriaLabel()}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      <div className="btn-action__icon">
        {variant === "Add" ? (
          <svg viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg">
            <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/>
          </svg>
        ) : variant === "Close" ? (
          <svg viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
        ) : variant === "Remove" ? (
          <svg viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg">
            <path d="M432 256c0 17.7-14.3 32-32 32H48c-17.7 0-32-14.3-32-32s14.3-32 32-32H400c17.7 0 32 14.3 32 32z"/>
          </svg>
        ) : (
          children
        )}
      </div>
    </button>
  );
}
