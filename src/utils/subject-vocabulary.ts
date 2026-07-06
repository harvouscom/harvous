/**
 * Controlled subject vocabulary — the clean, folder-worthy "subject language" shared by both the
 * note-content folder suggester and the curated passage-subject derivation. Constraining raw
 * signals (OpenBible topic labels, note prose) to this list is what filters the noise
 * ("money", "julius caesar", "dinosaurs") down to real subjects.
 *
 * Seeded from the vetted thematic keywords in `bible-study-keywords.ts` (spiritual/biblical/life),
 * with synonyms expanded to match OpenBible topical phrasings, plus narrative/structural subjects
 * the keyword corpus lacks (Creation, The Exodus, Birth of Jesus…). Pure + tested.
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md (folder rethink).
 */

export type SubjectCategory = 'spiritual' | 'biblical' | 'life' | 'narrative';

export interface Subject {
  name: string;
  category: SubjectCategory;
  /** Lowercase match terms — cover OpenBible topic labels and common prose phrasings. */
  synonyms: string[];
}

export const SUBJECT_VOCABULARY: Subject[] = [
  // ── Spiritual disciplines + virtues ──────────────────────────────────────────
  { name: 'Prayer', category: 'spiritual', synonyms: ['praying', 'intercession', 'petition', 'prayers', 'how to pray', 'power of prayer'] },
  { name: 'Faith', category: 'spiritual', synonyms: ['belief', 'believing', 'trust in god', 'faith in god', 'trusting god', 'having faith'] },
  { name: 'Love', category: 'spiritual', synonyms: ['gods love', "god's love", 'gods love for us', 'loving others', 'loving each other', 'love for others', 'agape', 'compassion', 'charity'] },
  { name: 'Hope', category: 'spiritual', synonyms: ['expectation', 'anticipation', 'hope in god'] },
  { name: 'Grace', category: 'spiritual', synonyms: ['favor', 'unmerited favor', 'gods grace', "god's grace"] },
  { name: 'Mercy', category: 'spiritual', synonyms: ['compassion', 'pity', 'gods mercy', "god's mercy"] },
  { name: 'Forgiveness', category: 'spiritual', synonyms: ['pardon', 'absolution', 'forgiving others', 'forgiveness of sins', 'being forgiven'] },
  { name: 'Repentance', category: 'spiritual', synonyms: ['turning from sin', 'conversion', 'change of heart', 'turning to god', 'repenting'] },
  { name: 'Worship', category: 'spiritual', synonyms: ['adoration', 'reverence', 'worshiping god'] },
  { name: 'Praise', category: 'spiritual', synonyms: ['praising god', 'glorify', 'exalt'] },
  { name: 'Thanksgiving', category: 'spiritual', synonyms: ['gratitude', 'thankfulness', 'giving thanks', 'being thankful'] },
  { name: 'Peace', category: 'spiritual', synonyms: ['shalom', 'tranquility', 'inner peace', 'peace of god', 'peace with god'] },
  { name: 'Joy', category: 'spiritual', synonyms: ['gladness', 'rejoicing', 'happiness'] },
  { name: 'Patience', category: 'spiritual', synonyms: ['endurance', 'perseverance', 'longsuffering', 'waiting on god'] },
  { name: 'Humility', category: 'spiritual', synonyms: ['humbleness', 'meekness', 'modesty', 'being humble'] },
  { name: 'Obedience', category: 'spiritual', synonyms: ['obeying god', 'submission', 'following god', 'doing gods will'] },
  { name: 'Trust', category: 'spiritual', synonyms: ['trusting god', 'dependence on god', 'relying on god'] },

  // ── Doctrinal / biblical ─────────────────────────────────────────────────────
  { name: 'Salvation', category: 'biblical', synonyms: ['being saved', 'how to be saved', 'how to get saved', 'saved', 'deliverance', 'rescue', 'baptism and salvation', 'eternal salvation'] },
  { name: 'Redemption', category: 'biblical', synonyms: ['ransom', 'redeemed', 'redeeming'] },
  { name: 'Atonement', category: 'biblical', synonyms: ['propitiation', 'reconciliation with god', 'blood of christ'] },
  { name: 'Justification', category: 'biblical', synonyms: ['justified by faith', 'righteous before god', 'declared righteous'] },
  { name: 'Sanctification', category: 'biblical', synonyms: ['becoming more like christ', 'growing in christ', 'spiritual growth', 'holiness', 'being made holy', 'walking in the spirit'] },
  { name: 'Eternal Life', category: 'biblical', synonyms: ['everlasting life', 'life after death', 'forever with god', 'immortality'] },
  { name: 'New Birth', category: 'biblical', synonyms: ['born again', 'being born again', 'new life in christ', 'regeneration', 'new creation'] },
  { name: 'Resurrection', category: 'biblical', synonyms: ['rising from the dead', 'risen', 'resurrected', 'the resurrection'] },
  { name: 'Incarnation', category: 'biblical', synonyms: ['god becoming man', 'word became flesh', 'jesus is god', 'god being with us', 'god with us'] },
  { name: 'Kingdom of God', category: 'biblical', synonyms: ['kingdom of heaven', 'gods kingdom', "god's kingdom", 'entering the kingdom of god', 'reign of god'] },
  { name: 'Gospel', category: 'biblical', synonyms: ['good news', 'evangel', 'the message of jesus'] },
  { name: 'Discipleship', category: 'biblical', synonyms: ['following christ', 'being a disciple', 'following jesus', 'disciples'] },
  { name: 'Evangelism', category: 'biblical', synonyms: ['mission', 'witnessing', 'sharing faith', 'sharing the gospel', 'the great commission', 'making disciples'] },
  { name: 'Holiness', category: 'biblical', synonyms: ['being holy', 'set apart', 'purity', 'consecration'] },
  { name: 'Righteousness', category: 'biblical', synonyms: ['being righteous', 'right living', 'uprightness'] },
  { name: 'Sin', category: 'biblical', synonyms: ['transgression', 'iniquity', 'sinfulness', 'sin nature', 'wrongdoing'] },
  { name: 'Judgment', category: 'biblical', synonyms: ['judgement', 'day of judgment', 'judgment day', 'final judgment', 'gods judgment'] },
  { name: 'Covenant', category: 'biblical', synonyms: ['gods promise', 'agreement', 'the new covenant', 'the old covenant'] },
  { name: "God's Sovereignty", category: 'biblical', synonyms: ['god is in control', 'sovereignty of god', 'gods will', 'gods plan', 'predestination', 'providence', 'omnipotence'] },
  { name: "God's Faithfulness", category: 'biblical', synonyms: ['faithfulness of god', 'god keeps his promises', 'promises of god', 'gods promises'] },
  { name: 'Holy Spirit', category: 'biblical', synonyms: ['the spirit', 'gods spirit', 'spirit of god', 'filled with the spirit', 'gifts of the spirit'] },
  { name: 'Spiritual Warfare', category: 'biblical', synonyms: ['the devil', 'satan', 'temptation', 'spiritual battle', 'fighting evil', 'the enemy'] },
  { name: 'Prophecy', category: 'biblical', synonyms: ['prophecies', 'foretelling', 'prophets', 'end times', 'second coming', 'the last days'] },
  { name: 'Heaven', category: 'biblical', synonyms: ['paradise', 'the afterlife'] },

  // ── Life / application ───────────────────────────────────────────────────────
  { name: 'Suffering', category: 'life', synonyms: ['pain', 'trials', 'hardship', 'affliction', 'going through hard times', 'persecution'] },
  { name: 'Grief', category: 'life', synonyms: ['mourning', 'sorrow', 'loss', 'grieving'] },
  { name: 'Fear', category: 'life', synonyms: ['anxiety', 'worry', 'being afraid', 'fear and anxiety', 'overcoming fear', 'stressed', 'overwhelmed', 'panic', 'freaking out', 'my anxiety'] },
  { name: 'Anger', category: 'life', synonyms: ['wrath', 'rage', 'being angry'] },
  { name: 'Pride', category: 'life', synonyms: ['arrogance', 'conceit', 'being prideful'] },
  { name: 'Wisdom', category: 'life', synonyms: ['understanding', 'insight', 'discernment', 'godly wisdom'] },
  { name: 'Stewardship', category: 'life', synonyms: ['money', 'finances', 'wealth', 'generosity', 'giving', 'managing money', 'tithing', 'bills', 'paycheck', 'budget', 'tight on money'] },
  { name: 'Work', category: 'life', synonyms: ['labor', 'employment', 'vocation', 'job', 'working hard', 'boss', 'coworker', '9 to 5', 'burnout'] },
  { name: 'Marriage', category: 'life', synonyms: ['wedding', 'spouse', 'husband and wife', 'a healthy marriage', 'married life', 'fighting with my wife', 'marriage struggles'] },
  { name: 'Family', category: 'life', synonyms: ['relatives', 'household', 'parents and children'] },
  { name: 'Parenting', category: 'life', synonyms: ['raising children', 'childrearing', 'fatherhood', 'motherhood', 'kids acting up', 'raising kids', 'teenagers'] },
  { name: 'Friendship', category: 'life', synonyms: ['companionship', 'fellowship', 'friends', 'small group'] },
  { name: 'Death', category: 'life', synonyms: ['dying', 'mortality', 'passing away'] },
  { name: 'Healing', category: 'life', synonyms: ['health', 'wellness', 'being healed', 'sickness', 'faith healing'] },
  { name: 'Justice', category: 'life', synonyms: ['fairness', 'doing justice', 'injustice', 'oppression'] },
  { name: 'Contentment', category: 'life', synonyms: ['satisfaction', 'being content', 'rest'] },
  { name: 'Provision', category: 'life', synonyms: ['gods provision', 'god provides', 'daily bread', 'gods care'] },
  { name: 'Identity in Christ', category: 'life', synonyms: ['who am i in christ', 'who i am in christ', 'identity'] },

  // ── Narrative / structural ───────────────────────────────────────────────────
  { name: 'Creation', category: 'narrative', synonyms: ['gods creation', 'god creating the world', 'creating the world', 'the creator', 'in the beginning', 'made the heavens and earth'] },
  { name: 'The Fall', category: 'narrative', synonyms: ['fall of man', 'adam and eve', 'the garden of eden', 'original sin', 'forbidden fruit'] },
  { name: 'The Flood', category: 'narrative', synonyms: ['noah', "noah's ark", 'the great flood'] },
  { name: 'The Exodus', category: 'narrative', synonyms: ['exodus from egypt', 'leaving egypt', 'the red sea', 'deliverance from egypt', 'out of egypt'] },
  { name: 'The Ten Commandments', category: 'narrative', synonyms: ['ten commandments', 'decalogue', 'the law of moses'] },
  { name: 'Wilderness Wandering', category: 'narrative', synonyms: ['the wilderness', 'wandering in the desert', 'forty years'] },
  { name: 'The Promised Land', category: 'narrative', synonyms: ['promised land', 'land of canaan', 'entering canaan'] },
  { name: 'The Exile', category: 'narrative', synonyms: ['babylon', 'babylonian exile', 'captivity', 'deportation'] },
  { name: 'Genealogy', category: 'narrative', synonyms: ['lineage', 'descendants', 'family line', 'ancestry', 'the generations of'] },
  { name: 'Birth of Jesus', category: 'narrative', synonyms: ['jesus birth', 'the nativity', 'born in bethlehem', 'the christ child', 'mary the mother of jesus'] },
  { name: 'Sermon on the Mount', category: 'narrative', synonyms: ['the beatitudes', 'beatitudes'] },
  { name: 'Parables', category: 'narrative', synonyms: ['parable', 'jesus teachings', 'stories jesus told'] },
  { name: 'Miracles', category: 'narrative', synonyms: ['miracle', 'wonders', 'signs and wonders'] },
  { name: 'The Passion', category: 'narrative', synonyms: ['suffering of christ', 'the cross', 'crucifixion', 'jesus death', 'death of jesus', 'good friday', 'calvary'] },
  { name: 'The Resurrection', category: 'narrative', synonyms: ['jesus rose', 'empty tomb', 'easter', 'risen lord'] },
  { name: 'The Early Church', category: 'narrative', synonyms: ['pentecost', 'the apostles', 'acts of the apostles', 'the first church'] },

  // ── Doctrinal / biblical (expanded) ──────────────────────────────────────────
  { name: 'Glory of God', category: 'biblical', synonyms: ['gods glory', "god's glory", 'the glory of the lord', 'gods majesty'] },
  { name: 'Holiness of God', category: 'biblical', synonyms: ['god is holy', 'gods holiness'] },
  { name: 'The Word of God', category: 'biblical', synonyms: ['scripture', 'gods word', 'the bible', 'reading the bible', 'the scriptures'] },
  { name: 'Fear of the Lord', category: 'biblical', synonyms: ['fearing god', 'reverence for god', 'godly fear'] },
  { name: 'Idolatry', category: 'biblical', synonyms: ['idols', 'false gods', 'worshiping idols', 'idol worship'] },
  { name: 'Temptation', category: 'biblical', synonyms: ['being tempted', 'resisting temptation'] },
  { name: 'The Church', category: 'biblical', synonyms: ['the body of christ', 'the local church', 'church life', 'gathering of believers'] },
  { name: 'Spiritual Gifts', category: 'biblical', synonyms: ['gifts of the spirit', 'using your gifts', 'spiritual gift'] },
  { name: 'Servanthood', category: 'biblical', synonyms: ['serving others', 'service', 'being a servant', 'servant leadership'] },
  { name: 'Generosity', category: 'biblical', synonyms: ['giving', 'tithing', 'cheerful giver', 'sharing with others'] },
  { name: 'Assurance', category: 'biblical', synonyms: ['assurance of salvation', 'eternal security', 'security in christ'] },
  { name: 'Perseverance', category: 'biblical', synonyms: ['endurance', 'standing firm', 'pressing on', 'finishing the race', 'not giving up'] },
  { name: 'Adoption', category: 'biblical', synonyms: ['children of god', 'sons of god', 'adopted by god', 'gods children'] },
  { name: 'Unity', category: 'biblical', synonyms: ['oneness', 'unity in the church', 'being united'] },
  { name: 'Sovereign Grace', category: 'biblical', synonyms: ['election', 'chosen by god', 'gods choosing'] },

  // ── Life / application (expanded) ────────────────────────────────────────────
  { name: 'Loving Your Enemies', category: 'life', synonyms: ['love your enemies', 'enemies', 'turning the other cheek'] },
  { name: 'Hospitality', category: 'life', synonyms: ['welcoming others', 'being hospitable'] },
  { name: 'Integrity', category: 'life', synonyms: ['honesty', 'character', 'being honest', 'uprightness'] },
  { name: 'Purity', category: 'life', synonyms: ['sexual purity', 'chastity', 'staying pure', 'lust'] },
  { name: 'Guidance', category: 'life', synonyms: ['gods guidance', 'gods will for my life', 'making decisions', 'direction from god', 'discerning gods will', 'what should i do', 'big decision'] },
  { name: 'Loneliness', category: 'life', synonyms: ['being lonely', 'isolation', 'feeling alone', 'no one gets it', 'left out'] },
  { name: 'Doubt', category: 'life', synonyms: ['doubting', 'questioning faith', 'struggling to believe'] },
  { name: 'Compassion', category: 'life', synonyms: ['caring for others', 'caring for the poor', 'helping the poor', 'mercy to others'] },
  { name: 'Rest', category: 'life', synonyms: ['resting in god', 'finding rest', 'gods rest'] },

  // ── Narrative / structural (expanded) ────────────────────────────────────────
  { name: "Abraham's Covenant", category: 'narrative', synonyms: ['gods promise to abraham', 'abrahamic covenant', 'the call of abraham'] },
  { name: 'The Tabernacle', category: 'narrative', synonyms: ['tabernacle', 'tent of meeting', 'the ark of the covenant'] },
  { name: 'The Temple', category: 'narrative', synonyms: ["solomon's temple", 'solomons temple', 'temple of solomon', 'rebuilding the temple', 'the second temple'] },
  { name: "David's Reign", category: 'narrative', synonyms: ['king david', 'davidic kingdom', 'davidic covenant'] },
  { name: 'The Prophets', category: 'narrative', synonyms: ['the prophet', 'prophetic word', 'words of the prophets'] },
  { name: 'The Last Supper', category: 'narrative', synonyms: ['upper room', 'the lord supper instituted', 'breaking bread together'] },
  { name: 'The Day of the Lord', category: 'narrative', synonyms: ['day of the lord', 'gods coming judgment', 'the great day'] },
  { name: 'The New Jerusalem', category: 'narrative', synonyms: ['new heaven and new earth', 'the holy city', 'new heavens and a new earth', 'eternity'] },
];

// Build a lookup from every name + synonym (normalized) to its subject.
function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/[''`]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const EXACT_INDEX = new Map<string, Subject>();
for (const subject of SUBJECT_VOCABULARY) {
  EXACT_INDEX.set(normalize(subject.name), subject);
  for (const syn of subject.synonyms) EXACT_INDEX.set(normalize(syn), subject);
}
// Phrase keys sorted longest-first for "contains" matching (prefer the most specific subject).
const PHRASE_KEYS = [...EXACT_INDEX.keys()].filter((k) => k.length >= 4).sort((a, b) => b.length - a.length);

/**
 * Map a raw label (an OpenBible topic, or a phrase from note prose) to a controlled Subject, or
 * null if it doesn't resolve to a real subject (which is how noise gets filtered out).
 */
export function mapToSubject(label: string): Subject | null {
  const norm = normalize(label);
  if (!norm) return null;
  const exact = EXACT_INDEX.get(norm);
  if (exact) return exact;
  // Contains a known phrase as a whole-word run (e.g. "the power of forgiveness" → Forgiveness).
  for (const key of PHRASE_KEYS) {
    if (norm === key || norm.includes(` ${key} `) || norm.startsWith(`${key} `) || norm.endsWith(` ${key}`)) {
      return EXACT_INDEX.get(key) ?? null;
    }
  }
  return null;
}

/**
 * Subjects a note's own text is *about* — scans free text for vocabulary names/synonyms appearing
 * as whole-word phrases, ranked by match strength (name match outweighs synonym). This is the
 * content side of folder suggestions: what the user actually wrote, mapped to clean subjects.
 */
export function contentSubjects(text: string): Subject[] {
  const padded = ` ${normalize(text)} `;
  if (padded.length <= 2) return [];
  const found = new Map<string, { subject: Subject; score: number }>();
  for (const subject of SUBJECT_VOCABULARY) {
    let score = 0;
    const terms: Array<[string, number]> = [[subject.name, 2], ...subject.synonyms.map((s) => [s, 1] as [string, number])];
    for (const [term, weight] of terms) {
      const t = normalize(term);
      if (t.length < 3) continue;
      if (padded.includes(` ${t} `)) score = Math.max(score, weight);
    }
    if (score > 0) found.set(subject.name, { subject, score });
  }
  return [...found.values()].sort((a, b) => b.score - a.score).map((f) => f.subject);
}
