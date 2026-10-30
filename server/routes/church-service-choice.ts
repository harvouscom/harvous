/**
 * A congregant's own service — "I go to the 9:00".
 *
 * The viewer's own fact about themselves, read and written only by them. Never accepts an
 * `orgId` or `churchId`: the church is always the one their profile is connected to (or the
 * directory church they picked), the same discipline the congregant half of church.ts keeps.
 *
 * Not sponsorship-gated. Choosing which service you attend is not the church publishing
 * anything; a lapsed church's congregation still goes to church on Sunday.
 *
 * Endpoints:
 *   GET  /api/user/church/service   — the times on offer, your choice, what meets during it
 *   POST /api/user/church/service   — { dayOfWeek, startTime } to choose, { clear: true } to forget
 */
import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import {
  clearServiceChoice,
  getServiceChoiceRow,
  choiceBelongsToViewer,
  isValidSlotInput,
  loadServiceChoiceViewer,
  resolveChoiceSlot,
  serviceSlotsForViewer,
  setServiceChoice,
  spacesByServiceTime,
  type ServiceSlot,
} from '../utils/church-service-choice';

const app = new Hono();

const serializeSlot = (slot: ServiceSlot) => ({
  dayOfWeek: slot.dayOfWeek,
  startTime: slot.startTime,
  label: slot.label,
  serviceTimeId: slot.serviceTimeId,
});

async function choicePayload(userId: string) {
  const viewer = await loadServiceChoiceViewer(userId);
  const [{ source, slots }, row] = await Promise.all([serviceSlotsForViewer(viewer), getServiceChoiceRow(userId)]);
  const belongs = choiceBelongsToViewer(row, viewer);
  const chosen = belongs ? resolveChoiceSlot(row, slots) : null;
  /*
    What meets during the chosen service, for the ministry rows to lead with. Only a church on
    Harvous has tags; a directory church has no channels to suggest.
  */
  let meetsDuring: string[] = [];
  if (chosen?.serviceTimeId && viewer.connectedChurchId) {
    meetsDuring = (await spacesByServiceTime(viewer.connectedChurchId)).get(chosen.serviceTimeId) ?? [];
  }
  return {
    /** 'church' = the church's own times; 'directory' = Here's My Church's listing; 'none' = nothing to choose. */
    source,
    slots: slots.map(serializeSlot),
    choice: chosen ? serializeSlot(chosen) : null,
    /** They chose a service this church no longer lists — ask again, once. */
    choiceStale: belongs && !chosen,
    meetsDuringSpaceIds: meetsDuring,
  };
}

app.get('/api/user/church/service', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    return c.json(await choicePayload(auth.userId));
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/church/service', action: 'church_service_choice_read' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/user/church/service', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.clear === true) {
      await clearServiceChoice(auth.userId);
      return c.json(await choicePayload(auth.userId));
    }
    if (!isValidSlotInput(body)) {
      return c.json({ error: 'Choose a day and time', code: 'BAD_REQUEST' }, 400);
    }
    const result = await setServiceChoice(auth.userId, { dayOfWeek: body.dayOfWeek, startTime: body.startTime });
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);
    return c.json(await choicePayload(auth.userId));
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/user/church/service', action: 'church_service_choice_write' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
