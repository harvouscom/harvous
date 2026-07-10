import {
  expect,
  test,
} from './fixtures/auth';
import {
  e2eFixtureIds,
  readSafeE2EConfig,
  registerE2ERunResources,
} from './fixtures/e2e-db-safety';
import {
  createInviteViaApi,
  createSharedSpaceViaApi,
  focusNoteBodyEditor,
  grantSharedSpacesAddon,
  removeMemberViaApi,
  selectSpaceInSwitcher,
  sharedSpaceNoteRow,
  waitForAppShell,
} from './shared-spaces-helpers';
import type {
  APIResponse,
  Page,
} from '@playwright/test';

type JsonRecord = Record<string, unknown>;
type PlaywrightHttpResponse = Pick<APIResponse, 'ok' | 'status' | 'text'>;

let fixture: ReturnType<typeof e2eFixtureIds>;
let runLabel = '';
let ownerNoteText = '';
let ownerEditedText = '';
let memberResponseText = '';
let memberThreadNoteText = '';
let currentThreadTitle = '';

async function jsonResponse<T extends JsonRecord>(
  response: PlaywrightHttpResponse,
  label: string,
): Promise<T> {
  const text = await response.text();
  expect(response.ok(), `${label}: ${response.status()} ${text}`).toBe(true);
  return (text ? JSON.parse(text) : {}) as T;
}

async function createNoteFromActiveSpace(
  page: Page,
  text: string,
  alreadyComposing = false,
) {
  if (!alreadyComposing) {
    await page.getByRole('button', { name: 'New note' }).first().click();
  }
  const body = await focusNoteBodyEditor(page);
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/notes/create') && response.request().method() === 'POST',
  );
  await body.pressSequentially(text, { delay: 5 });
  const payload = await jsonResponse<{ note?: { id?: string } }>(
    await createdResponse,
    'create note',
  );
  expect(payload.note?.id).toBeTruthy();
  return payload.note!.id!;
}

test.describe.configure({ mode: 'serial' });
test.describe('Shared Spaces two-user collaboration contract', () => {
  test.setTimeout(120_000);

  let secondSpaceId = '';
  let ownerNoteId = '';
  let memberThreadNoteId = '';
  let responseId = '';
  let departedMemberDisplayName = '';

  test.beforeAll(async ({ userAContext, userBContext }) => {
    const config = readSafeE2EConfig();
    fixture = e2eFixtureIds(config);
    runLabel = config.runNamespace;
    ownerNoteText = `Grace anchors shared verification ${runLabel}`;
    ownerEditedText = `Live owner edit ${runLabel}`;
    memberResponseText = `Member anchored response ${runLabel}`;
    memberThreadNoteText = `Member Thread note ${runLabel}`;
    currentThreadTitle = `Romans conversation ${runLabel}`;

    await grantSharedSpacesAddon(userAContext.request, true);
    await removeMemberViaApi(
      userAContext.request,
      fixture.spaceId,
      process.env.TEST_USER_B_CLERK_ID!,
    ).catch((error) => {
      if (!String(error).includes('404')) throw error;
    });
    const invite = await createInviteViaApi(userAContext.request, fixture.spaceId);
    await jsonResponse(
      await userBContext.request.post(
        `/api/spaces/invites/${invite.token}/redeem`,
      ),
      'redeem deterministic collaboration invite',
    );
    const secondSpace = await createSharedSpaceViaApi(
      userAContext.request,
      `E2E Second ${runLabel}`,
      'teal',
    );
    secondSpaceId = secondSpace.id;
  });

  test('owner creates from This space and the canonical note appears in My Home and Space B', async ({
    userAContext,
  }) => {
    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, fixture.spaceTitle);
    ownerNoteId = await createNoteFromActiveSpace(page, ownerNoteText);
    registerE2ERunResources({ notes: [ownerNoteId] });

    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, 'My Home');
    await expect(sharedSpaceNoteRow(page, ownerNoteText).first()).toBeVisible();

    await selectSpaceInSwitcher(page, fixture.spaceTitle);
    await expect(sharedSpaceNoteRow(page, ownerNoteText).first()).toBeVisible();

    await jsonResponse(
      await userAContext.request.post(
        `/api/spaces/${secondSpaceId}/add-note`,
        { data: { noteId: ownerNoteId } },
      ),
      'associate note to Space B',
    );
    await selectSpaceInSwitcher(page, `E2E Second ${runLabel}`);
    await expect(sharedSpaceNoteRow(page, ownerNoteText).first()).toBeVisible();
  });

  test('member response is scoped to Space A and owner Activity opens its exact dock', async ({
    userAContext,
    userBContext,
  }) => {
    const anchorQuote = 'Grace anchors';
    const response = await jsonResponse<{
      studyThread?: { id?: string };
    }>(
      await userBContext.request.post(
        `/api/notes/${ownerNoteId}/study-threads`,
        {
          data: {
            contextSpaceId: fixture.spaceId,
            entryKind: 'miniNote',
            anchorLocation: 0,
            anchorLength: anchorQuote.length,
            anchorTextSnapshot: anchorQuote,
            sourceSnippet: anchorQuote,
            miniNoteBody: memberResponseText,
          },
        },
      ),
      'create anchored member response',
    );
    responseId = response.studyThread?.id ?? '';
    expect(responseId).toBeTruthy();
    registerE2ERunResources({ studyThreadEntries: [responseId] });

    const ownerPage = await userAContext.newPage();
    const noteSlug = ownerNoteId.replace(/^note_/, '');
    await ownerPage.goto(`/n/${noteSlug}?space=${fixture.spaceId}`);
    await ownerPage.getByRole('button', { name: 'Show note details' }).click();
    const activityRow = ownerPage
      .getByRole('button', { name: new RegExp(`Response by .* on ${anchorQuote}`) })
      .first();
    await expect(activityRow).toBeVisible();
    await activityRow.click();
    await expect(activityRow).toHaveAttribute('aria-current', 'true');
    await expect(ownerPage.getByRole('textbox', { name: 'Highlight note' })).toHaveValue(
      memberResponseText,
    );

    const spaceBPage = await userAContext.newPage();
    await spaceBPage.goto(`/n/${noteSlug}?space=${secondSpaceId}`);
    await spaceBPage.getByRole('button', { name: 'Show note details' }).click();
    await expect(
      spaceBPage.getByRole('button', {
        name: new RegExp(`Response by .* on ${anchorQuote}`),
      }),
    ).toHaveCount(0);
  });

  test('an edit saved in My Home is visible when each space context is reopened', async ({
    userAContext,
    userBContext,
  }) => {
    const ownerPage = await userAContext.newPage();
    const noteSlug = ownerNoteId.replace(/^note_/, '');
    await ownerPage.goto(`/n/${noteSlug}`);
    const body = await focusNoteBodyEditor(ownerPage);
    const updateResponse = ownerPage.waitForResponse(
      (response) =>
        response.url().includes('/api/notes/update') && response.request().method() === 'PUT',
    );
    await body.press('End');
    await body.pressSequentially(` ${ownerEditedText}`, { delay: 5 });
    await jsonResponse(await updateResponse, 'update canonical note');

    for (const [context, spaceId] of [
      [userAContext, fixture.spaceId],
      [userAContext, secondSpaceId],
      [userBContext, fixture.spaceId],
    ] as const) {
      const page = await context.newPage();
      await page.goto(`/n/${noteSlug}?space=${spaceId}`);
      await expect(page.locator('.ProseMirror').first()).toContainText(ownerEditedText);
      await page.close();
    }
  });

  test('owner starts the current Thread; member composes into it and opens drilldown without owner controls', async ({
    userAContext,
    userBContext,
  }) => {
    const ownerPage = await userAContext.newPage();
    await waitForAppShell(ownerPage);
    await selectSpaceInSwitcher(ownerPage, fixture.spaceTitle);
    const memberBeforeStart = await userBContext.newPage();
    await waitForAppShell(memberBeforeStart);
    await selectSpaceInSwitcher(memberBeforeStart, fixture.spaceTitle);
    await expect(ownerPage.getByRole('button', { name: 'Start a Thread' })).toBeVisible();
    await expect(memberBeforeStart.getByRole('button', { name: 'Start a Thread' })).toHaveCount(0);
    await memberBeforeStart.close();

    await ownerPage.getByRole('button', { name: 'Start a Thread' }).click();
    const dialog = ownerPage.getByRole('dialog', { name: 'Start a Thread' });
    await dialog.getByLabel('Thread title').fill(currentThreadTitle);
    await dialog.getByRole('button', { name: 'Start Thread' }).click();
    await expect(ownerPage.getByText(currentThreadTitle).first()).toBeVisible();

    const alternateThread = await jsonResponse<{ thread?: { id: string } }>(
      await userAContext.request.post('/api/threads/create', {
        multipart: {
          title: `Alternate Thread ${runLabel}`,
          color: 'paper',
          spaceId: fixture.spaceId,
          isPublic: 'false',
          selectedNoteIds: '[]',
        },
      }),
      'create non-current Thread',
    );
    expect(alternateThread.thread?.id).toBeTruthy();
    registerE2ERunResources({ threads: [alternateThread.thread!.id] });
    const hiddenAlternateRead = await userBContext.request.get(
      `/api/threads/${alternateThread.thread!.id}/notes?spaceId=${fixture.spaceId}`,
    );
    expect(
      hiddenAlternateRead.status(),
      await hiddenAlternateRead.text(),
    ).toBe(404);
    await ownerPage.reload();
    await waitForAppShell(ownerPage);
    await selectSpaceInSwitcher(ownerPage, fixture.spaceTitle);
    await expect(ownerPage.getByRole('button', { name: 'Set current' })).toBeVisible();

    const memberPage = await userBContext.newPage();
    await waitForAppShell(memberPage);
    await selectSpaceInSwitcher(memberPage, fixture.spaceTitle);
    await expect(memberPage.getByText(currentThreadTitle).first()).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'Start a Thread' })).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: 'Set current' })).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: /Pin Thread/i })).toHaveCount(0);

    const threadList = await jsonResponse<{
      threads?: Array<{ id: string; title: string }>;
    }>(
      await userAContext.request.get(
        `/api/spaces/${fixture.spaceId}/group-threads`,
      ),
      'load current Thread for cleanup',
    );
    const currentThread = threadList.threads?.find(
      (thread) => thread.title === currentThreadTitle,
    );
    expect(currentThread?.id).toBeTruthy();
    registerE2ERunResources({ threads: [currentThread!.id] });
    const forbiddenPin = await userBContext.request.post(
      `/api/spaces/${fixture.spaceId}/pin-item`,
      {
        data: {
          itemId: currentThread!.id,
          itemType: 'thread',
          isPinned: true,
        },
      },
    );
    expect(forbiddenPin.status(), await forbiddenPin.text()).toBe(403);

    const mobilePage = await userBContext.newPage();
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await waitForAppShell(mobilePage);
    await selectSpaceInSwitcher(mobilePage, fixture.spaceTitle);
    await mobilePage.getByText(currentThreadTitle).first().click();
    await expect(mobilePage.getByRole('heading', { name: currentThreadTitle })).toBeVisible();
    await expect(mobilePage.getByRole('button', { name: 'Add existing' })).toBeVisible();
    await mobilePage.getByRole('button', { name: 'Compose' }).click();
    await expect(mobilePage.getByText(`Saving to ${fixture.spaceTitle}`, { exact: true })).toBeVisible();
    await mobilePage.close();

    await memberPage.getByText(currentThreadTitle).first().click();
    await expect(
      memberPage.getByRole('heading', { name: currentThreadTitle }),
    ).toBeVisible();
    await memberPage.getByRole('button', { name: 'Compose' }).click();
    memberThreadNoteId = await createNoteFromActiveSpace(
      memberPage,
      memberThreadNoteText,
      true,
    );
    registerE2ERunResources({ notes: [memberThreadNoteId] });

    await waitForAppShell(memberPage);
    await selectSpaceInSwitcher(memberPage, fixture.spaceTitle);
    await memberPage.getByText(currentThreadTitle).first().click();
    await expect(
      memberPage.getByRole('heading', { name: currentThreadTitle }),
    ).toBeVisible();
    await expect(memberPage.getByText(memberThreadNoteText).first()).toBeVisible();
  });

  test('leaving preserves response attribution; re-share restores Activity without the member note in the old Thread', async ({
    userAContext,
    userBContext,
  }) => {
    const membersBeforeLeave = await jsonResponse<{
      members?: Array<{ userId: string; displayName: string }>;
    }>(
      await userAContext.request.get(`/api/spaces/${fixture.spaceId}/members`),
      'load member attribution before leave',
    );
    departedMemberDisplayName =
      membersBeforeLeave.members?.find(
        (member) => member.userId === process.env.TEST_USER_B_CLERK_ID,
      )?.displayName ?? '';
    expect(departedMemberDisplayName).toBeTruthy();

    await jsonResponse(
      await userBContext.request.delete(
        `/api/spaces/${fixture.spaceId}/members/${process.env.TEST_USER_B_CLERK_ID}`,
      ),
      'member leaves Space A',
    );

    const archivedActivity = await jsonResponse<{
      groups?: Array<{
        associationStatus: string;
        items: Array<{ id: string; actorDisplayName: string }>;
      }>;
    }>(
      await userAContext.request.get(`/api/notes/${ownerNoteId}/activity`),
      'load Activity after member leaves',
    );
    const preserved = archivedActivity.groups
      ?.flatMap((group) => group.items)
      .find((item) => item.id === responseId);
    expect(preserved?.actorDisplayName).toBe(departedMemberDisplayName);

    await jsonResponse(
      await userAContext.request.post(
        `/api/spaces/${fixture.spaceId}/remove-items`,
        { data: { noteIds: [ownerNoteId], threadIds: [] } },
      ),
      'archive owner note association',
    );
    await jsonResponse(
      await userAContext.request.post(
        `/api/spaces/${fixture.spaceId}/add-note`,
        { data: { noteId: ownerNoteId } },
      ),
      're-share owner note',
    );
    const resharedActivity = await jsonResponse<{
      groups?: Array<{ items: Array<{ id: string }> }>;
    }>(
      await userAContext.request.get(
        `/api/notes/${ownerNoteId}/activity?contextSpaceId=${fixture.spaceId}`,
      ),
      'load Activity after re-share',
    );
    expect(
      resharedActivity.groups?.flatMap((group) => group.items).map((item) => item.id),
    ).toContain(responseId);

    const threads = await jsonResponse<{
      threads?: Array<{ id: string; title: string }>;
    }>(
      await userAContext.request.get(
        `/api/spaces/${fixture.spaceId}/group-threads`,
      ),
      'load shared Threads',
    );
    const current = threads.threads?.find(
      (thread) => thread.title === currentThreadTitle,
    );
    expect(current?.id).toBeTruthy();
    const threadNotes = await jsonResponse<{
      notes?: Array<{ id: string }>;
    }>(
      await userAContext.request.get(
        `/api/threads/${current!.id}/notes?spaceId=${fixture.spaceId}`,
      ),
      'load old Thread placement',
    );
    expect(threadNotes.notes?.map((note) => note.id)).not.toContain(memberThreadNoteId);
  });
});
