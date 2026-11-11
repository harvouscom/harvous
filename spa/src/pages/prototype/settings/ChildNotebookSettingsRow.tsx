import type { FamilyChild } from '../../family/types';
import { ChildNotebookCover } from '../ChildNotebookAppearance';
import { SettingsRow } from './SettingsShell';
import '../../../styles/child-notebook-preview.css';

export default function ChildNotebookSettingsRow({ child, onClick }: {
  child: FamilyChild;
  onClick: () => void;
}) {
  return <SettingsRow
    leadingNode={<ChildNotebookCover name={child.displayName} preferences={child.notebookPreferences} />}
    leadingClassName="pds-family-notebook-row__cover"
    label={`${child.displayName}’s notebook`}
    sublabel={child.status === 'active' ? 'Open or manage notebook' : 'Consent withdrawn'}
    onClick={onClick}
  />;
}
