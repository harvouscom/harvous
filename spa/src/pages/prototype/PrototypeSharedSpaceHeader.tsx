import type { ReactNode, Ref } from 'react';
import type { IconName } from '@/components/react/Icon';
import PublicJoinSpaceHero, { type PublicJoinSpaceHeroSpace } from '../public/PublicJoinSpaceHero';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';

export default function PrototypeSharedSpaceHeader({
  space,
  title,
  headingRef,
  iconName,
  colorScheme,
  eyebrow,
  people,
  actions
}: {
  space: PublicJoinSpaceHeroSpace | null;
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  iconName?: IconName;
  colorScheme?: 'light' | 'dark';
  eyebrow?: string;
  people?: ReactNode;
  actions?: ReactNode;
}) {
  const Title = headingRef ? 'h1' : 'div';
  return (
    <div className="proto-shared-space-header proto-shared-space-header--cover">
      <div className="proto-shared-space-header__cover">
        <PublicJoinSpaceHero space={space} colorScheme={colorScheme} />
      </div>
      <div className="proto-shared-space-header__row">
        <ProtoSpaceMenuIcon color={space?.color || 'paper'} size={52} radius={12} glyphSize={22} iconName={iconName} colorScheme={colorScheme} />
        <div className="proto-shared-space-header__meta">
          {eyebrow && (
            <p className="proto-caption proto-shared-space-header__church proto-marquee" title={eyebrow}>
              <span>{eyebrow}</span>
            </p>
          )}
          <Title ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="pds-list-title proto-shared-space-header__title proto-marquee" title={title}>
            <span>{title}</span>
          </Title>
          {people}
        </div>
      </div>
      {actions && <div className="proto-shared-space-header__actions">{actions}</div>}
    </div>
  );
}
