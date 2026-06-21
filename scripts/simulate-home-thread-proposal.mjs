/**
 * Sign in, open /prototype home, exercise "suggest study thread" (subject-connection card →
 * thread proposal review). Seeds 3 John 3 notes when the account has too few to qualify.
 *
 * Run: node scripts/simulate-home-thread-proposal.mjs
 */
import { chromium } from '@playwright/test';
import { setupClerkTestingToken, clerk, clerkSetup } from '@clerk/testing/playwright';
import dotenv from 'dotenv';

dotenv.config();

const publishableKey = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  console.error('Missing PUBLIC_CLERK_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

await clerkSetup({ publishableKey });

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4322';
const email = process.env.TEST_USER_A_EMAIL;
const password = process.env.TEST_USER_A_PASSWORD;

if (!email || !password) {
  console.error('Missing TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD in .env');
  process.exit(1);
}

/** Authenticated fetch in the signed-in page context. */
async function api(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(path, {
        method,
        credentials: 'include',
        headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
        body: body != null ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    },
    { method, path, body },
  );
}

async function resolveHomeSpaceId(page) {
  const nav = await api(page, 'GET', '/api/navigation/data');
  if (!nav.ok) throw new Error(`navigation/data failed: ${nav.status}`);
  const spaces = nav.json?.spaces ?? [];
  const byTitle = spaces.find((s) => s.title?.trim().toLowerCase() === 'my home');
  const space = byTitle ?? spaces[0];
  if (!space?.id) throw new Error('No home space in navigation response');
  return space.id.startsWith('space_') ? space.id : `space_${space.id}`;
}

async function seedSubjectConnectionNotes(page, spaceId) {
  const created = [];
  const titles = ['Sim thread seed A', 'Sim thread seed B', 'Sim thread seed C'];
  const verses = ['John 3:16', 'John 3:17', 'John 3:18'];
  for (let i = 0; i < 3; i++) {
    const res = await api(page, 'POST', '/api/notes/create', {
      title: titles[i],
      content: `<p>Reflection on ${verses[i]}.</p>`,
      threadId: 'thread_unorganized',
      noteType: 'default',
      spaceId,
    });
    if (!res.ok || !res.json?.note?.id) {
      throw new Error(`create note failed (${res.status}): ${JSON.stringify(res.json)}`);
    }
    const noteId = res.json.note.id;
    created.push(noteId);
    await api(page, 'POST', `/api/notes/${encodeURIComponent(noteId)}/process-scripture-references`, {});
  }
  console.log(`Seeded ${created.length} John 3 notes for simulation:`, created.join(', '));
  return created;
}

async function deleteNotes(page, noteIds) {
  for (const noteId of noteIds) {
    const res = await api(page, 'DELETE', `/api/notes/delete?noteId=${encodeURIComponent(noteId)}`);
    if (!res.ok) console.warn(`Failed to delete ${noteId}:`, res.status, res.json);
  }
}

async function waitForSubjectCard(page, { reload = false } = {}) {
  if (reload) {
    await page.goto(`${BASE}/prototype`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.proto-shell', { timeout: 30_000 });
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('prototypeShortcutShowHome')));
  const homeView = page.locator('.proto-home-view');
  await homeView.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  const card = page
    .locator('.proto-home-card')
    .filter({ has: page.locator('.proto-home-card__eyebrow', { hasText: 'A theme taking shape in your notes' }) });
  await card.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  return card;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const seededNoteIds = [];
const details404s = [];

page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/api/notes/') && url.includes('/details') && res.status() === 404) {
    details404s.push(url);
  }
});

try {
  await page.goto(`${BASE}/`);
  await setupClerkTestingToken({ page });
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: email, password },
  });

  await page.goto(`${BASE}/prototype`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.proto-shell', { timeout: 30_000 });

  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();

  let card = page
    .locator('.proto-home-card')
    .filter({ has: page.locator('.proto-home-card__eyebrow', { hasText: 'A theme taking shape in your notes' }) });

  if ((await card.count()) === 0) {
    console.log('No subject-connection card yet — seeding 3 John 3 notes…');
    const spaceId = await resolveHomeSpaceId(page);
    seededNoteIds.push(...(await seedSubjectConnectionNotes(page, spaceId)));
    card = await waitForSubjectCard(page, { reload: true });
  }

  if ((await card.count()) === 0) {
    throw new Error('Subject-connection card still missing after seeding');
  }

  const subjectTitle = await card.first().locator('.proto-home-card__title').textContent();
  console.log(`Clicking home card: "${subjectTitle?.trim()}"`);
  await card.first().click();

  const review = page.locator('.proto-thread-review');
  await review.waitFor({ state: 'visible', timeout: 10_000 });

  const intro = await review.locator('.proto-thread-review__intro').textContent();
  const noteRows = await review.locator('.proto-note-list .proto-note-row-item').count();
  const createBtn = review.getByRole('button', { name: 'Create thread' });
  const notNowBtn = review.getByRole('button', { name: 'Not now' });

  // Hover each proposal row to exercise prefetch (ghost notes used to 404 here).
  const proposalRows = review.locator('.proto-note-list .proto-note-row-item');
  for (let i = 0; i < (await proposalRows.count()); i++) {
    await proposalRows.nth(i).hover();
    await page.waitForTimeout(200);
  }

  console.log('\n--- Thread proposal review ---');
  console.log(intro?.replace(/\s+/g, ' ').trim());
  console.log(`Notes listed: ${noteRows}`);
  console.log(`Back row: ${(await page.locator('.proto-sidebar-back-row__label').textContent())?.trim() ?? '(none)'}`);
  console.log(`Create thread enabled: ${await createBtn.isEnabled()}`);

  if (details404s.length) {
    throw new Error(`GET /details returned 404 for: ${details404s.join(', ')}`);
  }
  console.log('No /details 404s during proposal review.');

  await notNowBtn.click();
  await review.waitFor({ state: 'hidden', timeout: 10_000 });
  console.log('\nPASS: Home → suggest study thread → review → dismiss works.');
} catch (err) {
  console.error('\nFAIL:', err);
  process.exitCode = 1;
} finally {
  if (seededNoteIds.length) {
    console.log(`\nCleaning up ${seededNoteIds.length} seeded notes…`);
    await deleteNotes(page, seededNoteIds).catch((e) => console.warn('Cleanup error:', e));
  }
  await browser.close();
}
