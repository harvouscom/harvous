import type { FamilyChild } from '../../family/types';
import { ChildNotebookCover } from '../ChildNotebookAppearance';
import { SettingsRow } from './SettingsShell';
import { CHILD_NOTICE_VERSION } from '../../../../../shared/child-notebook';
import '../../../styles/child-notebook-preview.css';

export default function ChildNotebookSettingsRow({ child, onClick }: {
  child: FamilyChild;
  onClick: () => void;
}) {
  return <SettingsRow
    leadingNode={<ChildNotebookCover name={child.displayName} preferences={child.notebookPreferences} />}
    leadingClassName="pds-family-notebook-row__cover"
    label={`${child.displayName}’s notebook`}
    sublabel={child.status !== 'active' ? 'Consent withdrawn' : child.noticeVersion !== CHILD_NOTICE_VERSION ? 'Paused · Review the updated notice' : 'Open or manage notebook'}
    onClick={onClick}
  />;
}
