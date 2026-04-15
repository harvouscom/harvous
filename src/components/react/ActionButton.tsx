// @ts-ignore - React 19 types not fully compatible with Astro's type checker
import React from 'react';

interface ActionButtonProps {
  variant?: "Add" | "Close" | "Remove" | "Pin" | "default";
  isPinned?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children?: any;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMouseDown?: (e: any) => void;
  disabled?: boolean;
  'aria-label'?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: any;
}

export default function ActionButton({
  variant = "default",
  isPinned = false,
  children,
  className = "",
  onClick,
  onMouseDown,
  disabled,
  'aria-label': ariaLabelProp,
  style,
}: ActionButtonProps) {
  const getAriaLabel = () => {
    if (ariaLabelProp) return ariaLabelProp;
    if (variant === "Add") return "Add";
    if (variant === "Close") return "Close";
    if (variant === "Remove") return "Remove";
    if (variant === "Pin") return isPinned ? "Unpin" : "Pin to top";
    return undefined;
  };

  return (
    <button
      type="button"
      className={`btn-action ${className}`}
      aria-label={getAriaLabel()}
      onClick={onClick}
      onMouseDown={onMouseDown}
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
        ) : variant === "Pin" ? (
          isPinned ? (
            /* fa-solid thumbtack-slash — tap to unpin */
            <svg viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="currentColor" d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L481.4 352c9.8-.4 18.9-5.3 24.6-13.3c6-8.3 7.7-19.1 4.4-28.8l-1-3c-13.8-41.5-42.8-74.8-79.5-94.7L418.5 64 448 64c17.7 0 32-14.3 32-32s-14.3-32-32-32L192 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l29.5 0-6.1 79.5L38.8 5.1zM324.9 352L177.1 235.6c-20.9 18.9-37.2 43.3-46.5 71.3l-1 3c-3.3 9.8-1.6 20.5 4.4 28.8s15.7 13.3 26 13.3l164.9 0zM288 384l0 96c0 17.7 14.3 32 32 32s32-14.3 32-32l0-96-64 0z"/>
            </svg>
          ) : (
            /* fa-solid thumbtack — tap to pin */
            <svg viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ opacity: 0.9 }}>
              <path fill="currentColor" d="M32 32C32 14.3 46.3 0 64 0L320 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-29.5 0 11.4 148.2c36.7 19.9 65.7 53.2 79.5 94.7l1 3c3.3 9.8 1.6 20.5-4.4 28.8s-15.7 13.3-26 13.3L32 352c-10.3 0-19.9-4.9-26-13.3s-7.7-19.1-4.4-28.8l1-3c13.8-41.5 42.8-74.8 79.5-94.7L93.5 64 64 64C46.3 64 32 49.7 32 32zM160 384l64 0 0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96z"/>
            </svg>
          )
        ) : (
          children
        )}
      </div>
    </button>
  );
}
