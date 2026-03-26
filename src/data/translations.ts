/**
 * Bible translation registry.
 * Used for UI display, attribution rendering, and seeding BibleTranslations table.
 */

export interface TranslationInfo {
  id: string;
  name: string;
  abbreviation: string;
  publisher: string;
  copyright: string;
  website: string;
  isPublicDomain: boolean;
  sortOrder: number;
}

export const TRANSLATIONS: Record<string, TranslationInfo> = {
  KJV: {
    id: 'KJV',
    name: 'King James Version',
    abbreviation: 'KJV',
    publisher: 'Public Domain',
    copyright: 'The King James Version is in the public domain.',
    website: 'https://www.kingjamesbibleonline.org',
    isPublicDomain: true,
    sortOrder: 2,
  },
  NKJV: {
    id: 'NKJV',
    name: 'New King James Version',
    abbreviation: 'NKJV',
    publisher: 'Thomas Nelson',
    copyright:
      'Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.',
    website: 'https://www.thomasnelson.com/nkjv',
    isPublicDomain: false,
    sortOrder: 3,
  },
  ESV: {
    id: 'ESV',
    name: 'English Standard Version',
    abbreviation: 'ESV',
    publisher: 'Crossway',
    copyright:
      'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.',
    website: 'https://www.esv.org',
    isPublicDomain: false,
    sortOrder: 1,
  },
  NIV: {
    id: 'NIV',
    name: 'New International Version',
    abbreviation: 'NIV',
    publisher: 'Biblica / Zondervan',
    copyright:
      'Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.',
    website: 'https://www.thenivbible.com',
    isPublicDomain: false,
    sortOrder: 5,
  },
  NLT: {
    id: 'NLT',
    name: 'New Living Translation',
    abbreviation: 'NLT',
    publisher: 'Tyndale House',
    copyright:
      'Scripture quotations are taken from the Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved.',
    website: 'https://www.tyndale.com/nlt',
    isPublicDomain: false,
    sortOrder: 6,
  },
  NET: {
    id: 'NET',
    name: 'NET Bible',
    abbreviation: 'NET',
    publisher: 'Biblical Studies Press, L.L.C.',
    copyright:
      'Scripture quotations are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com All rights reserved.',
    website: 'https://netbible.org',
    isPublicDomain: false,
    sortOrder: 4,
  },
  BSB: {
    id: 'BSB',
    name: 'Berean Standard Bible',
    abbreviation: 'BSB',
    publisher: 'Bible Hub',
    copyright:
      'The Berean Bible (Berean Standard Bible BSB) © 2016, 2020 by Bible Hub and Berean.Bible. Free to use and share. All rights reserved.',
    website: 'https://berean.bible',
    isPublicDomain: false,
    sortOrder: 0,
  },
};

/** Ordered list of translation IDs for UI dropdowns */
export const TRANSLATION_ORDER = Object.values(TRANSLATIONS)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((t) => t.id);

/** Get translation info by ID, returns undefined if not found */
export function getTranslation(id: string): TranslationInfo | undefined {
  return TRANSLATIONS[id];
}
