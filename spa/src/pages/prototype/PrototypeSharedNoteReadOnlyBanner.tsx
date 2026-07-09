import Icon from '@/components/react/Icon';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';

export default function PrototypeSharedNoteReadOnlyBanner({
  authorDisplayName,
  authorUserId,
  showResponseLegend = false,
}: {
  authorDisplayName?: string | null;
  authorUserId?: string | null;
  authorFirstName?: string | null;
  authorProfileImageUrl?: string | null;
  authorColor?: string | null;
  /** Show the "underline vs fill" legend — only meaningful once responses exist on the note. */
  showResponseLegend?: boolean;
}) {
  const hasAuthor = Boolean(authorDisplayName && authorUserId);
  return (
    <div className="proto-shared-readonly-banner-wrap">
      <div className="proto-shared-readonly-banner" role="status" aria-live="polite">
        <span className="proto-shared-readonly-banner__status pds-caption">
          <Icon name="eye" size={11} className="proto-shared-readonly-banner__icon" aria-hidden />
          Highlight to respond
        </span>
        {hasAuthor ? (
          <SharedSpaceNoteAuthorChip
            displayName={authorDisplayName!}
            userId={authorUserId!}
            isSelf={false}
            showAvatar={false}
          />
        ) : null}
      </div>
      {showResponseLegend ? (
        <div className="proto-shared-readonly-legend pds-caption" aria-hidden>
          <span className="proto-shared-readonly-legend__item">
            <span className="proto-shared-readonly-legend__swatch proto-shared-readonly-legend__swatch--underline" />
            {authorDisplayName ? `${authorDisplayName}'s highlight` : "Author's highlight"}
          </span>
          <span className="proto-shared-readonly-legend__item">
            <span className="proto-shared-readonly-legend__swatch proto-shared-readonly-legend__swatch--fill" />
            A response
          </span>
        </div>
      ) : null}
    </div>
  );
}
