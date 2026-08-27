/**
 * A group on Home: a quiet heading over one glass panel of hairline-separated rows.
 *
 * The church hub's Tools shape, shared. It used to live inside `PrototypeSidebarHomeView`
 * while the shared-space view hand-rolled the same three lines beside it — which is how the
 * two drifted apart in the first place, one on rows and one still on cards.
 *
 * The `proto-home-section__list` class stays on the panel because the empty-group rule keys
 * off it: a section whose children all render null should collapse rather than leave a
 * heading over an empty box.
 */
import type { ReactNode } from 'react';

export default function PrototypeHomeSection({
  title,
  children,
  spotlight,
}: {
  title: string;
  children: ReactNode;
  /** Name this section as a spotlight target, so a checklist row can point at it. */
  spotlight?: string;
}) {
  return (
    <section
      className="proto-home-section proto-home-section--group"
      data-proto-spotlight={spotlight}
    >
      <p className="proto-caption proto-home-section__eyebrow">{title}</p>
      <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-home-section__list">
        {children}
      </div>
    </section>
  );
}
