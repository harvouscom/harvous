/** Versioned alongside CHILD_NOTICE_VERSION. Changes require renewed consent, never automatic activation. */
export default function ChildPrivacyNotice() {
  return (
    <div className="pds-family-privacy-notice">
      <section>
        <h4 className="pds-note-card-title">Eligibility and information we store</h4>
        <p className="pds-subheadline">Child accounts are for children under 13 in the United States, managed by their parent or legal guardian.</p>
        <p className="pds-subheadline">Harvous stores a display name (a first name or nickname), your confirmation that your child is under 13, parent connection, notes and their organization and attachments, approved ministry channels,
          notebook appearance preferences, Family Bible readings and thoughts, a consent record, and temporary sign-in information. Hosting and security services also process
          information needed to deliver and protect the service, such as IP addresses.</p>
      </section>
      <section>
        <h4 className="pds-note-card-title">Who can see your child’s activity</h4>
        <p className="pds-subheadline">You can read and export your child’s notes. Ministry leaders and other members cannot read
          their notebook or find their child profile. Family Bible thoughts are visible to your child and you.
          Approved ministry channels are read-only.</p>
        <p className="pds-subheadline">Child accounts have no public sharing, direct messages, purchases, AI connectors, optional
          analytics, or session recordings. We do not sell child data or use it for advertising.</p>
      </section>
      <section>
        <h4 className="pds-note-card-title">Adult verification</h4>
        <p className="pds-subheadline">Kids Web Services verifies that you are an adult. Harvous receives the verification result,
          not your payment card, identification documents, or verification images.
          KWS may remember your verified status in its AgeGraph under its own privacy policy.</p>
      </section>
      <section>
        <h4 className="pds-note-card-title">Your controls and how long we keep information</h4>
        <p className="pds-subheadline">You may end sessions, remove ministry access, withdraw consent, or delete the account in
          Family settings. Withdrawing consent stops child access immediately. You have 30 days to
          export before the account is deleted. Accounts inactive for one year are deleted.
          Temporary verification requests expire after seven days. Deleted data may remain in restricted
          backups until those backups expire under our published retention policy.</p>
        <p className="pds-subheadline">Read the full child privacy policy linked below for operator contact details, service providers,
          backup retention, and how to exercise your rights. You do not need to agree to optional sharing
          to let your child use their notebook.</p>
      </section>
    </div>
  );
}
