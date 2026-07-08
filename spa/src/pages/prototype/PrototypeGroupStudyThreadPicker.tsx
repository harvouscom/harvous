import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useSpaceGroupThreads, type SpaceGroupStudyThread } from '../../hooks/queries/useSpaceGroupThreads';
import { getComposeGroupThreadId, setComposeGroupThreadId } from '../../lib/compose-group-thread';

export default function PrototypeGroupStudyThreadPicker({
  spaceId,
  disabled,
}: {
  spaceId: string;
  disabled?: boolean;
}) {
  const threadsQuery = useSpaceGroupThreads(spaceId);
  const threads = threadsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(() => getComposeGroupThreadId());

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  if (threads.length === 0) return null;

  const onChange = (thread: SpaceGroupStudyThread | null) => {
    const id = thread?.id ?? null;
    setSelectedId(id);
    setComposeGroupThreadId(id);
  };

  return (
    <div className="proto-compose-group-thread-picker">
      <label className="proto-compose-group-thread-picker__label" htmlFor="compose-group-thread">
        Add to study thread
      </label>
      <div className="proto-compose-group-thread-picker__row">
        <span className="proto-compose-group-thread-picker__icon" aria-hidden>
          <Icon name="arrow-right-arrow-left" size={12} />
        </span>
        <select
          id="compose-group-thread"
          className="proto-compose-group-thread-picker__select"
          disabled={disabled || threadsQuery.isLoading}
          value={selected?.id ?? ''}
          onChange={(e) => {
            const next = threads.find((t) => t.id === e.target.value) ?? null;
            onChange(next);
          }}
        >
          <option value="">None</option>
          {threads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
