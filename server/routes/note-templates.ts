/**
 * Note templates — built-in + personal + space-scoped.
 *
 * Endpoints:
 *   GET    /api/note-templates/list?spaceId=
 *   POST   /api/note-templates/create
 *   DELETE /api/note-templates/delete?id=
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, NoteTemplates, eq, and, isNull, desc } from '../db';
import { now } from '../db/dates';
import {
  requireSpaceAccess,
  canManageSpaceStructure,
  SpaceAccessError,
} from '../utils/space-access';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { getBuiltInTemplates } from '@/data/note-templates';

const app = new Hono();

type StoredTemplateRow = {
  id: string;
  userId: string;
  spaceId: string | null;
  orgId: string | null;
  name: string;
  title: string | null;
  content: string;
  noteType: string | null;
  createdAt: Date;
  updatedAt: Date | null;
};

function serializeStored(row: StoredTemplateRow) {
  return {
    id: row.id,
    userId: row.userId,
    spaceId: row.spaceId,
    orgId: row.orgId,
    name: row.name,
    title: row.title,
    content: row.content,
    noteType: row.noteType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: 'stored' as const,
  };
}

function serializeBuiltIn() {
  return getBuiltInTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    estimatedMinutes: t.estimatedMinutes,
    level: t.level,
    title: t.titleTemplate,
    content: t.content,
    noteType: t.noteType,
    source: 'builtIn' as const,
  }));
}

/** GET /api/note-templates/list?spaceId= */
app.get('/api/note-templates/list', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdRaw = c.req.query('spaceId');
    const spaceId = typeof spaceIdRaw === 'string' && spaceIdRaw.trim() ? spaceIdRaw.trim() : null;

    const personal = await db
      .select()
      .from(NoteTemplates)
      .where(and(eq(NoteTemplates.userId, auth.userId), isNull(NoteTemplates.spaceId)))
      .orderBy(desc(NoteTemplates.createdAt));

    let space: StoredTemplateRow[] = [];
    if (spaceId) {
      try {
        await requireSpaceAccess(spaceId, auth.userId);
      } catch (err) {
        if (err instanceof SpaceAccessError) {
          return c.json({ error: err.message, code: err.code }, err.status);
        }
        throw err;
      }
      space = await db
        .select()
        .from(NoteTemplates)
        .where(eq(NoteTemplates.spaceId, spaceId))
        .orderBy(desc(NoteTemplates.createdAt));
    }

    return c.json({
      builtIn: serializeBuiltIn(),
      personal: personal.map(serializeStored),
      ...(spaceId ? { space: space.map(serializeStored) } : {}),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/note-templates/list',
      action: 'list_note_templates',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/note-templates/create */
app.post('/api/note-templates/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json().catch(() => ({}));

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return c.json({ error: 'Template name is required' }, 400);
    }

    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) {
      return c.json({ error: 'Template content is required' }, 400);
    }

    const title = typeof body.title === 'string' ? body.title : null;
    const noteType = typeof body.noteType === 'string' ? body.noteType : null;
    const spaceId =
      typeof body.spaceId === 'string' && body.spaceId.trim() ? body.spaceId.trim() : null;

    if (spaceId) {
      let access;
      try {
        access = await requireSpaceAccess(spaceId, auth.userId);
      } catch (err) {
        if (err instanceof SpaceAccessError) {
          return c.json({ error: err.message, code: err.code }, err.status);
        }
        throw err;
      }
      if (!canManageSpaceStructure(access.space, access.role)) {
        return c.json(
          {
            error: 'Only space owners or leaders can attach templates to a space',
            code: 'FORBIDDEN',
          },
          403
        );
      }
    }

    const id = `ntpl_${crypto.randomUUID()}`;
    const createdAt = now();

    await db.insert(NoteTemplates).values({
      id,
      userId: auth.userId,
      spaceId,
      orgId: null,
      name,
      title,
      content,
      noteType,
      createdAt,
      updatedAt: null,
    });

    const row = {
      id,
      userId: auth.userId,
      spaceId,
      orgId: null,
      name,
      title,
      content,
      noteType,
      createdAt,
      updatedAt: null,
    };

    return c.json({ success: true, template: serializeStored(row) }, 201);
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/note-templates/create',
      action: 'create_note_template',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** DELETE /api/note-templates/delete?id= */
app.delete('/api/note-templates/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const id = c.req.query('id');
    if (!id) {
      return c.json({ error: 'Template id is required' }, 400);
    }

    const rows = await db.select().from(NoteTemplates).where(eq(NoteTemplates.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      return c.json({ error: 'Template not found', code: 'NOT_FOUND' }, 404);
    }

    if (row.spaceId) {
      let access;
      try {
        access = await requireSpaceAccess(row.spaceId, auth.userId);
      } catch (err) {
        if (err instanceof SpaceAccessError) {
          return c.json({ error: err.message, code: err.code }, err.status);
        }
        throw err;
      }
      if (!canManageSpaceStructure(access.space, access.role)) {
        return c.json(
          {
            error: 'Only space owners or leaders can delete space templates',
            code: 'FORBIDDEN',
          },
          403
        );
      }
    } else if (row.userId !== auth.userId) {
      return c.json({ error: 'Template not found', code: 'NOT_FOUND' }, 404);
    }

    await db.delete(NoteTemplates).where(eq(NoteTemplates.id, id));

    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/note-templates/delete',
      action: 'delete_note_template',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
