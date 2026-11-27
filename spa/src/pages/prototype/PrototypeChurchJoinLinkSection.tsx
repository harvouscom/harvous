/**
 * The church's join link and QR, in the My Church hub (docs/CHURCH_V2_ROADMAP.md §A1).
 *
 * One link for the whole church. Anyone who opens it sees the church, makes a free
 * account if they need one, connects, and picks what to follow — the four steps
 * Settings › My Church takes, on one page.
 *
 * Any staff member can copy it and download the QR: handing it out is the job, and
 * the person printing the bulletin is rarely the admin. Making, replacing and turning
 * it off is an admin's (`manage_church_settings`), because replacing it kills every
 * printed copy.
 *
 * The count is the whole of what it reports — how many joined through a link, never who.
 *
 * Laid out like the child notebook's calm pages (Nov 27 2026): one preview of the printed
 * thing, one primary action, then labelled groups of quiet rows. The destructive actions
 * sit last, as rows, instead of as buttons the same size as Copy link.
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { useChurchJoinLink, useChurchJoinLinkActions } from '../../hooks/queries/useChurchJoin';
import { filenameSlug, saveBlob, svgToPngBlob } from '../../lib/svg-to-png';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeSectionHeader from './design-system/PrototypeSectionHeader';

type PendingConfirm = { action: 'rotate' | 'revoke'; rect: DOMRect };

export default function PrototypeChurchJoinLinkSection({
  orgId,
  churchName,
  canView,
  lapsed,
}: {
  orgId: string | null;
  churchName: string;
  /** Any staff member — gates the request, not just the render. */
  canView: boolean;
  /** The church's plan has ended: the link can still be turned off, not made. */
  lapsed: boolean;
}) {
  const { data, isPending, isError, refetch } = useChurchJoinLink(orgId, { enabled: canView });
  const actions = useChurchJoinLinkActions(orgId);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [copied, setCopied] = useState(false);

  if (!data) {
    if (canView && isError) {
      return (
        <div className="proto-home-section proto-church-join">
          <p className="proto-caption proto-church-join__lede">Couldn&rsquo;t load your join link.</p>
          <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      );
    }
    return canView && isPending ? <ProtoSpaceLoading label="Loading join link" /> : null;
  }

  const { link, qrSvg, totalJoined, canManage } = data;
  const busy = actions.isPending;
  const fileBase = `${filenameSlug(churchName)}-harvous-qr`;

  function run(action: 'create' | 'rotate' | 'revoke') {
    actions.mutate(action, {
      onSuccess: () => {
        if (action === 'rotate') toast.success('New link ready. The old one no longer works.');
        if (action === 'revoke') toast.success('Join link turned off');
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update the link'),
    });
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success('Join link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }

  function downloadSvg() {
    if (!qrSvg) return;
    saveBlob(new Blob([qrSvg], { type: 'image/svg+xml' }), `${fileBase}.svg`);
  }

  async function downloadPng() {
    if (!qrSvg) return;
    try {
      saveBlob(await svgToPngBlob(qrSvg), `${fileBase}.png`);
    } catch {
      toast.error('Could not make the PNG — try the SVG');
    }
  }

  const joinedLine =
    totalJoined === 0
      ? 'Nobody has joined yet'
      : totalJoined === 1
        ? '1 person has joined'
        : `${totalJoined} people have joined`;

  return (
    <div className="proto-home-section proto-church-join">
      {link && qrSvg ? (
        <>
          {/* A preview of the thing itself: what a bulletin, slide or poster will carry.
              Paper, the church's name in display type, the code, and the address under it. */}
          <figure className="proto-church-join__poster">
            <figcaption className="proto-church-join__poster-head">
              <span className="pds-caption proto-church-join__eyebrow">Scan to join on Harvous</span>
              <span className="proto-church-join__church">{churchName}</span>
            </figcaption>
            {/* Always black on white, whatever the app's theme: that is the code that scans. */}
            <img
              className="proto-church-join__qr"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
              alt={`QR code for ${churchName}'s Harvous link`}
              width={184}
              height={184}
            />
            <span className="pds-caption proto-church-join__url" title={link.url}>
              {link.url.replace(/^https?:\/\//, '')}
            </span>
          </figure>

          <button type="button" className="proto-settings-btn proto-church-join__copy" onClick={copyLink}>
            <Icon name={copied ? 'check' : 'link'} size={12} />
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="pds-caption proto-church-join__lede">
            One link for your whole church. Anyone who opens it can make a free account, connect, and choose
            what to follow.
          </p>

          <PrototypeSectionHeader variant="list" className="proto-church-join__label">
            Print or share
          </PrototypeSectionHeader>
          <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
            {/* PNG for slides and email; SVG for anything printed at any size. */}
            <button type="button" className="proto-church-tools__row" onClick={() => void downloadPng()}>
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="file-image" size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">Download PNG</span>
                <span className="proto-caption proto-church-tools__row-meta">For slides, screens and email</span>
              </span>
              <span className="proto-church-tools__row-chevron" aria-hidden>
                <Icon name="cloud-arrow-down" size={12} />
              </span>
            </button>
            <button type="button" className="proto-church-tools__row" onClick={downloadSvg}>
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="file-lines" size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">Download SVG</span>
                <span className="proto-caption proto-church-tools__row-meta">Stays sharp at any print size</span>
              </span>
              <span className="proto-church-tools__row-chevron" aria-hidden>
                <Icon name="cloud-arrow-down" size={12} />
              </span>
            </button>
          </div>

          <PrototypeSectionHeader variant="list" className="proto-church-join__label">
            Through this link
          </PrototypeSectionHeader>
          <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
            <div className="proto-church-tools__row proto-church-tools__row--status" role="status">
              <span className="proto-church-tools__row-icon" aria-hidden>
                <Icon name="user-group" size={13} />
              </span>
              <span className="proto-church-tools__row-text">
                <span className="pds-list-title proto-church-tools__row-title">{joinedLine}</span>
                <span className="proto-caption proto-church-tools__row-meta">A count only. Harvous never shows who.</span>
              </span>
            </div>
          </div>

          {canManage ? (
            <>
              <PrototypeSectionHeader variant="list" className="proto-church-join__label">
                Manage
              </PrototypeSectionHeader>
              <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                <button
                  type="button"
                  className="proto-church-tools__row"
                  disabled={busy || lapsed}
                  title={lapsed ? 'Your church’s plan has ended' : undefined}
                  onClick={(event) => setConfirm({ action: 'rotate', rect: event.currentTarget.getBoundingClientRect() })}
                >
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="arrows-rotate" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">Replace link</span>
                    <span className="proto-caption proto-church-tools__row-meta">Printed copies stop working</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="proto-church-tools__row proto-church-join__danger"
                  disabled={busy}
                  onClick={(event) => setConfirm({ action: 'revoke', rect: event.currentTarget.getBoundingClientRect() })}
                >
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="circle-stop" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title">Turn off link</span>
                    <span className="proto-caption proto-church-tools__row-meta">You can make a new one later</span>
                  </span>
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : canManage ? (
        <>
          <p className="pds-caption proto-church-join__lede">
            One link and QR for your whole church. Anyone who opens it can make a free account, connect to{' '}
            {churchName}, and choose what to follow.
          </p>
          <button
            type="button"
            className="proto-settings-btn"
            disabled={busy || lapsed}
            onClick={() => run('create')}
          >
            {busy ? 'Making your link…' : 'Make a join link'}
          </button>
          {lapsed ? (
            <p className="proto-caption proto-church-join__count">
              Your church&rsquo;s plan has ended, so a new link can&rsquo;t be made right now.
            </p>
          ) : null}
        </>
      ) : (
        <p className="proto-caption proto-church-join__count">
          Your church doesn&rsquo;t have a join link yet. A church admin can make one here.
        </p>
      )}

      {confirm ? (
        <ProtoConfirmDialog
          anchorRect={confirm.rect}
          preferAbove
          title={confirm.action === 'rotate' ? 'Replace your join link?' : 'Turn off your join link?'}
          description={
            confirm.action === 'rotate'
              ? 'Printed and shared copies of the current link and QR will stop working.'
              : 'The link and QR stop working. You can make a new one later.'
          }
          confirmLabel={confirm.action === 'rotate' ? 'Replace' : 'Turn off'}
          cancelLabel="Keep"
          busy={busy}
          onConfirm={() => {
            const action = confirm.action;
            setConfirm(null);
            run(action);
          }}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}
