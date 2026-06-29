import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AdminWindowRangePills } from '@/components/react/AdminRankBarList';
import {
  computeAdminSectionNavMarkerPx,
  pickAdminSectionNavActiveId,
  type AdminSectionNavItem,
} from '@/utils/admin-section-nav-active';

export type AdminBoardSection = AdminSectionNavItem;

export function resolveAdminScrollRoot(): HTMLElement | Window {
  const adminInner = document.querySelector('.proto-shell--admin .proto-shell__main-inner');
  if (adminInner instanceof HTMLElement) return adminInner;
  const paper = document.querySelector('.admin-page__paper');
  if (paper instanceof HTMLElement && paper.scrollHeight > paper.clientHeight) return paper;
  return window;
}

export function resolveAdminSectionNavMarkerPx(): number {
  const navWrap = document.querySelector('.admin-usage__section-nav-wrap');
  const stickyBottom =
    navWrap instanceof HTMLElement ? navWrap.getBoundingClientRect().bottom : 72;
  return computeAdminSectionNavMarkerPx(stickyBottom, window.innerHeight);
}

function isAdminScrollAtBottom(root: HTMLElement | Window): boolean {
  const threshold = 4;
  if (root instanceof Window) {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - threshold;
  }
  return root.scrollTop + root.clientHeight >= root.scrollHeight - threshold;
}

function readScrollTop(root: HTMLElement | Window): number {
  return root instanceof Window ? root.scrollY : root.scrollTop;
}

function writeScrollTop(root: HTMLElement | Window, top: number): void {
  if (root instanceof Window) {
    window.scrollTo({ top, left: 0, behavior: 'instant' });
    return;
  }
  root.scrollTop = top;
}

/** Wrap time-window changes so the admin board keeps its scroll position. */
export function useAdminWindowDaysChange(
  setWindowDays: React.Dispatch<React.SetStateAction<number>>,
  {
    windowDays,
    isUpdating,
    dataRevision,
  }: {
    windowDays: number;
    isUpdating: boolean;
    dataRevision: number;
  },
) {
  const savedScrollRef = useRef<number | null>(null);

  const changeWindowDays = useCallback(
    (days: number) => {
      setWindowDays((current) => {
        if (current === days) return current;
        savedScrollRef.current = readScrollTop(resolveAdminScrollRoot());
        return days;
      });
    },
    [setWindowDays],
  );

  useLayoutEffect(() => {
    if (savedScrollRef.current == null) return;
    writeScrollTop(resolveAdminScrollRoot(), savedScrollRef.current);
    if (!isUpdating) savedScrollRef.current = null;
  }, [windowDays, isUpdating, dataRevision]);

  return changeWindowDays;
}

export function useAdminSectionNavActive(sections: readonly AdminBoardSection[]): string {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const updateActive = () => {
      const scrollRoot = resolveAdminScrollRoot();
      const marker = resolveAdminSectionNavMarkerPx();
      const tops: Record<string, number> = {};
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) tops[section.id] = el.getBoundingClientRect().top;
      }
      setActiveId(
        pickAdminSectionNavActiveId(sections, marker, tops, isAdminScrollAtBottom(scrollRoot)),
      );
    };

    const scrollRoot = resolveAdminScrollRoot();
    scrollRoot.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive, { passive: true });
    updateActive();

    return () => {
      scrollRoot.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, [sections]);

  return activeId;
}

export function AdminStickySectionNav({
  sections,
  navAriaLabel,
  windowDays,
  onWindowDaysChange,
}: {
  sections: readonly AdminBoardSection[];
  navAriaLabel: string;
  windowDays: number;
  onWindowDaysChange: (days: number) => void;
}) {
  const activeId = useAdminSectionNavActive(sections);

  return (
    <div className="admin-usage__section-nav-wrap">
      <div className="admin-usage__section-nav-bar">
        <nav className="admin-usage__section-nav" aria-label={navAriaLabel}>
          <div className="admin-usage__section-nav-scroll">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`admin-usage__section-nav-pill${activeId === section.id ? ' admin-usage__section-nav-pill--active' : ''}`}
                aria-current={activeId === section.id ? 'location' : undefined}
              >
                {section.label}
              </a>
            ))}
          </div>
        </nav>
        <div className="admin-usage__section-nav-window" aria-label="Time window">
          <AdminWindowRangePills value={windowDays} onChange={onWindowDaysChange} />
        </div>
      </div>
    </div>
  );
}
