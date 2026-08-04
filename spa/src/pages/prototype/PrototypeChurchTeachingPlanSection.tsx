/**
 * Teaching plan in the My Church hub — the staff half of "This Sunday".
 *
 * Role-gated on `sermon_tools`, the first feature behind that capability. A
 * plain staff member publishes into channels; planning what the church teaches
 * is a pastor/teacher/admin act.
 *
 * Collapsed by default, matching PrototypeChurchStaffSection — planning is
 * periodic work, not the daily job. Upcoming first, because that is what a
 * pastor is looking for when they open it mid-week; past stays reachable so
 * last Sunday can be backfilled.
 *
 * `docs/future/MY_CHURCH_SIDEBAR.md` allows this as "a staff door into creating
 * those places". The congregant equivalent deliberately does not exist.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  useChurchServiceActions,
  useChurchTeachingPlan,
  type TeachingPlanService,
} from '../../hooks/queries/useChurchTeachingPlan';
import { localTodayIso } from '../../lib/church-services';
import PrototypeServiceEditorSheet from './PrototypeServiceEditorSheet';

function formatServiceDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ServiceRow({
  service,
  disabled,
  onEdit,
}: {
  service: TeachingPlanService;
  disabled: boolean;
  onEdit: (service: TeachingPlanService) => void;
}) {
  return (
    <li className="proto-teaching-plan__row">
      <button
        type="button"
        className="proto-teaching-plan__row-button"
        disabled={disabled}
        onClick={() => onEdit(service)}
      >
        <span className="proto-teaching-plan__date">{formatServiceDate(service.serviceDate)}</span>
        <span className="proto-teaching-plan__row-text">
          <span className="pds-list-title proto-teaching-plan__title">{service.title}</span>
          <span className="proto-caption proto-teaching-plan__meta">
            {service.reference || 'No passage yet'}
            {service.seriesTitle ? ` · ${service.seriesTitle}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function PrototypeChurchTeachingPlanSection({
  orgId,
  canManage,
  /** False when the church's pilot has lapsed — reads stay, writes don't. */
  canWrite,
}: {
  orgId: string | null;
  canManage: boolean;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeachingPlanService | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data } = useChurchTeachingPlan(orgId, { enabled: canManage });
  const actions = useChurchServiceActions(orgId);

  const today = localTodayIso();
  const { upcoming, past } = useMemo(() => {
    const services = data?.services ?? [];
    return {
      upcoming: services.filter((s) => s.serviceDate >= today),
      // Most recent first — backfilling last Sunday is the common case.
      past: [...services.filter((s) => s.serviceDate < today)].reverse(),
    };
  }, [data, today]);

  if (!data) return null;

  const openEditor = (service: TeachingPlanService | null) => {
    setEditing(service);
    setSheetOpen(true);
  };

  return (
    <div className="proto-home-section">
      <button
        type="button"
        className="proto-church-hub__lane-action proto-church-staff__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'caret-down' : 'caret-right'} size={10} aria-hidden />
        Teaching plan
        {data.services.length > 0 ? ` · ${data.services.length}` : ''}
      </button>

      {open ? (
        <div className="proto-teaching-plan">
          {data.services.length === 0 ? (
            <p className="proto-caption proto-teaching-plan__empty">
              Plan a service and everyone connected to your church sees it on their Home, with
              your passage and your template one tap away.
            </p>
          ) : (
            <>
              {upcoming.length > 0 ? (
                <ul className="proto-teaching-plan__list">
                  {upcoming.map((service) => (
                    <ServiceRow
                      key={service.id}
                      service={service}
                      disabled={!canWrite}
                      onEdit={openEditor}
                    />
                  ))}
                </ul>
              ) : (
                <p className="proto-caption proto-teaching-plan__empty">
                  Nothing planned yet. Your congregation sees last Sunday for a few more days.
                </p>
              )}

              {past.length > 0 ? (
                <>
                  <p className="proto-caption proto-teaching-plan__divider">Past</p>
                  <ul className="proto-teaching-plan__list proto-teaching-plan__list--past">
                    {past.slice(0, 6).map((service) => (
                      <ServiceRow
                        key={service.id}
                        service={service}
                        disabled={!canWrite}
                        onEdit={openEditor}
                      />
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}

          {canWrite ? (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              disabled={actions.isPending}
              onClick={() => openEditor(null)}
            >
              Add a service
            </button>
          ) : (
            <p className="proto-caption proto-teaching-plan__empty">
              Your church plan has lapsed. Everything already planned stays visible to your
              congregation; subscribe to add more.
            </p>
          )}
        </div>
      ) : null}

      <PrototypeServiceEditorSheet
        open={sheetOpen}
        orgId={orgId}
        service={editing}
        seriesTitles={data.seriesTitles}
        onOpenChange={(next) => {
          setSheetOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}
