import type { AnchoredPopoverPlacement } from '@/utils/anchored-popover-position';

type PopoverOriginAlign = 'center' | 'right';

export function protoPortaledPopoverClassName(
  baseClass: string,
  options: {
    exiting?: boolean;
    placement?: AnchoredPopoverPlacement;
    originAlign?: PopoverOriginAlign;
  },
): string {
  const { exiting = false, placement = 'below', originAlign = 'center' } = options;
  const originSuffix = originAlign === 'right' ? 'right' : 'center';
  const originClass =
    placement === 'above'
      ? `proto-portaled-popover--origin-bottom-${originSuffix}`
      : `proto-portaled-popover--origin-top-${originSuffix}`;

  return [
    baseClass,
    'proto-portaled-popover--motion',
    exiting ? 'proto-portaled-popover--exiting' : '',
    originClass,
  ]
    .filter(Boolean)
    .join(' ');
}
