/**
 * Church settings — the time zone, and when the church actually gathers.
 *
 * The first surface anywhere that writes the church's own `Churches` row;
 * everything else about a church is set by a Harvous admin. Gated on
 * `manage_church_settings` (admin only), decided by the server and never
 * re-derived from a role string here.
 *
 * Service times are a list rather than one default because churches hold more
 * than one: 9:00 and 10:45 on a Sunday morning hear the same sermon, and the
 * evening service hears a different one. A sermon then picks which of these it
 * fills — see PrototypeSermonEditorFields.
 *
 * Display and defaults only. Nothing here schedules, reminds, or notifies —
 * see docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
 */
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import ProtoTimePicker from './ProtoTimePicker';
import { detectedTimeZone, listTimeZoneGroups } from '../../lib/time-zone-options';
import { DEFAULT_SERVICE_TIME } from '../../lib/proto-time-picker';
import { toast } from '@/utils/toast';
import { isPresentableServerMessage } from '../../lib/error-copy';
import { APIError } from '../../lib/api';
import {
  useChurchSettings,
  useChurchSettingsActions,
} from '../../hooks/queries/useChurchSettings';
import {
  WEEKDAYS,
  formatServiceTime,
  weekdayLabel,
  weekdayShortLabel,
} from '../../lib/church-services';

export interface PrototypeChurchSettingsSectionProps {
  orgId: string | null;
  /** Server's `manage_church_settings` verdict — never re-derived from a role. */
  canManage: boolean;
  /** False when the church's plan has lapsed: writes stop, reading never does. */
  canWrite: boolean;
}

export default function PrototypeChurchSettingsSection({
  orgId,
  canManage,
  canWrite,
}: PrototypeChurchSettingsSectionProps) {
  const { data, isPending } = useChurchSettings(orgId, { enabled: canManage });
  const actions = useChurchSettingsActions(orgId);

  const [timezone, setTimezone] = useState('');
  const [newDay, setNewDay] = useState('0');
  const [newTime, setNewTime] = useState(DEFAULT_SERVICE_TIME);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (!data) return;
    setTimezone(data.settings.timezone ?? detectedTimeZone());
  }, [data]);

  /*
    Every IANA zone, grouped by region — Harvous has churches anywhere, and the
    server accepts any of them. The saved and detected zones are folded in so a
    stored value can never become unpickable on an engine with a shorter list.
  */
  const timezoneGroups = useMemo(
    () =>
      listTimeZoneGroups({
        extra: [timezone, data?.settings.timezone, detectedTimeZone()],
        country: data?.settings.country ?? null,
        region: data?.settings.state ?? null,
      }),
    [timezone, data?.settings.timezone, data?.settings.country, data?.settings.state],
  );

  if (!canManage) return null;
  // `canManage` is already proven above, so the query is enabled and `isPending`
  // is a real in-flight state rather than React Query's disabled-forever one.
  if (!data) return isPending ? <ProtoSpaceLoading label="Loading church settings" /> : null;

  const savedTimezone = data.settings.timezone ?? detectedTimeZone();
  const timezoneDirty = timezone !== savedTimezone;
  const busy = actions.isPending;

  const fail = (err: unknown, fallback: string) =>
    toast.error(err instanceof APIError && isPresentableServerMessage(err) ? err.message : fallback);

  const saveTimezone = () => {
    actions.mutate(
      { kind: 'timezone', timezone: timezone || null },
      { onSuccess: () => toast.success('Saved'), onError: (e) => fail(e, 'Could not save the time zone') },
    );
  };

  const addServiceTime = () => {
    if (!newTime) return;
    actions.mutate(
      {
        kind: 'addServiceTime',
        dayOfWeek: Number(newDay),
        startTime: newTime,
        label: newLabel.trim() || null,
      },
      {
        onSuccess: () => {
          setNewTime(DEFAULT_SERVICE_TIME);
          setNewLabel('');
          toast.success('Service added');
        },
        onError: (e) => fail(e, 'Could not add that service'),
      },
    );
  };

  return (
    <div className="proto-home-section">
      <div className="proto-shared-space-settings">
        <div className="proto-shared-space-settings__field">
          <label htmlFor="proto-church-settings-timezone">Time zone</label>
          <select
            id="proto-church-settings-timezone"
            value={timezone}
            disabled={!canWrite || busy}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option value="">Not set</option>
            {timezoneGroups.map((group) => (
              <optgroup key={group.region} label={group.region}>
                {group.zones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {timezoneDirty && canWrite ? (
            <button
              type="button"
              className="proto-settings-btn"
              disabled={busy}
              onClick={saveTimezone}
              style={{ marginTop: 8 }}
            >
              {busy ? 'Saving…' : 'Save time zone'}
            </button>
          ) : null}
        </div>
      </div>

      <p className="proto-church-settings__section-label">Service times</p>

      {data.serviceTimes.length === 0 ? (
        <p className="proto-caption proto-church-settings__hint">
          Add the times your church meets. A sermon then says which of them it&rsquo;s preached at.
        </p>
      ) : (
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {data.serviceTimes.map((slot) => (
            <div key={slot.id} className="proto-church-tools__row proto-church-tools__row--status">
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="clock" size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">
                  {weekdayShortLabel(slot.dayOfWeek)} · {formatServiceTime(slot.startTime)}
                </span>
                {slot.label ? (
                  <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">{slot.label}</span>
                ) : null}
              </span>
              {canWrite ? (
                <button
                  type="button"
                  /* The sheet-close control, reused: already 28x28 and quiet,
                     so a destructive row action needs no class of its own. */
                  className="proto-side-panel__action-btn proto-side-panel__action-btn--danger"
                  disabled={busy}
                  title="Remove"
                  aria-label={`Remove ${weekdayLabel(slot.dayOfWeek)} ${slot.startTime}`}
                  onClick={() =>
                    actions.mutate(
                      { kind: 'removeServiceTime', serviceTimeId: slot.id },
                      {
                        // Sermons pointed at it keep existing; they just stop
                        // claiming this slot.
                        onSuccess: () => toast.success('Service removed'),
                        onError: (e) => fail(e, 'Could not remove that service'),
                      },
                    )
                  }
                >
                  <Icon name="trash-can" size={12} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canWrite ? (
        <div className="proto-shared-space-settings" style={{ marginTop: 12 }}>
          <div className="proto-shared-space-settings__field">
            <label htmlFor="proto-church-settings-new-day">Add a service</label>
            <select
              id="proto-church-settings-new-day"
              value={newDay}
              disabled={busy}
              onChange={(e) => setNewDay(e.target.value)}
            >
              {WEEKDAYS.map((label, index) => (
                <option key={label} value={String(index)}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="proto-shared-space-settings__field">
            <label htmlFor="proto-church-settings-new-time">Time</label>
            <ProtoTimePicker
              id="proto-church-settings-new-time"
              value={newTime}
              disabled={busy}
              onChange={setNewTime}
              aria-label="Service time"
            />
          </div>
          <div className="proto-shared-space-settings__field">
            <label htmlFor="proto-church-settings-new-label">Name (optional)</label>
            <input
              id="proto-church-settings-new-label"
              type="text"
              value={newLabel}
              maxLength={40}
              placeholder="First service"
              disabled={busy}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="proto-settings-btn"
            disabled={!newTime || busy}
            onClick={addServiceTime}
          >
            {busy ? 'Saving…' : 'Add service time'}
          </button>
        </div>
      ) : (
        <p className="proto-caption proto-church-settings__hint">
          Your church&rsquo;s plan has ended, so these can&rsquo;t change.
        </p>
      )}
    </div>
  );
}
