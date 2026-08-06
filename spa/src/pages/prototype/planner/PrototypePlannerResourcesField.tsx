/**
 * "What am I pulling from this week" — the church library, attached to one
 * planned entry.
 *
 * Lives below the sermon's own fields rather than beside them, because it is a
 * different act: the fields above describe what you are teaching, and this is
 * the pile of things on the desk while you write it.
 *
 * Saves on every change rather than waiting for the form's Save. The entry
 * already exists — attaching is not part of drafting it — and a picker whose
 * result vanishes because you closed the pane without pressing Save is the
 * exact frustration that makes people stop using a feature.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { resourceSourceLabel } from '@/utils/resource-source-label';
import type { AttachedResource } from '../../../hooks/queries/useChurchTeachingPlan';
import {
  useChurchLibraryManage,
  type ChurchLibraryStaffItem,
} from '../../../hooks/queries/useChurchLibrary';

export default function PrototypePlannerResourcesField({
  orgId,
  attached,
  canWrite,
  pending,
  onChange,
}: {
  orgId: string | null;
  attached: AttachedResource[];
  canWrite: boolean;
  pending: boolean;
  /** The whole next set — the endpoint is replace-set. */
  onChange: (itemIds: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  /* Gated on `sermon_tools`, so a teacher or granted leader can attach without
     being the person who curates the catalog. */
  const library = useChurchLibraryManage(orgId, { enabled: picking && canWrite });
  const attachedIds = useMemo(() => attached.map((r) => r.itemId), [attached]);

  const candidates = useMemo(() => {
    const items = library.data?.items ?? [];
    const q = query.trim().toLowerCase();
    const unattached = items.filter((i) => !attachedIds.includes(i.id));
    if (!q) return unattached;
    return unattached.filter((i) =>
      [i.title, i.sourceDomain, i.description]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [library.data, attachedIds, query]);

  const add = (item: ChurchLibraryStaffItem) => {
    onChange([...attachedIds, item.id]);
    setQuery('');
    setPicking(false);
  };

  const remove = (itemId: string) => {
    onChange(attachedIds.filter((id) => id !== itemId));
  };

  return (
    <>
      <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
        <span>Resources</span>
        <span className="proto-service-editor__optional">
          {attached.length > 0 ? `${attached.length} attached` : 'optional'}
        </span>
      </label>

      {attached.length > 0 ? (
        <ul className="proto-planner-resources">
          {attached.map((resource) => (
            <li key={resource.itemId} className="proto-planner-resources__row">
              <Icon name="newspaper" size={11} aria-hidden />
              <span className="proto-planner-resources__text proto-marquee" title={resource.title}>
                <span>{resource.title}</span>
              </span>
              <span className="proto-caption proto-planner-resources__source">
                {resourceSourceLabel(resource.sourceDomain, null) || resource.fileName || ''}
              </span>
              {canWrite ? (
                <button
                  type="button"
                  className="proto-side-panel__action-btn"
                  aria-label={`Remove ${resource.title}`}
                  title="Remove"
                  disabled={pending}
                  onClick={() => remove(resource.itemId)}
                >
                  <Icon name="xmark" size={11} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canWrite && !picking ? (
        <button
          type="button"
          className="proto-glass-surface proto-glass-surface--control proto-glass-action proto-service-editor__starter-action"
          disabled={pending}
          onClick={() => setPicking(true)}
        >
          <Icon name="paperclip" size={12} aria-hidden />
          <span className="proto-glass-action__label">
            {attached.length > 0 ? 'Attach another' : 'Attach from the library'}
          </span>
        </button>
      ) : null}

      {canWrite && picking ? (
        <div className="proto-planner-resources__picker">
          <input
            type="text"
            className="proto-create-folder-sheet__name-input"
            value={query}
            placeholder="Search the library"
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                /* Close the picker, not the pane — the pane's own Escape
                   listener stands down on `defaultPrevented`. */
                e.preventDefault();
                e.stopPropagation();
                setPicking(false);
              }
            }}
          />
          {library.isLoading ? (
            <p className="proto-caption proto-planner-resources__empty">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="proto-caption proto-planner-resources__empty">
              {query.trim()
                ? 'Nothing matches.'
                : 'Everything in the library is already attached.'}
            </p>
          ) : (
            <ul className="proto-planner-resources__options">
              {candidates.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="proto-service-editor__series-option"
                    onClick={() => add(item)}
                  >
                    <span className="proto-service-editor__series-option-name">{item.title}</span>
                    <span className="proto-caption proto-service-editor__series-option-count">
                      {resourceSourceLabel(item.sourceDomain, null)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
