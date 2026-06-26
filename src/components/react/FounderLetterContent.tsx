/**
 * Founder letter — paper-stack layout. Keep in sync with site/src/components/FounderLetter.astro.
 */
export default function FounderLetterContent() {
  return (
    <div className="proto-paper-stack proto-paper-stack--in-view">
      <div className="proto-paper-leaf proto-paper-leaf--back" aria-hidden />
      <div className="proto-paper-leaf proto-paper-leaf--mid" aria-hidden />
      <div className="proto-paper-leaf proto-paper-leaf--main">
        <div className="proto-founder-letter__columns">
          <div className="proto-prose-letter">
            <p>Hey there,</p>
            <p>
              Since 2016 I&apos;ve been studying the Bible. Many highlights saved in my Bible app of choice.
              Some notes in said Bible app. Some in Apple Notes. And some somewhere on a piece of paper I
              don&apos;t have anymore. It was all scattered.
            </p>
            <p>
              I&apos;ve tried many apps for my Bible study. Some were made for scholars and felt archaic. Some
              were built for readers with notes as an afterthought. None seem to be made for someone who is
              curious about the Bible wanting to remember their study.
            </p>
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
              It&apos;s available on the web, Mac, iPad, and iPhone. Right now you can add the scripture (seven
              available translations), navigate the built-in dictionary, and highlight what stands out to you.
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
                <img src="/derek-avatar.jpeg" alt="Derek Castelli" className="proto-founder-letter__avatar" />
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
  );
}
