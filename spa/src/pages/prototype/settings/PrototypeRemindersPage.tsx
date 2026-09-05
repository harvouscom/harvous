/**
 * Settings → Reminders.
 *
 * The page has two halves and they answer different questions. The top one is about *this
 * device* — can it show notifications at all, and has it been allowed to — which is a
 * per-browser fact and the only place the permission prompt may be raised. The bottom is the
 * schedule, which belongs to the account and applies to every device at once.
 *
 * Keeping them visually separate is what stops "turn off on this device" from reading as
 * "turn off reminders", which it is not.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { getInstallPlatform } from '@/utils/platform-detect';
import {
  DEFAULT_REMINDER_SETTINGS,
  MIDWEEK_DAYS,
  REMINDER_HOUR_MAX,
  REMINDER_HOUR_MIN,
  formatReminderHour,
  midweekDayLabel,
  parseReminderSettings,
  type MidweekDay,
  type ReminderSettings,
} from '@/utils/reminder-settings';
import { api } from '../../../lib/api';
import {
  disablePushRemindersOnThisDevice,
  enablePushReminders,
  fetchPushStatus,
  getPushSupport,
  sendTestReminder,
  type PushStatus,
  type PushSupport,
} from '../../../lib/push-reminders';
import { profileQueryKey, useProfile } from '../../../hooks/queries/useProfile';
import PrototypeInstallWebAppSheet from '../PrototypeInstallWebAppSheet';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

/** Debounce on the schedule writes: a run of taps on the hour select is one edit, not six. */
const SAVE_DEBOUNCE_MS = 500;

function hourOptions(): number[] {
  const hours: number[] = [];
  for (let h = REMINDER_HOUR_MIN; h <= REMINDER_HOUR_MAX; h += 1) hours.push(h);
  return hours;
}

/** A short, human name for the stored zone: "America/Chicago" → "Chicago". */
function zoneLabel(timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  const tail = timezone.split('/').pop();
  return tail ? tail.replace(/_/g, ' ') : timezone;
}

function ToggleRow({
  label,
  sublabel,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`proto-note-row proto-note-row--static${disabled ? ' proto-note-row--disabled' : ''}`}>
      <span className="proto-settings-list-row__main">
        <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>{label}</span>
        {sublabel ? (
          <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>{sublabel}</span>
        ) : null}
      </span>
      <span className="proto-settings-list-row__trailing">
        <span
          className="proto-fte-switch"
          // An "on" switch at full strength directly under "Notifications are blocked" reads
          // as a contradiction. Dimming says the setting is real but not currently in effect.
          style={disabled ? { opacity: 0.4 } : undefined}
          data-on={checked ? 'true' : 'false'}
          role="switch"
          aria-checked={checked}
          aria-disabled={disabled}
          aria-label={label}
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && onChange(!checked)}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              onChange(!checked);
            }
          }}
        >
          <span className="proto-fte-switch__thumb" />
        </span>
      </span>
    </div>
  );
}

function DaySegmented({
  value,
  disabled,
  onChange,
}: {
  value: MidweekDay;
  disabled: boolean;
  onChange: (day: MidweekDay) => void;
}) {
  const activeIndex = Math.max(0, MIDWEEK_DAYS.indexOf(value));
  return (
    <div style={{ padding: '10px 16px 14px' }}>
      <div
        className="proto-appearance-segmented proto-seg-track"
        role="radiogroup"
        aria-label="Midweek day"
        style={
          {
            '--proto-seg-count': MIDWEEK_DAYS.length,
            '--proto-seg-index': activeIndex,
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? 'none' : undefined,
          } as CSSProperties
        }
      >
        {MIDWEEK_DAYS.map((day) => (
          <button
            key={day}
            type="button"
            role="radio"
            aria-checked={value === day}
            className={`proto-appearance-segmented__btn${value === day ? ' proto-appearance-segmented__btn--active' : ''}`}
            onClick={() => onChange(day)}
          >
            {midweekDayLabel(day)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PrototypeRemindersPage() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();

  const [support, setSupport] = useState<PushSupport>('unsupported');
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [platform] = useState(() => getInstallPlatform());
  const saveTimer = useRef<number | null>(null);

  // Support is read in an effect, never during render: `Notification.permission` is a live
  // browser value, and reading it while rendering would make the first paint disagree with
  // the second on a page whose whole job is to report it.
  useEffect(() => {
    setSupport(getPushSupport());
  }, []);

  useEffect(() => {
    const stored = parseReminderSettings(profile?.reminderSettings ?? null);
    if (stored) setSettings(stored);
  }, [profile?.reminderSettings]);

  const refreshStatus = useCallback(() => {
    fetchPushStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    refreshStatus();
  }, [userId, refreshStatus]);

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  /**
   * Optimistic locally, debounced to the account. Any edit also clears a policy pause: a
   * person adjusting their schedule is telling us they want these.
   */
  const save = useCallback(
    (next: ReminderSettings) => {
      const cleared: ReminderSettings = { ...next, pausedByPolicy: null };
      setSettings(cleared);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void api
          .post('/api/user/update-reminders', {
            reminderSettings: {
              sunday: cleared.sunday,
              midweek: cleared.midweek,
              midweekDay: cleared.midweekDay,
              hour: cleared.hour,
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
          })
          .catch(() => toast.error('Could not save your reminder schedule.'));
      }, SAVE_DEBOUNCE_MS);
    },
    [queryClient, userId],
  );

  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await enablePushReminders();
      setSupport(result.support);
      if (!result.ok) {
        if (result.error) toast.error(result.error);
        else if (result.support === 'denied') {
          toast.error('Notifications are blocked for Harvous in this browser.');
        }
        return;
      }
      // Turning it on is also the moment the schedule first exists — an account that has
      // never opened this page has no stored settings, and the defaults are what the button
      // just promised.
      save(settings);
      refreshStatus();
      toast.success('Reminders are on for this device.');
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, save, settings]);

  const handleDisableDevice = useCallback(async () => {
    setBusy(true);
    try {
      await disablePushRemindersOnThisDevice();
      setSupport(getPushSupport());
      refreshStatus();
      toast.success('Reminders are off on this device.');
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const handleTest = useCallback(async () => {
    setBusy(true);
    try {
      const result = await sendTestReminder();
      if (result.sent === 0) {
        toast.error('No device could be reached. Try turning reminders on again.');
      } else {
        toast.success(`Sent to ${result.sent} device${result.sent === 1 ? '' : 's'}.`);
      }
      refreshStatus();
    } catch {
      toast.error('Could not send a test reminder.');
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const deviceCount = status?.deviceCount ?? 0;
  const scheduleDisabled = deviceCount === 0;
  const zone = useMemo(() => zoneLabel(profile?.timezone), [profile?.timezone]);
  const hours = useMemo(hourOptions, []);
  const paused = settings.pausedByPolicy;

  return (
    <SettingsShell>
      <SettingsIntro>
        Sunday morning and midweek, carrying the day&rsquo;s verse or where you left off.
      </SettingsIntro>

      {support === 'unsupported' ? (
        <SettingsGroup>
          <SettingsRow
            label="This browser can't show notifications"
            sublabel="Chrome, Edge, Firefox and Safari 16.4+ can."
            trailing="none"
          />
        </SettingsGroup>
      ) : null}

      {support === 'needs-home-screen' ? (
        <SettingsGroup>
          <SettingsRow
            label="Add Harvous to your Home Screen first"
            sublabel="On iPhone, only installed apps can notify."
            leadingIcon="plus"
            onClick={() => setSheetOpen(true)}
          />
        </SettingsGroup>
      ) : null}

      {support === 'denied' ? (
        <SettingsGroup>
          <SettingsRow
            label="Notifications are blocked"
            sublabel="Allow Harvous in your browser's site settings."
            trailing="none"
          />
        </SettingsGroup>
      ) : null}

      {support === 'default' ? (
        <SettingsGroup>
          <SettingsRow
            label={busy ? 'Turning on…' : 'Turn on reminders'}
            sublabel="Your browser will ask permission once."
            leadingIcon="bell"
            disabled={busy}
            onClick={() => void handleEnable()}
          />
        </SettingsGroup>
      ) : null}

      {support === 'granted' ? (
        <SettingsGroup>
          <SettingsRow
            label={deviceCount > 0 ? 'On for this device' : 'Not on any device yet'}
            sublabel={
              deviceCount > 1
                ? `Reminders reach ${deviceCount} devices signed in to your account.`
                : deviceCount === 1
                  ? 'Reminders reach this device.'
                  : 'Turn them on again to reach this device.'
            }
            value={deviceCount > 0 ? undefined : 'Off'}
            trailing="none"
          />
          {deviceCount > 0 ? (
            <SettingsRow
              label="Turn off on this device"
              sublabel="Your schedule and other devices are unaffected."
              disabled={busy}
              onClick={() => void handleDisableDevice()}
            />
          ) : (
            <SettingsRow
              label="Turn on reminders"
              leadingIcon="bell"
              disabled={busy}
              onClick={() => void handleEnable()}
            />
          )}
        </SettingsGroup>
      ) : null}

      {paused ? (
        <SettingsGroup>
          <SettingsRow
            label="Paused because they weren't being opened"
            sublabel="Change anything below to start them again."
            trailing="none"
          />
        </SettingsGroup>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          margin: '24px 0 8px',
          flexWrap: 'wrap',
        }}
      >
        <h2 className="pds-list-title" style={{ margin: 0, color: 'var(--pds-text-primary)' }}>
          Schedule
        </h2>
        {scheduleDisabled ? (
          <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>
            Saved, but not in effect until reminders are on.
          </span>
        ) : null}
      </div>

      <SettingsGroup>
        <ToggleRow
          label="Sunday morning"
          sublabel="Before church, with the day's verse."
          checked={settings.sunday}
          disabled={scheduleDisabled}
          onChange={(sunday) => save({ ...settings, sunday })}
        />
        <ToggleRow
          label="Midweek"
          sublabel={`On ${midweekDayLabel(settings.midweekDay)}.`}
          checked={settings.midweek}
          disabled={scheduleDisabled}
          onChange={(midweek) => save({ ...settings, midweek })}
        />
        {settings.midweek ? (
          <DaySegmented
            value={settings.midweekDay}
            disabled={scheduleDisabled}
            onChange={(midweekDay) => save({ ...settings, midweekDay })}
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup>
        <div className="proto-note-row proto-note-row--static">
          <span
            className="proto-settings-list-row__main"
            // `__main` is a span and computes to `display: inline`, so it constrains nothing
            // and a long sublabel is clipped mid-word. Same fix the translation row makes.
            style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
          >
            <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>Time</span>
            <span
              className="pds-list-preview"
              style={{ display: 'block', marginTop: 2, whiteSpace: 'normal' }}
            >
              {zone ? `Your time in ${zone}.` : 'Your time zone is set the first time you open Harvous.'}
            </span>
          </span>
          <span className="proto-settings-list-row__trailing">
            <select
              className="pds-caption"
              aria-label="Reminder time"
              value={settings.hour}
              disabled={scheduleDisabled}
              onChange={(e) => save({ ...settings, hour: Number(e.target.value) })}
              style={{
                background: 'transparent',
                border: '0.5px solid var(--pds-border)',
                borderRadius: 'var(--pds-radius-control, 8px)',
                color: 'var(--pds-text-primary)',
                padding: '4px 8px',
              }}
            >
              {hours.map((hour) => (
                <option key={hour} value={hour}>
                  {formatReminderHour(hour)}
                </option>
              ))}
            </select>
          </span>
        </div>
      </SettingsGroup>

      {support === 'granted' && deviceCount > 0 ? (
        <SettingsGroup>
          <SettingsRow
            label="Send a test"
            sublabel="On iPhone, leave Harvous to see it as a banner."
            disabled={busy}
            onClick={() => void handleTest()}
          />
        </SettingsGroup>
      ) : null}

      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '4px 2px 0' }}>
        {status?.recentSummary ? `${status.recentSummary}. ` : ''}
        Never more than two a week. You won&rsquo;t get one on a day you have already opened
        Harvous, and reminders pause themselves if they go unopened.
      </p>

      <PrototypeInstallWebAppSheet open={sheetOpen} onClose={() => setSheetOpen(false)} platform={platform} />
    </SettingsShell>
  );
}
