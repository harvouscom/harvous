/**
 * The Lectionary for Mass (USA, 2002): weekdays of Advent, Christmas, Lent and Easter. The same
 * every year (no Year I/II), so each day has one entry. Conventions as in
 * `sundays-and-solemnities.ts`; where the Lectionary offers a choice, the first.
 *
 * Keys: `advent-<week>-<day>` to December 16, then `advent-dec-<date>`; `christmas-dec-<date>`
 * and `christmas-jan-<date>` before the Epiphany, `after-epiphany-<day>` after it (the US
 * keeps the Epiphany on a Sunday); `lent-0-<day>` after Ash Wednesday, `lent-<week>-<day>`,
 * `holy-<day>`; `easter-1-<day>` is the Octave.
 */
import type { LectionaryDayReadings, LectionaryEntry } from './sundays-and-solemnities';

const w = (n: number, first: string, psalm: string, gospel: string, text?: LectionaryEntry['text']): LectionaryDayReadings => ({
  all: { n, first, psalm, gospel, ...(text ? { text } : {}) },
});

export const SEASONAL_WEEKDAYS: Record<string, LectionaryDayReadings> = {
  // ── Advent, to December 16 ────────────────────────────────────────────────
  'advent-1-mon': w(175, 'Isaiah 2:1-5', 'Psalm 122:1-2, 3-4b, 4cd-5, 6-7, 8-9', 'Matthew 8:5-11'),
  'advent-1-tue': w(176, 'Isaiah 11:1-10', 'Psalm 72:1-2, 7-8, 12-13, 17', 'Luke 10:21-24'),
  'advent-1-wed': w(177, 'Isaiah 25:6-10a', 'Psalm 23:1-3a, 3b-4, 5, 6', 'Matthew 15:29-37'),
  'advent-1-thu': w(178, 'Isaiah 26:1-6', 'Psalm 118:1, 8-9, 19-21, 25-27a', 'Matthew 7:21, 24-27'),
  'advent-1-fri': w(179, 'Isaiah 29:17-24', 'Psalm 27:1, 4, 13-14', 'Matthew 9:27-31'),
  'advent-1-sat': w(180, 'Isaiah 30:19-21, 23-26', 'Psalm 147:1-2, 3-4, 5-6', 'Matthew 9:35—10:1, 5a, 6-8'),
  'advent-2-mon': w(181, 'Isaiah 35:1-10', 'Psalm 85:9ab, 10, 11-12, 13-14', 'Luke 5:17-26'),
  'advent-2-tue': w(182, 'Isaiah 40:1-11', 'Psalm 96:1-2, 3, 10ac, 11-12, 13', 'Matthew 18:12-14'),
  'advent-2-wed': w(183, 'Isaiah 40:25-31', 'Psalm 103:1-2, 3-4, 8, 10', 'Matthew 11:28-30'),
  'advent-2-thu': w(184, 'Isaiah 41:13-20', 'Psalm 145:1, 9, 10-11, 12-13ab', 'Matthew 11:11-15'),
  'advent-2-fri': w(185, 'Isaiah 48:17-19', 'Psalm 1:1-2, 3, 4, 6', 'Matthew 11:16-19'),
  'advent-2-sat': w(186, 'Sirach 48:1-4, 9-11', 'Psalm 80:2ac, 3b, 15-16, 18-19', 'Matthew 17:9a, 10-13'),
  'advent-3-mon': w(187, 'Numbers 24:2-7, 15-17a', 'Psalm 25:4-5ab, 6, 7bc, 8-9', 'Matthew 21:23-27'),
  'advent-3-tue': w(188, 'Zephaniah 3:1-2, 9-13', 'Psalm 34:2-3, 6-7, 17-18, 19, 23', 'Matthew 21:28-32'),
  'advent-3-wed': w(189, 'Isaiah 45:6c-8, 18, 21c-25', 'Psalm 85:9ab, 10, 11-12, 13-14', 'Luke 7:18b-23'),
  'advent-3-thu': w(190, 'Isaiah 54:1-10', 'Psalm 30:2, 4, 5-6, 11-12a, 13b', 'Luke 7:24-30'),
  'advent-3-fri': w(191, 'Isaiah 56:1-3a, 6-8', 'Psalm 67:2-3, 5, 7-8', 'John 5:33-36'),

  // ── Advent, December 17–24 ────────────────────────────────────────────────
  'advent-dec-17': w(193, 'Genesis 49:2, 8-10', 'Psalm 72:1-2, 3-4ab, 7-8, 17', 'Matthew 1:1-17'),
  'advent-dec-18': w(194, 'Jeremiah 23:5-8', 'Psalm 72:1-2, 12-13, 18-19', 'Matthew 1:18-25'),
  'advent-dec-19': w(195, 'Judges 13:2-7, 24-25a', 'Psalm 71:3-4a, 5-6ab, 16-17', 'Luke 1:5-25'),
  'advent-dec-20': w(196, 'Isaiah 7:10-14', 'Psalm 24:1-2, 3-4ab, 5-6', 'Luke 1:26-38'),
  'advent-dec-21': w(197, 'Song of Solomon 2:8-14', 'Psalm 33:2-3, 11-12, 20-21', 'Luke 1:39-45'),
  'advent-dec-22': w(198, '1 Samuel 1:24-28', '1 Samuel 2:1, 4-5, 6-7, 8abcd', 'Luke 1:46-56'),
  'advent-dec-23': w(199, 'Malachi 3:1-4, 23-24', 'Psalm 25:4-5ab, 8-9, 10, 14', 'Luke 1:57-66'),
  /** The Mass in the morning. */
  'advent-dec-24': w(200, '2 Samuel 7:1-5, 8b-12, 14a, 16', 'Psalm 89:2-3, 4-5, 27, 29', 'Luke 1:67-79'),

  // ── Christmas ─────────────────────────────────────────────────────────────
  'christmas-dec-29': w(202, '1 John 2:3-11', 'Psalm 96:1-2a, 2b-3, 5b-6', 'Luke 2:22-35'),
  'christmas-dec-30': w(203, '1 John 2:12-17', 'Psalm 96:7-8a, 8b-9, 10', 'Luke 2:36-40'),
  'christmas-dec-31': w(204, '1 John 2:18-21', 'Psalm 96:1-2, 11-12, 13', 'John 1:1-18'),
  'christmas-jan-2': w(205, '1 John 2:22-28', 'Psalm 98:1, 2-3ab, 3cd-4', 'John 1:19-28'),
  'christmas-jan-3': w(206, '1 John 2:29—3:6', 'Psalm 98:1, 3cd-4, 5-6', 'John 1:29-34'),
  'christmas-jan-4': w(207, '1 John 3:7-10', 'Psalm 98:1, 7-8, 9', 'John 1:35-42'),
  'christmas-jan-5': w(208, '1 John 3:11-21', 'Psalm 100:1b-2, 3, 4, 5', 'John 1:43-51'),
  'christmas-jan-6': w(209, '1 John 5:5-13', 'Psalm 147:12-13, 14-15, 19-20', 'Mark 1:7-11'),
  'christmas-jan-7': w(210, '1 John 5:14-21', 'Psalm 149:1-2, 3-4, 5, 6a, 9b', 'John 2:1-11'),
  'after-epiphany-mon': w(212, '1 John 3:22—4:6', 'Psalm 2:7bc-8, 10-12a', 'Matthew 4:12-17, 23-25'),
  'after-epiphany-tue': w(213, '1 John 4:7-10', 'Psalm 72:1-2, 3-4, 7-8', 'Mark 6:34-44'),
  'after-epiphany-wed': w(214, '1 John 4:11-18', 'Psalm 72:1-2, 10, 12-13', 'Mark 6:45-52'),
  'after-epiphany-thu': w(215, '1 John 4:19—5:4', 'Psalm 72:1-2, 14, 15bc, 17', 'Luke 4:14-22a'),
  'after-epiphany-fri': w(216, '1 John 5:5-13', 'Psalm 147:12-13, 14-15, 19-20', 'Luke 5:12-16'),
  'after-epiphany-sat': w(217, '1 John 5:14-21', 'Psalm 149:1-2, 3-4, 5, 6a, 9b', 'John 3:22-30'),

  // ── Lent ──────────────────────────────────────────────────────────────────
  'lent-0-thu': w(220, 'Deuteronomy 30:15-20', 'Psalm 1:1-2, 3, 4, 6', 'Luke 9:22-25'),
  'lent-0-fri': w(221, 'Isaiah 58:1-9a', 'Psalm 51:3-4, 5-6ab, 18-19', 'Matthew 9:14-15'),
  'lent-0-sat': w(222, 'Isaiah 58:9b-14', 'Psalm 86:1-2, 3-4, 5-6', 'Luke 5:27-32'),
  'lent-1-mon': w(224, 'Leviticus 19:1-2, 11-18', 'Psalm 19:8, 9, 10, 15', 'Matthew 25:31-46'),
  'lent-1-tue': w(225, 'Isaiah 55:10-11', 'Psalm 34:4-5, 6-7, 16-17, 18-19', 'Matthew 6:7-15'),
  'lent-1-wed': w(226, 'Jonah 3:1-10', 'Psalm 51:3-4, 12-13, 18-19', 'Luke 11:29-32'),
  /** Esther's prayer, the Greek Addition C, which Harvous keeps in the Vulgate's place (14:1–19). */
  'lent-1-thu': w(227, 'Esther C:12, 14-16, 23-25', 'Psalm 138:1-2ab, 2cde-3, 7c-8', 'Matthew 7:7-12', {
    first: 'Esther 14:1-14',
  }),
  'lent-1-fri': w(228, 'Ezekiel 18:21-28', 'Psalm 130:1-2, 3-4, 5-7a, 7bc-8', 'Matthew 5:20-26'),
  'lent-1-sat': w(229, 'Deuteronomy 26:16-19', 'Psalm 119:1-2, 4-5, 7-8', 'Matthew 5:43-48'),
  'lent-2-mon': w(230, 'Daniel 9:4b-10', 'Psalm 79:8, 9, 11, 13', 'Luke 6:36-38'),
  'lent-2-tue': w(231, 'Isaiah 1:10, 16-20', 'Psalm 50:8-9, 16bc-17, 21, 23', 'Matthew 23:1-12'),
  'lent-2-wed': w(232, 'Jeremiah 18:18-20', 'Psalm 31:5-6, 14, 15-16', 'Matthew 20:17-28'),
  'lent-2-thu': w(233, 'Jeremiah 17:5-10', 'Psalm 1:1-2, 3, 4, 6', 'Luke 16:19-31'),
  'lent-2-fri': w(234, 'Genesis 37:3-4, 12-13a, 17b-28a', 'Psalm 105:16-17, 18-19, 20-21', 'Matthew 21:33-43, 45-46'),
  'lent-2-sat': w(235, 'Micah 7:14-15, 18-20', 'Psalm 103:1-2, 3-4, 9-10, 11-12', 'Luke 15:1-3, 11-32'),
  'lent-3-mon': w(237, '2 Kings 5:1-15ab', 'Psalm 42:2, 3; 43:3, 4', 'Luke 4:24-30'),
  'lent-3-tue': w(238, 'Daniel 3:25, 34-43', 'Psalm 25:4-5ab, 6, 7bc, 8-9', 'Matthew 18:21-35'),
  'lent-3-wed': w(239, 'Deuteronomy 4:1, 5-9', 'Psalm 147:12-13, 15-16, 19-20', 'Matthew 5:17-19'),
  'lent-3-thu': w(240, 'Jeremiah 7:23-28', 'Psalm 95:1-2, 6-7, 8-9', 'Luke 11:14-23'),
  'lent-3-fri': w(241, 'Hosea 14:2-10', 'Psalm 81:6c-8a, 8bc-9, 10-11ab, 14, 17', 'Mark 12:28-34'),
  'lent-3-sat': w(242, 'Hosea 6:1-6', 'Psalm 51:3-4, 18-19, 20-21ab', 'Luke 18:9-14'),
  'lent-4-mon': w(244, 'Isaiah 65:17-21', 'Psalm 30:2, 4, 5-6, 11-12a, 13b', 'John 4:43-54'),
  'lent-4-tue': w(245, 'Ezekiel 47:1-9, 12', 'Psalm 46:2-3, 5-6, 8-9', 'John 5:1-3a, 5-16'),
  'lent-4-wed': w(246, 'Isaiah 49:8-15', 'Psalm 145:8-9, 13cd-14, 17-18', 'John 5:17-30'),
  'lent-4-thu': w(247, 'Exodus 32:7-14', 'Psalm 106:19-20, 21-22, 23', 'John 5:31-47'),
  'lent-4-fri': w(248, 'Wisdom 2:1a, 12-22', 'Psalm 34:17-18, 19-20, 21, 23', 'John 7:1-2, 10, 25-30'),
  'lent-4-sat': w(249, 'Jeremiah 11:18-20', 'Psalm 7:2-3, 9bc-10, 11-12', 'John 7:40-53'),
  'lent-5-mon': w(251, 'Daniel 13:1-9, 15-17, 19-30, 33-62', 'Psalm 23:1-3a, 3b-4, 5, 6', 'John 8:1-11'),
  'lent-5-tue': w(252, 'Numbers 21:4-9', 'Psalm 102:2-3, 16-18, 19-21', 'John 8:21-30'),
  'lent-5-wed': w(253, 'Daniel 3:14-20, 91-92, 95', 'Daniel 3:52, 53, 54, 55, 56', 'John 8:31-42'),
  'lent-5-thu': w(254, 'Genesis 17:3-9', 'Psalm 105:4-5, 6-7, 8-9', 'John 8:51-59'),
  'lent-5-fri': w(255, 'Jeremiah 20:10-13', 'Psalm 18:2-3a, 3bc-4, 5-6, 7', 'John 10:31-42'),
  'lent-5-sat': w(256, 'Ezekiel 37:21-28', 'Jeremiah 31:10, 11-12abcd, 13', 'John 11:45-56'),
  'holy-mon': w(257, 'Isaiah 42:1-7', 'Psalm 27:1, 2, 3, 13-14', 'John 12:1-11'),
  'holy-tue': w(258, 'Isaiah 49:1-6', 'Psalm 71:1-2, 3-4a, 5ab-6ab, 15, 17', 'John 13:21-33, 36-38'),
  'holy-wed': w(259, 'Isaiah 50:4-9a', 'Psalm 69:8-10, 21-22, 31, 33-34', 'Matthew 26:14-25'),

  // ── Easter ────────────────────────────────────────────────────────────────
  'easter-1-mon': w(261, 'Acts 2:14, 22-33', 'Psalm 16:1-2a, 5, 7-8, 9-10, 11', 'Matthew 28:8-15'),
  'easter-1-tue': w(262, 'Acts 2:36-41', 'Psalm 33:4-5, 18-19, 20, 22', 'John 20:11-18'),
  'easter-1-wed': w(263, 'Acts 3:1-10', 'Psalm 105:1-2, 3-4, 6-7, 8-9', 'Luke 24:13-35'),
  'easter-1-thu': w(264, 'Acts 3:11-26', 'Psalm 8:2ab, 5, 6-7, 8-9', 'Luke 24:35-48'),
  'easter-1-fri': w(265, 'Acts 4:1-12', 'Psalm 118:1-2, 4, 22-24, 25-27a', 'John 21:1-14'),
  'easter-1-sat': w(266, 'Acts 4:13-21', 'Psalm 118:1, 14-15ab, 16-18, 19-21', 'Mark 16:9-15'),
  'easter-2-mon': w(267, 'Acts 4:23-31', 'Psalm 2:1-3, 4-7a, 7b-9', 'John 3:1-8'),
  'easter-2-tue': w(268, 'Acts 4:32-37', 'Psalm 93:1ab, 1cd-2, 5', 'John 3:7b-15'),
  'easter-2-wed': w(269, 'Acts 5:17-26', 'Psalm 34:2-3, 4-5, 6-7, 8-9', 'John 3:16-21'),
  'easter-2-thu': w(270, 'Acts 5:27-33', 'Psalm 34:2, 9, 17-18, 19-20', 'John 3:31-36'),
  'easter-2-fri': w(271, 'Acts 5:34-42', 'Psalm 27:1, 4, 13-14', 'John 6:1-15'),
  'easter-2-sat': w(272, 'Acts 6:1-7', 'Psalm 33:1-2, 4-5, 18-19', 'John 6:16-21'),
  'easter-3-mon': w(273, 'Acts 6:8-15', 'Psalm 119:23-24, 26-27, 29-30', 'John 6:22-29'),
  'easter-3-tue': w(274, 'Acts 7:51—8:1a', 'Psalm 31:3cd-4, 6, 7b, 8a, 17, 21ab', 'John 6:30-35'),
  'easter-3-wed': w(275, 'Acts 8:1b-8', 'Psalm 66:1-3a, 4-5, 6-7a', 'John 6:35-40'),
  'easter-3-thu': w(276, 'Acts 8:26-40', 'Psalm 66:8-9, 16-17, 20', 'John 6:44-51'),
  'easter-3-fri': w(277, 'Acts 9:1-20', 'Psalm 117:1bc, 2', 'John 6:52-59'),
  'easter-3-sat': w(278, 'Acts 9:31-42', 'Psalm 116:12-13, 14-15, 16-17', 'John 6:60-69'),
  'easter-4-mon': w(279, 'Acts 11:1-18', 'Psalm 42:2-3; 43:3, 4', 'John 10:1-10'),
  'easter-4-tue': w(280, 'Acts 11:19-26', 'Psalm 87:1b-3, 4-5, 6-7', 'John 10:22-30'),
  'easter-4-wed': w(281, 'Acts 12:24—13:5a', 'Psalm 67:2-3, 5, 6, 8', 'John 12:44-50'),
  'easter-4-thu': w(282, 'Acts 13:13-25', 'Psalm 89:2-3, 21-22, 25, 27', 'John 13:16-20'),
  'easter-4-fri': w(283, 'Acts 13:26-33', 'Psalm 2:6-7, 8-9, 10-11ab', 'John 14:1-6'),
  'easter-4-sat': w(284, 'Acts 13:44-52', 'Psalm 98:1, 2-3ab, 3cd-4', 'John 14:7-14'),
  'easter-5-mon': w(285, 'Acts 14:5-18', 'Psalm 115:1-2, 3-4, 15-16', 'John 14:21-26'),
  'easter-5-tue': w(286, 'Acts 14:19-28', 'Psalm 145:10-11, 12-13ab, 21', 'John 14:27-31a'),
  'easter-5-wed': w(287, 'Acts 15:1-6', 'Psalm 122:1-2, 3-4ab, 4cd-5', 'John 15:1-8'),
  'easter-5-thu': w(288, 'Acts 15:7-21', 'Psalm 96:1-2a, 2b-3, 10', 'John 15:9-11'),
  'easter-5-fri': w(289, 'Acts 15:22-31', 'Psalm 57:8-9, 10, 12', 'John 15:12-17'),
  'easter-5-sat': w(290, 'Acts 16:1-10', 'Psalm 100:1b-2, 3, 5', 'John 15:18-21'),
  'easter-6-mon': w(291, 'Acts 16:11-15', 'Psalm 149:1b-2, 3-4, 5-6a, 9b', 'John 15:26—16:4a'),
  'easter-6-tue': w(292, 'Acts 16:22-34', 'Psalm 138:1-2ab, 2cde-3, 7c-8', 'John 16:5-11'),
  'easter-6-wed': w(293, 'Acts 17:15, 22—18:1', 'Psalm 148:1-2, 11-12, 13, 14', 'John 16:12-15'),
  /** Where the Ascension is kept on the Sunday after, as in most of the US. */
  'easter-6-thu': w(294, 'Acts 18:1-8', 'Psalm 98:1, 2-3ab, 3cd-4', 'John 16:16-20'),
  'easter-6-fri': w(295, 'Acts 18:9-18', 'Psalm 47:2-3, 4-5, 6-7', 'John 16:20-23'),
  'easter-6-sat': w(296, 'Acts 18:23-28', 'Psalm 47:2-3, 8-9, 10', 'John 16:23b-28'),
  'easter-7-mon': w(297, 'Acts 19:1-8', 'Psalm 68:2-3ab, 4-5acd, 6-7ab', 'John 16:29-33'),
  'easter-7-tue': w(298, 'Acts 20:17-27', 'Psalm 68:10-11, 20-21', 'John 17:1-11a'),
  'easter-7-wed': w(299, 'Acts 20:28-38', 'Psalm 68:29-30, 33-35a, 35bc-36ab', 'John 17:11b-19'),
  'easter-7-thu': w(300, 'Acts 22:30; 23:6-11', 'Psalm 16:1-2a, 5, 7-8, 9-10, 11', 'John 17:20-26'),
  'easter-7-fri': w(301, 'Acts 25:13b-21', 'Psalm 103:1-2, 11-12, 19-20ab', 'John 21:15-19'),
  'easter-7-sat': w(302, 'Acts 28:16-20, 30-31', 'Psalm 11:4, 5, 7', 'John 21:20-25'),

  /** The Monday after Pentecost (2018). */
  'mary-mother-of-the-church': w(572, 'Genesis 3:9-15, 20', 'Psalm 87:1-2, 3, 5, 6-7', 'John 19:25-34'),
};
