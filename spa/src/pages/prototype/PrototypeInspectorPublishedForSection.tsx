/**
 * "Published for" — the attach control at publish time, inside a ministry channel.
 *
 * The staff half of the inversion in `CHURCH_STUDY_MATERIAL_LINKING.md`: the
 * youth pastor says what their discussion guide is *for*, and the congregation's
 * "This Sunday" renders it. The service never points back at a room.
 *
 * **Two grains, one list.** A guide claims a week; an eight-week study claims
 * the run. Series come first because claiming one is usually the right answer
 * and doing it eight times is the mistake the removed pointer made routine.
 *
 * **Only appears where it means something.** The host passes `enabled` for a
 * note that lives in a ministry channel this viewer may author in — the same
 * fact the server gates on. A note in someone's personal space has no channel
 * to publish from and no question to answer here.
 *
 * Replace-set, like the resource picker it sits near: the component holds the
 * whole answer and sends it, rather than diffing.
 */
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import {
  useChurchPublishedMaterialClaims,
  useChurchPublishedMaterialTargets,
  useSetChurchPublishedMaterial,
} from '../../hooks/queries/useChurchPublishedMaterial';
import { PrototypeSectionHeader } from './design-system';
import { formatServiceDate } from './PrototypeSermonEditorFields';

export type PrototypeInspectorPublishedForSectionProps = {
  noteId: string;
  /**
   * Whether this note is published in a ministry channel this viewer may author
   * in. Host-resolved from the same facts the server checks; false renders
   * nothing rather than a section that would 404 on open.
   */
  enabled: boolean;
};

/** A series and its run label read as one name — "Advent · 2027" — only when it disambiguates. */
function seriesLabel(title: string, runLabel: string | null): string {
  return runLabel ? `${title} · ${runLabel}` : title;
}

export default function PrototypeInspectorPublishedForSection({
  noteId,
  enabled,
}: PrototypeInspectorPublishedForSectionProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ serviceIds: string[]; seriesIds: string[] } | null>(null);

  const claims = useChurchPublishedMaterialClaims(noteId, { enabled });
  const targets = useChurchPublishedMaterialTargets(noteId, { enabled: enabled && open });
  const save = useSetChurchPublishedMaterial(noteId);

  /* The draft starts from what the server says is true, and re-seeds if the
     picker is opened again after a save — otherwise a second edit would begin
     from the first edit's starting point. */
  useEffect(() => {
    if (!open) return;
    if (draft) return;
    if (!claims.data) return;
    setDraft({ serviceIds: [...claims.data.serviceIds], seriesIds: [...claims.data.seriesIds] });
  }, [claims.data, draft, open]);

  const chosenSummary = useMemo(() => {
    const count = (claims.data?.serviceIds.length ?? 0) + (claims.data?.seriesIds.length ?? 0);
    if (count === 0) return null;
    return count === 1 ? '1 attachment' : `${count} attachments`;
  }, [claims.data]);

  if (!enabled) return null;

  const toggle = (kind: 'service' | 'series', id: string) => {
    setDraft((current) => {
      const base = current ?? { serviceIds: [], seriesIds: [] };
      const key = kind === 'service' ? 'serviceIds' : 'seriesIds';
      const list = base[key];
      return {
        ...base,
        [key]: list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id],
      };
    });
  };

  const commit = () => {
    if (!draft || save.isPending) return;
    setError(null);
    save.mutate(draft, {
      onSuccess: () => {
        setOpen(false);
        setDraft(null);
      },
      onError: (err: unknown) => {
        /* The server's own words. "This note is a step of a published study
           plan" is a real answer; "Could not save" is not. */
        setError(
          err instanceof APIError || err instanceof Error
            ? err.message
            : 'Could not save what this is for',
        );
      },
    });
  };

  return (
    <section className="proto-inspector-section">
      <PrototypeSectionHeader variant="inspector">Published for</PrototypeSectionHeader>

      {!open ? (
        <>
          <p className="proto-caption proto-inspector-muted">
            {chosenSummary
              ? `Shown under ${chosenSummary === '1 attachment' ? 'the service it accompanies' : 'the services it accompanies'}.`
              : 'Not attached to a service yet.'}
          </p>
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            <Icon name="church" size={12} aria-hidden />
            <span className="proto-glass-action__label">
              {chosenSummary ? 'Change what this is for' : 'Say what this is for'}
            </span>
          </button>
        </>
      ) : (
        <>
          {targets.isLoading ? (
            <p className="proto-caption proto-inspector-muted">Loading the plan…</p>
          ) : null}

          {targets.data && targets.data.series.length === 0 && targets.data.services.length === 0 ? (
            /* Nothing to attach to. Says why rather than showing an empty list —
               the answer is in the planner, not here. */
            <p className="proto-caption proto-inspector-muted">
              This church has no upcoming services or series yet.
            </p>
          ) : null}

          {targets.data && targets.data.series.length > 0 ? (
            <div className="proto-published-for__group">
              <p className="proto-caption proto-published-for__group-label">Series</p>
              {targets.data.series.map((series) => {
                const checked = draft?.seriesIds.includes(series.id) ?? false;
                return (
                  <label key={series.id} className="proto-published-for__option">
                    {/*
                      The input stays real — it carries the checked state, the
                      keyboard, and the label association — and is visually
                      replaced by the orb the rest of the app selects with. Same
                      construction as the sermon editor's service slots.
                    */}
                    <input
                      type="checkbox"
                      className="proto-service-editor__slot-input"
                      checked={checked}
                      onChange={() => toggle('series', series.id)}
                    />
                    <span className="proto-service-editor__slot-orb" aria-hidden>
                      {checked ? (
                        <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                          <Icon name="check" size={9} />
                        </span>
                      ) : (
                        <span className="proto-select-orb-idle" />
                      )}
                    </span>
                    <span className="proto-published-for__option-label">
                      {seriesLabel(series.title, series.runLabel)}
                    </span>
                    {/* Why claiming the run is usually the right answer. */}
                    <span className="proto-caption proto-published-for__option-hint">
                      {series.serviceCount === 1 ? '1 week' : `${series.serviceCount} weeks`}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {targets.data && targets.data.services.length > 0 ? (
            <div className="proto-published-for__group">
              <p className="proto-caption proto-published-for__group-label">Services</p>
              {targets.data.services.map((service) => {
                const checked = draft?.serviceIds.includes(service.id) ?? false;
                return (
                  <label key={service.id} className="proto-published-for__option">
                    <input
                      type="checkbox"
                      className="proto-service-editor__slot-input"
                      checked={checked}
                      onChange={() => toggle('service', service.id)}
                    />
                    <span className="proto-service-editor__slot-orb" aria-hidden>
                      {checked ? (
                        <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                          <Icon name="check" size={9} />
                        </span>
                      ) : (
                        <span className="proto-select-orb-idle" />
                      )}
                    </span>
                    <span className="proto-published-for__option-label">{service.title}</span>
                    <span className="proto-caption proto-published-for__option-hint">
                      {service.serviceDate ? formatServiceDate(service.serviceDate) : 'Undated'}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}

          <div className="proto-sheet-footer__row">
            <button
              type="button"
              className="proto-share-popover__primary"
              disabled={save.isPending || !draft}
              onClick={commit}
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="proto-sheet-quiet-action"
              disabled={save.isPending}
              onClick={() => {
                setError(null);
                setOpen(false);
                setDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {error ? (
        <p className="proto-caption proto-inspector-muted" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
