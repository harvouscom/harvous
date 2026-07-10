import type { CSSProperties, ReactNode } from 'react';

export type PrototypeSectionHeaderVariant = 'inspector' | 'search' | 'list';

type CommonProps = {
  children: ReactNode;
  variant?: PrototypeSectionHeaderVariant;
  className?: string;
  style?: CSSProperties;
};

type Props =
  | (CommonProps & { as?: 'p' | 'h2' | 'h3' | 'span'; htmlFor?: never })
  | (CommonProps & { as: 'label'; htmlFor?: string });

/**
 * Canonical section label — mirrors native `HarvousSectionHeader`.
 * Prefer this over ad-hoc `.proto-inspector-section-title` markup in new UI.
 */
export default function PrototypeSectionHeader({
  children,
  variant = 'inspector',
  as = 'p',
  className,
  htmlFor,
  style,
}: Props) {
  const classes = ['pds-section-header', 'proto-inspector-section-title', className]
    .filter(Boolean)
    .join(' ');

  if (as === 'label') {
    return (
      <label className={classes} data-variant={variant} htmlFor={htmlFor} style={style}>
        {children}
      </label>
    );
  }

  const Tag = as;
  return (
    <Tag className={classes} data-variant={variant} style={style}>
      {children}
    </Tag>
  );
}
