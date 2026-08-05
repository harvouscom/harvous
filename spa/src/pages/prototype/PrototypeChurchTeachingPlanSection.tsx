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

/** Same row anatomy as Church tools, with the date where the icon would sit. */
function ServiceRow({
  service,
  disabled,
  onEdit,
  past,
}: {
  service: TeachingPlanService;
  disabled: boolean;
  onEdit: (service: TeachingPlanService) => void;
  past?: boolean;
}) {
  return (
    <button
      type="button"
      className={`proto-church-tools__row${past ? ' proto-church-tools__row--past' : ''}`}
      disabled={disabled}
      onClick={() => onEdit(service)}
    >
      <span className="proto-church-tools__row-date">{formatServiceDate(service.serviceDate)}</span>
      <span className="proto-church-tools__row-text">
        <span className="pds-list-title proto-church-tools__row-title">{service.title}</span>
        <span className="proto-caption proto-church-tools__row-meta">
          {service.reference || 'No passage yet'}
          {service.seriesTitle ? ` · ${service.seriesTitle}` : ''}
        </span>
      </span>
      {disabled ? null : (
        <span className="proto-church-tools__row-chevron" aria-hidden>
          <Icon name="caret-right" size={11} />
        </span>
      )}
    </button>
  );
}

export default function PrototypeChurchTeachingPlanSection({
  orgId,
  canManage,
  canManageChurchTemplates = false,
  onOpenStarters,
  /** False when the church's pilot has lapsed — reads stay, writes don't. */
  canWrite,
}: {
  orgId: string | null;
  canManage: boolean;
  canWrite: boolean;
  /** Server's `manage_templates` verdict — only drives the editor's nudge. */
  canManageChurchTemplates?: boolean;
  /** Hub callback that switches to the Church starters pane. */
  onOpenStarters?: () => void;
}) {
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
      {/* A pane, not a disclosure — the hub's Church tools row is what opens
          it, so the caret toggle that used to live here is gone. */}
      <div className="proto-church-tools__lane-head">
        <p className="proto-caption proto-home-section__eyebrow">
          {data.services.length > 0 ? `${data.services.length} planned` : 'Nothing planned yet'}
        </p>
        {canWrite ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            disabled={actions.isPending}
            onClick={() => openEditor(null)}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">Add service</span>
          </button>
        ) : null}
      </div>

      {data.services.length === 0 ? (
        <p className="proto-caption proto-teaching-plan__empty">
          Plan a service and everyone connected to your church sees it on their Home.
        </p>
      ) : (
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {upcoming.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              disabled={!canWrite}
              onEdit={openEditor}
            />
          ))}

          {past.length > 0 ? (
            <>
              {upcoming.length > 0 ? (
                <p className="proto-caption proto-teaching-plan__divider">Past</p>
              ) : null}
              {past.slice(0, 6).map((service) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  disabled={!canWrite}
                  onEdit={openEditor}
                  past
                />
              ))}
            </>
          ) : null}

          {!canWrite ? (
            <div className="proto-church-tools__row proto-church-tools__row--status">
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="circle-exclamation" size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">Plan ended</span>
                <span className="proto-caption proto-church-tools__row-meta">
                  Planned services stay visible
                </span>
              </span>
            </div>
          ) : null}
        </div>
      )}

      <PrototypeServiceEditorSheet
        open={sheetOpen}
        orgId={orgId}
        service={editing}
        seriesTitles={data.seriesTitles}
        channels={data.channels ?? []}
        canManageChurchTemplates={canManageChurchTemplates}
        onOpenStarters={onOpenStarters}
        onOpenChange={(next) => {
          setSheetOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}
