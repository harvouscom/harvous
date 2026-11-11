export function ChildPrivacyPolicyLink({ url }: { url?: string }) {
  return url ? <a className="pds-caption pds-kids-policy-link" href={url} target="_blank" rel="noopener noreferrer">Child privacy policy</a> : null;
}

/** Versioned alongside CHILD_NOTICE_VERSION. Changes require renewed consent, never automatic activation. */
export default function ChildPrivacyNotice() {
  return (
    <div className="pds-family-privacy-notice">
      <section>
        <h4 className="pds-note-card-title">Eligibility and information we store</h4>
        <p className="pds-subheadline">Child accounts are for children under 13 in the United States, managed by their parent or legal guardian.</p>
        <p className="pds-subheadline">We collect, use, and disclose notebook information only after you give permission. Opening the site also sends technical information, such as an IP address, to deliver pages and keep the service secure.</p>
        <p className="pds-subheadline">Harvous stores a first name or nickname, your confirmation of eligibility, a link to your account, and your consent. We use these to create and manage the notebook. We save notes, folders, tags, Threads, Scripture and resource references, approved ministry channels, Family Bible readings and thoughts, and notebook preferences so you and your child can return to them. We record the last time the notebook was used to identify inactive notebooks for deletion.</p>
        <p className="pds-subheadline">Temporary sign-in information lets your child open the notebook. Fly.io hosts the notebook service, Cloudflare delivers and protects it, and Supabase stores its data and backups. Hosting and security providers process information such as IP addresses to operate and protect the notebook.</p>
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
        <p className="pds-subheadline">Kids Web Services (KWS) uses your adult account email to verify that you are an adult. Depending on the method, KWS may ask for a payment card or identifying information, such as a Social Security number. Harvous receives the verification result. KWS may remember your verified status in its AgeGraph under its own privacy policy.</p>
        <p className="pds-subheadline">After verification, confirm that you are your child’s parent or legal guardian and agree to this notice. Select “Agree and create notebook” to give permission and create the notebook.</p>
      </section>
      <section>
        <h4 className="pds-note-card-title">Your controls and how long we keep information</h4>
        <p className="pds-subheadline">You may end sessions, remove ministry access, withdraw consent, or delete the account in
          Family settings. Withdrawing consent immediately blocks new child requests. You can export for 30 days or delete the notebook sooner. We schedule inactive notebooks for deletion after one year.
          Temporary verification requests expire after seven days. Deleted data may remain in restricted
          backups until those backups expire under our published retention policy.</p>
        <p className="pds-subheadline">The child privacy policy linked below includes operator contact details, backup retention, and how to exercise your rights. We do not ask you to permit disclosures beyond those needed to provide and protect the notebook.</p>
      </section>
    </div>
  );
}
