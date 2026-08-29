/**
 * Which kind of thing the panel is showing.
 *
 * A menu rather than a chip row. Seven chips wrapped or scrolled depending on width, and a
 * filter you have to scroll to reach is a filter you stop using — the same lesson the study
 * feed learned when eight scope chips turned the top of its sheet into a header band. It
 * also frees the row for the search field, which is the thing this surface is named after.
 *
 * `ProtoSelectMenu` is the house answer for choosing one of a list — a trigger plus a
 * portaled menu of radio rows — and is already what the space switcher, the sidebar's list
 * picker and the planner's scopes use. Its own comment names the risk of a ninth hand-rolled
 * variant, which is exactly what a bespoke dropdown here would be.
 */
import ProtoSelectMenu from '../ProtoSelectMenu';
import Icon from '@/components/react/Icon';
import { LIBRARY_TAB_OPTIONS, type LibraryTab } from '../sidebar-search-types';

export default function PrototypeLibraryTabs({
  tab,
  onSelect,
}: {
  tab: LibraryTab;
  onSelect: (tab: LibraryTab) => void;
}) {
  return (
    <ProtoSelectMenu<LibraryTab>
      value={tab}
      onChange={onSelect}
      label="Which kind of thing to show"
      className="proto-library-kind"
      options={LIBRARY_TAB_OPTIONS.map((option) => ({
        value: option.id,
        label: option.label,
        /* The kinds carry the same glyphs the sidebar's list modes wear, so a row here and
           a row there are recognisably the same list. */
        icon: option.iconName ? <Icon name={option.iconName as never} size={13} aria-hidden /> : undefined,
      }))}
    />
  );
}
