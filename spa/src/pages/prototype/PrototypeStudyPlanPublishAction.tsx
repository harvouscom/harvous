/**
 * "Publish to a channel" — on a study plan in your own study, for church staff.
 *
 * Staff add a plan to My Home (from Discover, a shared link, or their own) and hand it to
 * their congregation as a study plan in a channel they lead. Renders nothing for anyone who
 * leads no channel, so it never shows outside church staff. The destinations are a menu
 * anchored to the button, the same popover every other thread action uses.
 */
import { useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { toastError } from '../../lib/error-copy';
import {
  usePublishPlanChannels,
  usePublishStudyPlanToChannel,
} from '../../hooks/mutations/usePublishStudyPlanToChannel';
import PrototypeSidebarRowMenuPopover, { TRIGGER_ANCHOR_MIN_WIDTH } from './PrototypeSidebarRowMenuPopover';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';

export default function PrototypeStudyPlanPublishAction({
  threadId,
  enabled,
}: {
  threadId: string;
  /** Only a study plan in the viewer's own study. */
  enabled: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const channelsQuery = usePublishPlanChannels(enabled);
  const publish = usePublishStudyPlanToChannel();
  const channels = channelsQuery.data?.channels ?? [];

  if (!enabled || channels.length === 0) return null;

  const run = (channel: { id: string; title: string }) => {
    setOpen(false);
    publish.mutate(
      { threadId, channelSpaceId: channel.id },
      {
        onSuccess: (result) => {
          if (result.alreadyPublished) {
            const where = channels.find((c) => c.id === result.channelSpaceId)?.title ?? 'a channel';
            toast.success(`You already published this plan to ${where}`);
            return;
          }
          toast.success(`Published to ${channel.title}`);
        },
        onError: (err) => toastError(err, 'Could not publish this plan'),
      },
    );
  };

  return (
    <div className="proto-shared-thread-drilldown__actions proto-shared-thread-drilldown__actions--single" ref={rootRef}>
      <button
        type="button"
        className="proto-shared-thread-action"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={publish.isPending}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {publish.isPending ? 'Publishing…' : 'Publish to a channel'}
      </button>
      <PrototypeSidebarRowMenuPopover
        open={open}
        rowRef={rootRef}
        triggerRootRef={rootRef}
        minWidth={TRIGGER_ANCHOR_MIN_WIDTH}
        onDismiss={() => setOpen(false)}
        aria-label="Publish to"
      >
        <div className="proto-menu-section" role="group" aria-label="Publish to">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              role="menuitem"
              className="proto-menu-item"
              disabled={publish.isPending}
              onClick={(e) => {
                e.stopPropagation();
                run(channel);
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="rss" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">{channel.title}</span>
            </button>
          ))}
        </div>
      </PrototypeSidebarRowMenuPopover>
    </div>
  );
}
