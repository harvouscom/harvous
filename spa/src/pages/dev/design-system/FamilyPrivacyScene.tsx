import ChildPrivacyNotice from '../../family/ChildPrivacyNotice';
import '../../../styles/family.css';

/** Fixture-only: no parent verification, child information, or API calls. */
export default function FamilyPrivacyScene() {
  return <div className="pds-family-stack">
    <h2 className="pds-title">A notebook with a parent beside you</h2>
    <p className="pds-caption">Web-only pilot. Parent settings reuse existing settings controls; the child notebook has no adult shell.</p>
    <div className="pds-family-stack">
      <label className="pds-caption">Title<input className="pds-child-input" defaultValue="My study note" /></label>
      <label className="pds-caption">My note<textarea className="pds-child-input" rows={4} defaultValue="I want to remember what we read together today." /></label>
      <button className="pds-child-button">Save note</button>
      <p className="pds-caption">Your parent can read your notes. Ministry leaders and other children cannot.</p>
    </div>
    <section className="pds-family-notice pds-family-stack">
      <h3 className="pds-title">Your child’s privacy</h3>
      <ChildPrivacyNotice />
    </section>
  </div>;
}
