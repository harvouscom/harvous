/**
 * Sermon outline templates — six named preaching structures, adapted into the
 * app's template shape.
 *
 * A **separate array from `BUILT_IN_TEMPLATES`**, on purpose: those six are
 * personal Bible-study methods and every account gets them in its own
 * template picker on day one. These are preaching-specific, and most Harvous
 * accounts are not preparing a sermon — putting six pulpit-shaped options in
 * front of every user by default would be the wrong reach for a feature meant
 * to be useful, not crowded. `discover-seed-sermon-outline-templates.ts`
 * publishes these straight to Discover instead: they are fully real,
 * installable templates, and a visitor meets them by looking for sermon prep
 * rather than by having them pre-loaded.
 *
 * **Not marked `official`, unlike the six built-ins.** Every heading and
 * prompt below is Harvous's own writing — none of it is copied from the
 * article these were surveyed at — but Harvous did not invent HBLT or the
 * three-act structure the way it invented SOAP. `official: true` would claim
 * an origin that is not true, so the seed script sets it `false` and credits
 * the source by name and link instead (`preview.sourceName`/`sourceUrl`,
 * read by the site's `DiscoverListingPage` as `sourceCredit`).
 *
 * The structures themselves are widely taught preaching frameworks, not any
 * one person's copyrighted prose — the section names and their order are what
 * is genuinely reusable (the same relationship SOAP or the inductive method
 * already have to the wider Bible-study tradition). Three of the six have a
 * named originator worth crediting in `description`: Andy Stanley
 * (Me-We-God-You-We), Lane Sebring (the 4-step method) and Brian Jones (the
 * three-act structure). The others — the three-point sermon, HBLT, and the
 * "sticky sermon" narrative shape — are common-parlance frameworks with no
 * single canonical author, the same way SOAP is not credited to anyone.
 */
import type { NoteTemplate } from "./note-templates";

export const SERMON_OUTLINE_TEMPLATES: NoteTemplate[] = [
  {
    id: "three-point-sermon",
    name: "Three-Point Sermon",
    description:
      "Classic expository shape — one thesis, three points, each with teaching and application.",
    estimatedMinutes: "30–60 min",
    level: "Intermediate",
    titleTemplate: "",
    content: `<h2>Introduction</h2><p>How will you open? What common ground or attention-grabber leads into the text?</p><p><br></p><h2>Thesis</h2><p>State the one sentence this whole sermon is building toward.</p><p><br></p><h2>Point 1</h2><p>Teaching, illustration, application.</p><p><br></p><h2>Point 2</h2><p>Teaching, illustration, application.</p><p><br></p><h2>Point 3</h2><p>Teaching, illustration, application.</p><p><br></p><h2>Conclusion</h2><p>Bring the three points back to the thesis, and call for a response.</p>`,
    noteType: "default",
    iconColor: "blue",
  },
  {
    id: "hblt",
    name: "HBLT",
    description: "Hook, Book, Look, Took — grab attention, teach the text, apply it, call for change.",
    estimatedMinutes: "25–45 min",
    level: "Beginner–Intermediate",
    titleTemplate: "",
    content: `<h2>Hook</h2><p>Grab attention — don't assume you already have it.</p><p><br></p><h2>Book</h2><p>Teach and illustrate what the text is saying.</p><p><br></p><h2>Look</h2><p>Help people wrestle with how this applies to life today.</p><p><br></p><h2>Took</h2><p>Call people to change one specific thing.</p>`,
    noteType: "default",
    iconColor: "orange",
  },
  {
    id: "me-we-god-you-we",
    name: "Me, We, God, You, We",
    description:
      "Andy Stanley's shape — common ground, then the text, then one point everyone can act on.",
    estimatedMinutes: "30–50 min",
    level: "Intermediate",
    titleTemplate: "",
    /* The framework's own name repeats "We" — that is its mnemonic, not a
       mistake — so each occurrence is labelled with the beat it plays rather
       than left as two identical bare headings a reader would have to guess
       apart. */
    content: `<h2>Me — Orientation</h2><p>Introduce yourself and the topic. Find common ground with the room.</p><p><br></p><h2>We — Identification</h2><p>Build emotional common ground — the struggle everyone here shares.</p><p><br></p><h2>God — Illumination</h2><p>Bring the text in. What does God say to this?</p><p><br></p><h2>You — Application</h2><p>Find the one point of application everyone can embrace.</p><p><br></p><h2>We — Inspiration</h2><p>Cast a vision — what happens if this room actually does this?</p>`,
    noteType: "default",
    iconColor: "purple",
  },
  {
    id: "sebring-4-step",
    name: "Lane Sebring's 4-Step Method",
    description:
      "Lane Sebring's shape — open with tension, resolve it in the text, then cast vision.",
    estimatedMinutes: "30–50 min",
    level: "Intermediate",
    titleTemplate: "",
    content: `<h2>Tension</h2><p>Open with a problem, a question, or something the room already feels.</p><p><br></p><h2>Text</h2><p>Point to the passage as where the tension gets resolved.</p><p><br></p><h2>Application</h2><p>Teach and illustrate how to actually live this out.</p><p><br></p><h2>Vision</h2><p>Cast what it looks like if this room takes it to heart.</p>`,
    noteType: "default",
    iconColor: "yellow",
  },
  {
    id: "three-act-structure",
    name: "Three-Act Structure",
    description:
      "Brian Jones' shape — roughly ten minutes each for introduction, explanation, application.",
    estimatedMinutes: "30 min",
    level: "Intermediate",
    titleTemplate: "",
    content: `<h2>Introduction</h2><p>Build anticipation before you say what the sermon is actually about — save the reveal.</p><p><br></p><h2>Explanation</h2><p>Simplify the text. What is the one thing people need to understand?</p><p><br></p><h2>Application</h2><p>Show how this actually connects to life today.</p>`,
    noteType: "default",
    iconColor: "pink",
  },
  {
    id: "sticky-sermon",
    name: "Sticky Sermon",
    description: "A story shape — engage, build tension, teach the text, apply it, inspire, call to action.",
    estimatedMinutes: "30–50 min",
    level: "Intermediate",
    titleTemplate: "",
    content: `<h2>Engage</h2><p>Open with something that pulls the room in.</p><p><br></p><h2>Tension</h2><p>Build anticipation for what the text is about to say.</p><p><br></p><h2>Truth</h2><p>What does the text say, and what does it mean?</p><p><br></p><h2>Application</h2><p>Apply it to people's lives — what does this call for?</p><p><br></p><h2>Inspiration</h2><p>Paint a picture of this truth actually lived out.</p><p><br></p><h2>Action</h2><p>Name one clear step and call people to take it.</p>`,
    noteType: "default",
    iconColor: "green",
  },
];
