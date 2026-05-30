/**
 * Wraps prototype menus / portaled popovers with a consistent CSS-only shell.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';

type ProtoPopoverShellProps = ComponentPropsWithoutRef<'div'> & {
  children: ReactNode;
};

const ProtoPopoverShell = forwardRef<HTMLDivElement, ProtoPopoverShellProps>(function ProtoPopoverShell(
  { children, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={className} {...rest}>
      <div className="proto-popover-shell__content">{children}</div>
    </div>
  );
});

export default ProtoPopoverShell;
