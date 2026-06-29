export type AdminSectionNavItem = { id: string; label: string };

/** Pick the section whose heading has scrolled up to the activation line. */
export function pickAdminSectionNavActiveId(
  sections: readonly AdminSectionNavItem[],
  markerPx: number,
  sectionTopById: Readonly<Record<string, number | undefined>>,
  atScrollBottom = false,
): string {
  if (sections.length === 0) return '';

  let current = sections[0]!.id;
  for (const section of sections) {
    const top = sectionTopById[section.id];
    if (top != null && top <= markerPx) current = section.id;
  }

  if (atScrollBottom) {
    return sections[sections.length - 1]!.id;
  }

  return current;
}

/** Viewport Y where the next section should become active (below sticky nav). */
export function computeAdminSectionNavMarkerPx(stickyNavBottomPx: number, viewportHeightPx: number): number {
  const readingLead = Math.min(180, Math.max(100, Math.round(viewportHeightPx * 0.2)));
  return stickyNavBottomPx + readingLead;
}
