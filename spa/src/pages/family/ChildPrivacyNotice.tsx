/**
 * One short line about this screen, with the policy link folded in — the one way the child notebook
 * links its privacy policy. COPPA (16 CFR 312.4(d)) wants a clearly labelled link on the landing
 * screen and next to each place a child's information is sent, and the publication checklist names
 * the note, search, Family Bible thought and settings controls. So it appears on Home, the
 * signed-out page, the note editor, the Family Bible reply box, search and Settings, plus once in
 * "Who can see my notebook?". Placement is for counsel to confirm before launch.
 */
export function ChildPrivacyFootnote({ url, children }: { url?: string; children: string }) {
  return <p className="pds-caption pds-kids-privacy-footnote">
    {children}{url && <>{' '}<a className="pds-kids-policy-link" href={url} target="_blank" rel="noopener noreferrer">Privacy policy</a></>}
  </p>;
}

/** Versioned alongside CHILD_NOTICE_VERSION. Changes require renewed consent, never automatic activation. */
export default function ChildPrivacyNotice({ privacyUrl }: { privacyUrl?: string }) {
  return (
    <div className="pds-family-privacy-notice">
      <section>
        <h4 className="pds-note-card-title">Eligibility and information we store</h4>
        <p className="pds-subheadline">Child accounts are for children under 13 in the United States, managed by their parent or legal guardian.</p>
        <p className="pds-subheadline">We collect, use, and disclose notebook information only after you give permission. If you don’t agree, we won’t create a notebook or collect anything from your child. Opening the site also sends technical information, such as an IP address, to deliver pages and keep the service secure.</p>
        <p className="pds-subheadline">Harvous stores a first name or nickname, your confirmation of eligibility, a link to your account, and your consent. We use these to create and manage the notebook. We save notes, folders, tags, Threads, Scripture and resource references, approved ministry channels, Family Bible readings and thoughts, My Bible highlights and stickers, and notebook preferences so you and your child can return to them. For Look back, which brings back notes and verses your child marked, we save what comes back, when, and how each answer went. We use this only to choose what to show next. We record the last time the notebook was used to identify inactive notebooks for deletion.</p>
        <p className="pds-subheadline">Temporary sign-in information lets your child open the notebook. Fly.io hosts the notebook service, Cloudflare delivers and protects it, and Supabase stores its data and backups. Clerk handles your sign-in to your own Harvous account; your child does not get a Clerk account. These providers only help run and protect the notebook. We don’t disclose your child’s information to third parties, except where the law requires it or to protect someone’s safety or the security of the service, so there is nothing separate to agree to. Hosting and security providers process information such as IP addresses to operate and protect the notebook.</p>
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
        <p className="pds-subheadline">Kids Web Services (KWS) uses your adult account email, your country, and your language to verify that you are an adult. Depending on the method, KWS may ask for a payment card or identifying information, such as a Social Security number. Harvous receives the verification result. KWS may remember your verified status in its AgeGraph under its own privacy policy.</p>
        <p className="pds-subheadline">After verification, confirm that you are your child’s parent or legal guardian and agree to this notice. Check the box and select Agree to give permission.</p>
      </section>
      <section>
        <h4 className="pds-note-card-title">Your controls and how long we keep information</h4>
        <p className="pds-subheadline">You may end sessions, remove ministry access, withdraw consent, or delete the account in
          Family settings. Withdrawing consent immediately blocks new child requests. After you withdraw, you can export the notebook for 30 days, or delete it right away. We schedule inactive notebooks for deletion after one year.
          Temporary verification requests expire after seven days. Deleted data may remain in restricted
          backups until those backups expire under our published retention policy.</p>
        <p className="pds-subheadline">{privacyUrl ? <>Our <a className="pds-kids-policy-link" href={privacyUrl} target="_blank" rel="noopener noreferrer">Children’s Privacy Policy</a> has</> : 'Our Children’s Privacy Policy has'} operator contact details, how long we keep information, and how to exercise your rights. We do not ask you to permit disclosures beyond those needed to provide and protect the notebook.</p>
      </section>
    </div>
  );
}
