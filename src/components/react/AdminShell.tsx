import type { ReactNode } from 'react';
import { SettingsIntro } from '../../../spa/src/pages/prototype/settings/SettingsShell';
import '@/styles/admin-usage.css';

export default function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-page">
      <div className="admin-page__content-wrap">
        <article className="admin-page__paper">
          <header className="admin-page__header">
            <h1 className="pds-title-xl admin-page__title">{title}</h1>
            {subtitle ? <SettingsIntro>{subtitle}</SettingsIntro> : null}
          </header>
          {children}
        </article>
      </div>
    </div>
  );
}
