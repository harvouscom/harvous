/**
 * Founder letter — paper-stack layout. Keep body copy in sync with harvouscom/harvous.com (FounderLetter.astro).
 * Greeting is personalized in-app when firstName is provided.
 */
export type FounderLetterPaperPhase = 'stacked' | 'fanned';

export default function FounderLetterContent({
  firstName,
  paperPhase = 'stacked',
}: {
  firstName?: string;
  paperPhase?: FounderLetterPaperPhase;
}) {
  const greeting = firstName?.trim() ? `Hey ${firstName.trim()},` : 'Hey there,';

  return (
    <div
      className={[
        'proto-paper-stack',
        paperPhase === 'fanned' ? 'proto-paper-stack--fanned' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="proto-paper-leaf proto-paper-leaf--back" aria-hidden />
      <div className="proto-paper-leaf proto-paper-leaf--mid" aria-hidden />
      <div className="proto-paper-leaf proto-paper-leaf--main">
        <div className="proto-founder-letter__scroll">
          <div className="proto-founder-letter__columns">
            <div className="proto-prose-letter">
              <p>{greeting}</p>
              <p>
                First, thanks for trying out the Bible notes app I made and have always wanted for myself.
              </p>
              <p>
                Since 2016 (when I got saved) I&apos;ve been studying the Bible. Many highlights saved in my Bible app of choice.
                Some notes in said Bible app. Some in Apple Notes. And some somewhere on a piece of paper I
                don&apos;t have anymore. It was all scattered.
              </p>
              <p>I&apos;ve tried many Bible study apps. None helped me remember and feed my curiosity.</p>
              <p>
                So I made one. Harvous knows scripture, looks up words I&apos;m curious about, and stays out of
                the way when I want to write.
              </p>
            </div>
            <div className="proto-prose-letter">
              <p>
                It&apos;s named after Proverbs 25:2 — &quot;It is the glory of God to conceal a matter; to search
                out a matter is the glory of kings.&quot; Studying the Bible is searching. Harvous is the place
                where the search settles into something you can come back to.
              </p>
              <p>
                Right now it&apos;s available on web with Mac, iPad, and iPhone coming later. You can add
                scripture in eleven English translations, see automatic built-in dictionary suggestions, and highlight what
                stands out to you.
              </p>
              <p>
                If you have any questions, write me at{' '}
                <a className="proto-founder-letter__mailto" href="mailto:derek@harvous.com">
                  derek@harvous.com
                </a>
                .
              </p>
              <div className="proto-founder-letter__signoff">
                <img
                  src="/derek-signiture.png"
                  alt="Derek's signature"
                  className="proto-founder-letter__signature"
                />
                <div className="proto-founder-letter__byline">
                  <picture>
                    <source srcSet="/derek-avatar.webp" type="image/webp" />
                    <img
                      src="/derek-avatar.jpeg"
                      alt="Derek Castelli"
                      className="proto-founder-letter__avatar"
                      width={44}
                      height={44}
                      decoding="async"
                    />
                  </picture>
                  <div>
                    <div className="proto-founder-letter__name">Derek Castelli</div>
                    <div className="proto-founder-letter__title">Founder of Harvous</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
