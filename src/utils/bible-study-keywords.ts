// Bible Study Keywords for Auto-Tag Generation
// Organized by categories for better tag management

export interface BibleStudyKeyword {
  name: string;
  category: 'spiritual' | 'biblical' | 'character' | 'place' | 'book' | 'theme' | 'life';
  synonyms: string[];
  confidence: number; // Base confidence score (0-1)
}

export const BIBLE_STUDY_KEYWORDS: BibleStudyKeyword[] = [
  // Biblical Books
  { name: 'Genesis', category: 'book', synonyms: ['gen', 'first book'], confidence: 0.9 },
  { name: 'Exodus', category: 'book', synonyms: ['exo', 'second book'], confidence: 0.9 },
  { name: 'Leviticus', category: 'book', synonyms: ['lev', 'third book'], confidence: 0.9 },
  { name: 'Numbers', category: 'book', synonyms: ['num', 'fourth book'], confidence: 0.9 },
  { name: 'Deuteronomy', category: 'book', synonyms: ['deut', 'fifth book'], confidence: 0.9 },
  { name: 'Joshua', category: 'book', synonyms: ['josh'], confidence: 0.9 },
  { name: 'Judges', category: 'book', synonyms: ['judg'], confidence: 0.9 },
  { name: 'Ruth', category: 'book', synonyms: [], confidence: 0.9 },
  { name: '1 Samuel', category: 'book', synonyms: ['1 sam', 'first samuel'], confidence: 0.9 },
  { name: '2 Samuel', category: 'book', synonyms: ['2 sam', 'second samuel'], confidence: 0.9 },
  { name: '1 Kings', category: 'book', synonyms: ['1 kgs', 'first kings'], confidence: 0.9 },
  { name: '2 Kings', category: 'book', synonyms: ['2 kgs', 'second kings'], confidence: 0.9 },
  { name: '1 Chronicles', category: 'book', synonyms: ['1 chron', 'first chronicles'], confidence: 0.9 },
  { name: '2 Chronicles', category: 'book', synonyms: ['2 chron', 'second chronicles'], confidence: 0.9 },
  { name: 'Ezra', category: 'book', synonyms: [], confidence: 0.9 },
  { name: 'Nehemiah', category: 'book', synonyms: ['neh'], confidence: 0.9 },
  { name: 'Esther', category: 'book', synonyms: ['esth'], confidence: 0.9 },
  { name: 'Job', category: 'book', synonyms: [], confidence: 0.9 },
  { name: 'Psalms', category: 'book', synonyms: ['psalm', 'ps'], confidence: 0.9 },
  { name: 'Proverbs', category: 'book', synonyms: ['prov', 'proverb'], confidence: 0.9 },
  { name: 'Ecclesiastes', category: 'book', synonyms: ['eccl', 'ecc'], confidence: 0.9 },
  { name: 'Song of Songs', category: 'book', synonyms: ['song of solomon', 'sos'], confidence: 0.9 },
  { name: 'Isaiah', category: 'book', synonyms: ['isa'], confidence: 0.9 },
  { name: 'Jeremiah', category: 'book', synonyms: ['jer'], confidence: 0.9 },
  { name: 'Lamentations', category: 'book', synonyms: ['lam'], confidence: 0.9 },
  { name: 'Ezekiel', category: 'book', synonyms: ['ezek'], confidence: 0.9 },
  { name: 'Daniel', category: 'book', synonyms: ['dan'], confidence: 0.9 },
  { name: 'Hosea', category: 'book', synonyms: ['hos'], confidence: 0.9 },
  { name: 'Joel', category: 'book', synonyms: [], confidence: 0.9 },
  { name: 'Amos', category: 'book', synonyms: [], confidence: 0.9 },
  { name: 'Obadiah', category: 'book', synonyms: ['obad'], confidence: 0.9 },
  { name: 'Jonah', category: 'book', synonyms: [], confidence: 0.9 },
  { name: 'Micah', category: 'book', synonyms: ['mic'], confidence: 0.9 },
  { name: 'Nahum', category: 'book', synonyms: ['nah'], confidence: 0.9 },
  { name: 'Habakkuk', category: 'book', synonyms: ['hab'], confidence: 0.9 },
  { name: 'Zephaniah', category: 'book', synonyms: ['zeph'], confidence: 0.9 },
  { name: 'Haggai', category: 'book', synonyms: ['hag'], confidence: 0.9 },
  { name: 'Zechariah', category: 'book', synonyms: ['zech'], confidence: 0.9 },
  { name: 'Malachi', category: 'book', synonyms: ['mal'], confidence: 0.9 },
  { name: 'Matthew', category: 'book', synonyms: ['matt', 'mt'], confidence: 0.9 },
  { name: 'Mark', category: 'book', synonyms: ['mk', 'mr'], confidence: 0.9 },
  { name: 'Luke', category: 'book', synonyms: ['lk'], confidence: 0.9 },
  { name: 'John', category: 'book', synonyms: ['jn'], confidence: 0.9 },
  { name: 'Acts', category: 'book', synonyms: ['acts of the apostles'], confidence: 0.9 },
  { name: 'Romans', category: 'book', synonyms: ['rom'], confidence: 0.9 },
  { name: '1 Corinthians', category: 'book', synonyms: ['1 cor', 'first corinthians'], confidence: 0.9 },
  { name: '2 Corinthians', category: 'book', synonyms: ['2 cor', 'second corinthians'], confidence: 0.9 },
  { name: 'Galatians', category: 'book', synonyms: ['gal'], confidence: 0.9 },
  { name: 'Ephesians', category: 'book', synonyms: ['eph'], confidence: 0.9 },
  { name: 'Philippians', category: 'book', synonyms: ['phil'], confidence: 0.9 },
  { name: 'Colossians', category: 'book', synonyms: ['col'], confidence: 0.9 },
  { name: '1 Thessalonians', category: 'book', synonyms: ['1 thess', 'first thessalonians'], confidence: 0.9 },
  { name: '2 Thessalonians', category: 'book', synonyms: ['2 thess', 'second thessalonians'], confidence: 0.9 },
  { name: '1 Timothy', category: 'book', synonyms: ['1 tim', 'first timothy'], confidence: 0.9 },
  { name: '2 Timothy', category: 'book', synonyms: ['2 tim', 'second timothy'], confidence: 0.9 },
  { name: 'Titus', category: 'book', synonyms: [], confidence: 0.9 },
  { name: 'Philemon', category: 'book', synonyms: ['phlm'], confidence: 0.9 },
  { name: 'Hebrews', category: 'book', synonyms: ['heb'], confidence: 0.9 },
  { name: 'James', category: 'book', synonyms: ['jas'], confidence: 0.9 },
  { name: '1 Peter', category: 'book', synonyms: ['1 pet', 'first peter'], confidence: 0.9 },
  { name: '2 Peter', category: 'book', synonyms: ['2 pet', 'second peter'], confidence: 0.9 },
  { name: '1 John', category: 'book', synonyms: ['1 jn', 'first john'], confidence: 0.9 },
  { name: '2 John', category: 'book', synonyms: ['2 jn', 'second john'], confidence: 0.9 },
  { name: '3 John', category: 'book', synonyms: ['3 jn', 'third john'], confidence: 0.9 },
  { name: 'Jude', category: 'book', synonyms: [], confidence: 0.9 },
  { name: 'Revelation', category: 'book', synonyms: ['rev', 'apocalypse'], confidence: 0.9 },

  // Biblical Characters
  { name: 'Jesus', category: 'character', synonyms: ['christ', 'jesus christ', 'lord', 'savior', 'messiah'], confidence: 0.95 },
  { name: 'God', category: 'character', synonyms: ['lord', 'father', 'almighty', 'creator'], confidence: 0.95 },
  { name: 'Holy Spirit', category: 'character', synonyms: ['spirit', 'holy ghost', 'comforter'], confidence: 0.9 },
  { name: 'Moses', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Abraham', category: 'character', synonyms: ['abram'], confidence: 0.9 },
  { name: 'David', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Paul', category: 'character', synonyms: ['apostle paul', 'saul'], confidence: 0.9 },
  { name: 'Peter', category: 'character', synonyms: ['simon peter', 'simon'], confidence: 0.9 },
  { name: 'John', category: 'character', synonyms: ['apostle john', 'john the apostle'], confidence: 0.9 },
  { name: 'Mary', category: 'character', synonyms: ['virgin mary', 'mary mother of jesus'], confidence: 0.9 },
  { name: 'Noah', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Adam', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Eve', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Joseph', category: 'character', synonyms: ['joseph son of jacob', 'joseph of egypt'], confidence: 0.9 },
  { name: 'Jacob', category: 'character', synonyms: ['israel'], confidence: 0.9 },
  { name: 'Isaac', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Sarah', category: 'character', synonyms: ['sarah wife of abraham'], confidence: 0.9 },
  { name: 'Elijah', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Elisha', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Daniel', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Esther', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Ruth', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Samson', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Samuel', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Solomon', category: 'character', synonyms: [], confidence: 0.9 },
  { name: 'Isaiah', category: 'character', synonyms: ['prophet isaiah'], confidence: 0.9 },
  { name: 'Jeremiah', category: 'character', synonyms: ['prophet jeremiah'], confidence: 0.9 },
  { name: 'Ezekiel', category: 'character', synonyms: ['prophet ezekiel'], confidence: 0.9 },
  { name: 'Daniel', category: 'character', synonyms: ['prophet daniel'], confidence: 0.9 },
  { name: 'Jonah', category: 'character', synonyms: ['prophet jonah'], confidence: 0.9 },
  { name: 'John the Baptist', category: 'character', synonyms: ['john baptist', 'baptist'], confidence: 0.9 },
  { name: 'Mary Magdalene', category: 'character', synonyms: ['magdalene'], confidence: 0.9 },
  { name: 'Thomas', category: 'character', synonyms: ['doubting thomas'], confidence: 0.9 },
  { name: 'Judas', category: 'character', synonyms: ['judas iscariot'], confidence: 0.9 },
  { name: 'Pilate', category: 'character', synonyms: ['pontius pilate'], confidence: 0.9 },

  // Biblical Places
  { name: 'Jerusalem', category: 'place', synonyms: ['holy city', 'zion'], confidence: 0.9 },
  { name: 'Bethlehem', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Nazareth', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Galilee', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Capernaum', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Gethsemane', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Golgotha', category: 'place', synonyms: ['calvary'], confidence: 0.9 },
  { name: 'Garden of Eden', category: 'place', synonyms: ['eden'], confidence: 0.9 },
  { name: 'Mount Sinai', category: 'place', synonyms: ['sinai'], confidence: 0.9 },
  { name: 'Red Sea', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Jordan River', category: 'place', synonyms: ['jordan'], confidence: 0.9 },
  { name: 'Dead Sea', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Mount of Olives', category: 'place', synonyms: ['olives'], confidence: 0.9 },
  { name: 'Temple', category: 'place', synonyms: ['jerusalem temple', 'holy temple'], confidence: 0.9 },
  { name: 'Rome', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Corinth', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Ephesus', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Philippi', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Thessalonica', category: 'place', synonyms: [], confidence: 0.9 },
  { name: 'Antioch', category: 'place', synonyms: [], confidence: 0.9 },

  // Spiritual Themes
  { name: 'Prayer', category: 'spiritual', synonyms: ['praying', 'intercession', 'petition'], confidence: 0.8 },
  { name: 'Faith', category: 'spiritual', synonyms: ['belief', 'trust', 'confidence'], confidence: 0.8 },
  { name: 'Love', category: 'spiritual', synonyms: ['charity', 'agape', 'compassion'], confidence: 0.8 },
  { name: 'Hope', category: 'spiritual', synonyms: ['expectation', 'anticipation'], confidence: 0.8 },
  { name: 'Grace', category: 'spiritual', synonyms: ['favor', 'mercy', 'unmerited favor'], confidence: 0.8 },
  { name: 'Mercy', category: 'spiritual', synonyms: ['compassion', 'forgiveness', 'pity'], confidence: 0.8 },
  { name: 'Forgiveness', category: 'spiritual', synonyms: ['pardon', 'absolution', 'reconciliation'], confidence: 0.8 },
  { name: 'Salvation', category: 'spiritual', synonyms: ['redemption', 'deliverance', 'rescue'], confidence: 0.8 },
  { name: 'Repentance', category: 'spiritual', synonyms: ['turning', 'conversion', 'change of heart'], confidence: 0.8 },
  { name: 'Worship', category: 'spiritual', synonyms: ['praise', 'adoration', 'reverence'], confidence: 0.8 },
  { name: 'Praise', category: 'spiritual', synonyms: ['worship', 'glorify', 'exalt'], confidence: 0.8 },
  { name: 'Thanksgiving', category: 'spiritual', synonyms: ['gratitude', 'thankfulness'], confidence: 0.8 },
  { name: 'Peace', category: 'spiritual', synonyms: ['tranquility', 'serenity', 'shalom'], confidence: 0.8 },
  { name: 'Joy', category: 'spiritual', synonyms: ['gladness', 'happiness', 'rejoicing'], confidence: 0.8 },
  { name: 'Patience', category: 'spiritual', synonyms: ['endurance', 'perseverance', 'longsuffering'], confidence: 0.8 },
  { name: 'Kindness', category: 'spiritual', synonyms: ['gentleness', 'goodness', 'compassion'], confidence: 0.8 },
  { name: 'Goodness', category: 'spiritual', synonyms: ['virtue', 'righteousness', 'moral excellence'], confidence: 0.8 },
  { name: 'Faithfulness', category: 'spiritual', synonyms: ['loyalty', 'reliability', 'steadfastness'], confidence: 0.8 },
  { name: 'Gentleness', category: 'spiritual', synonyms: ['meekness', 'humility', 'mildness'], confidence: 0.8 },
  { name: 'Self-control', category: 'spiritual', synonyms: ['temperance', 'discipline', 'restraint'], confidence: 0.8 },

  // Biblical Themes
  { name: 'Covenant', category: 'biblical', synonyms: ['agreement', 'promise', 'pact'], confidence: 0.8 },
  { name: 'Redemption', category: 'biblical', synonyms: ['salvation', 'deliverance', 'ransom'], confidence: 0.8 },
  { name: 'Atonement', category: 'biblical', synonyms: ['reconciliation', 'propitiation'], confidence: 0.8 },
  { name: 'Resurrection', category: 'biblical', synonyms: ['rising', 'new life'], confidence: 0.8 },
  { name: 'Incarnation', category: 'biblical', synonyms: ['god becoming man', 'enfleshment'], confidence: 0.8 },
  { name: 'Trinity', category: 'biblical', synonyms: ['godhead', 'three in one'], confidence: 0.8 },
  { name: 'Kingdom of God', category: 'biblical', synonyms: ['kingdom of heaven', 'god\'s kingdom'], confidence: 0.8 },
  { name: 'Gospel', category: 'biblical', synonyms: ['good news', 'evangel'], confidence: 0.8 },
  { name: 'Discipleship', category: 'biblical', synonyms: ['following christ', 'being a disciple'], confidence: 0.8 },
  { name: 'Mission', category: 'biblical', synonyms: ['evangelism', 'witnessing', 'sharing faith'], confidence: 0.8 },
  { name: 'Parables', category: 'biblical', synonyms: ['stories', 'teachings'], confidence: 0.8 },
  { name: 'Miracles', category: 'biblical', synonyms: ['wonders', 'signs'], confidence: 0.8 },
  { name: 'Prophecy', category: 'biblical', synonyms: ['prophecies', 'foretelling'], confidence: 0.8 },
  { name: 'Law', category: 'biblical', synonyms: ['commandments', 'statutes'], confidence: 0.8 },
  { name: 'Sacrifice', category: 'biblical', synonyms: ['offering', 'giving up'], confidence: 0.8 },
  { name: 'Temple', category: 'biblical', synonyms: ['sanctuary', 'holy place'], confidence: 0.8 },
  { name: 'Sabbath', category: 'biblical', synonyms: ['rest', 'day of rest'], confidence: 0.8 },
  { name: 'Baptism', category: 'biblical', synonyms: ['immersion', 'washing'], confidence: 0.8 },
  { name: 'Communion', category: 'biblical', synonyms: ['lord\'s supper', 'eucharist'], confidence: 0.8 },
  { name: 'Marriage', category: 'biblical', synonyms: ['wedding', 'union'], confidence: 0.8 },

  // Life Themes
  { name: 'Family', category: 'life', synonyms: ['relatives', 'household'], confidence: 0.7 },
  { name: 'Marriage', category: 'life', synonyms: ['wedding', 'union', 'relationship'], confidence: 0.7 },
  { name: 'Parenting', category: 'life', synonyms: ['childrearing', 'raising children'], confidence: 0.7 },
  { name: 'Friendship', category: 'life', synonyms: ['companionship', 'fellowship'], confidence: 0.7 },
  { name: 'Work', category: 'life', synonyms: ['labor', 'employment', 'vocation'], confidence: 0.7 },
  { name: 'Money', category: 'life', synonyms: ['finances', 'wealth', 'prosperity'], confidence: 0.7 },
  { name: 'Health', category: 'life', synonyms: ['wellness', 'healing'], confidence: 0.7 },
  { name: 'Suffering', category: 'life', synonyms: ['pain', 'trial', 'hardship'], confidence: 0.7 },
  { name: 'Death', category: 'life', synonyms: ['dying', 'mortality'], confidence: 0.7 },
  { name: 'Grief', category: 'life', synonyms: ['mourning', 'sorrow', 'loss'], confidence: 0.7 },
  { name: 'Fear', category: 'life', synonyms: ['anxiety', 'worry', 'concern'], confidence: 0.7 },
  { name: 'Anger', category: 'life', synonyms: ['wrath', 'rage', 'fury'], confidence: 0.7 },
  { name: 'Pride', category: 'life', synonyms: ['arrogance', 'conceit', 'vanity'], confidence: 0.7 },
  { name: 'Humility', category: 'life', synonyms: ['meekness', 'modesty'], confidence: 0.7 },
  { name: 'Wisdom', category: 'life', synonyms: ['understanding', 'insight'], confidence: 0.7 },
  { name: 'Knowledge', category: 'life', synonyms: ['learning', 'education'], confidence: 0.7 },
  { name: 'Truth', category: 'life', synonyms: ['honesty', 'veracity'], confidence: 0.7 },
  { name: 'Justice', category: 'life', synonyms: ['righteousness', 'fairness'], confidence: 0.7 },
  { name: 'Peace', category: 'life', synonyms: ['harmony', 'tranquility'], confidence: 0.7 },
  { name: 'Hope', category: 'life', synonyms: ['optimism', 'expectation'], confidence: 0.7 },
];

// Helper function to find keywords in text
export function findKeywordsInText(text: string): Array<{ keyword: BibleStudyKeyword; confidence: number }> {
  const foundKeywords: Array<{ keyword: BibleStudyKeyword; confidence: number }> = [];
  const textLower = text.toLowerCase();
  
  for (const keyword of BIBLE_STUDY_KEYWORDS) {
    let found = false;
    let confidence = keyword.confidence;
    
    // Check main name with word boundaries for book names and character names to prevent false positives
    const keywordLower = keyword.name.toLowerCase();
    if (keyword.category === 'book' || keyword.category === 'character') {
      // For book names and character names, use word boundaries to prevent partial matches
      const regex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (regex.test(textLower)) {
        found = true;
        confidence = keyword.confidence;
        // Keyword found with word boundaries
      }
    } else {
      // For other keywords (spiritual themes), use simple includes
      if (textLower.includes(keywordLower)) {
        found = true;
        confidence = keyword.confidence;
      }
    }
    
    // Check synonyms with word boundaries for book names and character names
    for (const synonym of keyword.synonyms) {
      if (keyword.category === 'book' || keyword.category === 'character') {
        // For book and character synonyms, use word boundaries to prevent false positives
        const synonymRegex = new RegExp(`\\b${synonym.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (synonymRegex.test(textLower)) {
          found = true;
          confidence = Math.max(confidence, keyword.confidence * 0.8);
          // Keyword found via synonym
        }
      } else {
        // For other keywords, use simple includes
        if (textLower.includes(synonym.toLowerCase())) {
          found = true;
          confidence = Math.max(confidence, keyword.confidence * 0.8);
        }
      }
    }
    
    if (found) {
      foundKeywords.push({ keyword, confidence });
    }
  }
  
  // Sort by confidence (highest first)
  return foundKeywords.sort((a, b) => b.confidence - a.confidence);
}

// Helper function to get keywords by category
export function getKeywordsByCategory(category: string): BibleStudyKeyword[] {
  return BIBLE_STUDY_KEYWORDS.filter(k => k.category === category);
}

// Helper function to get all categories
export function getCategories(): string[] {
  return [...new Set(BIBLE_STUDY_KEYWORDS.map(k => k.category))];
}
