/** Versioned alongside CHILD_NOTICE_VERSION. Changes require renewed consent, never automatic activation. */
export default function ChildPrivacyNotice() {
  return <div className="pds-family-notice pds-caption">
    <h2 className="pds-title">Your child’s privacy</h2>
    <p>Child accounts are for children under 13 in the United States, managed by their parent or legal guardian.</p>
    <p>Harvous stores a nickname, age band, parent connection, notes, approved ministry channels,
      notebook appearance preferences, Family Bible readings and thoughts, a consent record, and temporary sign-in information. Hosting and security services also process
      information needed to deliver and protect the service, such as IP addresses.</p>
    <p>You can read and export your child’s notes. Ministry leaders and other members cannot read
      their notebook or find their child profile. Family Bible thoughts are visible to your child and you.
      Approved ministry channels are read-only.</p>
    <p>Child accounts have no public sharing, direct messages, purchases, AI connectors, optional
      analytics, or session recordings. We do not sell child data or use it for advertising.</p>
    <p>Kids Web Services verifies that you are an adult. Harvous receives the verification result,
      not your payment card, identification documents, or verification images.
      KWS may remember your verified status in its AgeGraph under its own privacy policy.</p>
    <p>You may end sessions, remove ministry access, withdraw consent, or delete the account in
      Family settings. Withdrawing consent stops child access immediately. You have 30 days to
      export before the account is deleted. Accounts inactive for one year are deleted.
      Temporary verification requests expire after seven days. Deleted data may remain in restricted
      backups until those backups expire under our published retention policy.</p>
    <p>Read the full child privacy policy linked below for operator contact details, service providers,
      backup retention, and how to exercise your rights. You do not need to agree to optional sharing
      to let your child use their notebook.</p>
  </div>;
}
