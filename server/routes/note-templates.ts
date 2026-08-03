/**
 * Note templates — built-in + personal + space-scoped + org-provisioned.
 *
 * Org templates (`orgId` set) are the church's own starters — the sermon
 * template is one of these, not a pastor-only feature with its own UI. Everyone
 * connected to the church can *use* them; only staff holding the
 * `manage_templates` capability can write one (see church-role-capabilities.ts).
 *
 * Endpoints:
 *   GET    /api/note-templates/list?spaceId=
 *   POST   /api/note-templates/create
 *   POST   /api/note-templates/update
 *   DELETE /api/note-templates/delete?id=
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, first, NoteTemplates, UserMetadata, eq, and, isNull, desc } from '../db';
import { now } from '../db/dates';
import {
  requireSpaceAccess,
  canManageSpaceStructure,
  SpaceAccessError,
} from '../utils/space-access';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import {
  getBuiltInTemplates,
  NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH,
} from '@/data/note-templates';
import { isNoteTemplateIconColor } from '@/utils/note-template-icon';
import { isChurchStaffForOrg, getActiveChurchByOrgId } from '../utils/church-staff';
import { fetchClerkOrgMemberships } from '../utils/clerk-org';
import { capabilitiesForChurchRole } from '../utils/church-role-capabilities';

const app = new Hono();

/** The caller's home church org, or null when they haven't connected one. */
async function connectedOrgIdFor(userId: string): Promise<string | null> {
  const row = first(
    await db
      .select({ connectedOrgId: UserMetadata.connectedOrgId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  return row?.connectedOrgId ?? null;
}

/**
 * Whether this user may write org-scoped templates for `orgId`.
 *
 * Two gates, matching the role-gating principle: staff membership, then the
 * `manage_templates` capability derived server-side from their Clerk org role.
 * A plain staff member publishes curriculum; provisioning the church's starters
 * is a pastor/teacher/admin act.
 */
async function canManageOrgTemplates(userId: string, orgId: string): Promise<boolean> {
  const church = await getActiveChurchByOrgId(orgId);
  if (!church) return false;
  if (!(await isChurchStaffForOrg(userId, orgId))) return false;
  try {
    const roster = await fetchClerkOrgMemberships(orgId);
    const role = roster.find((member) => member.userId === userId)?.role ?? null;
    return capabilitiesForChurchRole(role).includes('manage_templates');
  } catch {
    // Fail closed on provisioning: a Clerk outage must not let a plain staff
    // member write a church-wide template.
    return false;
  }
}

type StoredTemplateRow = {
  id: string;
  userId: string;
  spaceId: string | null;
  orgId: string | null;
  name: string;
  description: string | null;
  title: string | null;
  content: string;
  noteType: string | null;
  iconColor: string | null;
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
    description: row.description,
    title: row.title,
    content: row.content,
    noteType: row.noteType,
    iconColor: row.iconColor,
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
    iconColor: t.iconColor,
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

    // Church starters: available to everyone connected to the church, staff or
    // not — a congregant using the sermon template is the point.
    let org: StoredTemplateRow[] = [];
    const orgId = await connectedOrgIdFor(auth.userId);
    if (orgId && (await getActiveChurchByOrgId(orgId))) {
      org = await db
        .select()
        .from(NoteTemplates)
        .where(eq(NoteTemplates.orgId, orgId))
        .orderBy(desc(NoteTemplates.createdAt));
    }

    return c.json({
      builtIn: serializeBuiltIn(),
      personal: personal.map(serializeStored),
      ...(spaceId ? { space: space.map(serializeStored) } : {}),
      ...(org.length > 0 ? { org: org.map(serializeStored) } : {}),
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
    const iconColor = isNoteTemplateIconColor(body.iconColor) ? body.iconColor : 'blue';
    const descriptionRaw = typeof body.description === 'string' ? body.description.trim() : '';
    const description = descriptionRaw
      ? descriptionRaw.slice(0, NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH)
      : null;
    const spaceId =
      typeof body.spaceId === 'string' && body.spaceId.trim() ? body.spaceId.trim() : null;
    const orgId =
      typeof body.orgId === 'string' && body.orgId.trim() ? body.orgId.trim() : null;

    if (orgId && spaceId) {
      return c.json(
        { error: 'A template is scoped to a space or an org, not both', code: 'INVALID_SCOPE' },
        400,
      );
    }

    if (orgId && !(await canManageOrgTemplates(auth.userId, orgId))) {
      return c.json(
        { error: 'Only church staff can create church templates', code: 'CHURCH_TEMPLATE_FORBIDDEN' },
        403,
      );
    }

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
      orgId,
      name,
      description,
      title,
      content,
      noteType,
      iconColor,
      createdAt,
      updatedAt: null,
    });

    const row = {
      id,
      userId: auth.userId,
      spaceId,
      orgId,
      name,
      description,
      title,
      content,
      noteType,
      iconColor,
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

async function assertCanManageTemplate(
  row: StoredTemplateRow,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 404; error: string; code: string }> {
  // Org templates belong to the church, not their author: any staff member with
  // `manage_templates` may edit them, and the original author loses that right
  // when they leave. Checked before the userId fallback below, which would
  // otherwise hand a departed author permanent control of a church starter.
  if (row.orgId) {
    if (!(await canManageOrgTemplates(userId, row.orgId))) {
      return {
        ok: false,
        status: 403,
        error: 'Only church staff can manage church templates',
        code: 'CHURCH_TEMPLATE_FORBIDDEN',
      };
    }
    return { ok: true };
  }
  if (row.spaceId) {
    let access;
    try {
      access = await requireSpaceAccess(row.spaceId, userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) {
        return { ok: false, status: err.status, error: err.message, code: err.code };
      }
      throw err;
    }
    if (!canManageSpaceStructure(access.space, access.role)) {
      return {
        ok: false,
        status: 403,
        error: 'Only space owners or leaders can manage space templates',
        code: 'FORBIDDEN',
      };
    }
    return { ok: true };
  }
  if (row.userId !== userId) {
    return { ok: false, status: 404, error: 'Template not found', code: 'NOT_FOUND' };
  }
  return { ok: true };
}

/** POST /api/note-templates/update */
app.post('/api/note-templates/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json().catch(() => ({}));

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return c.json({ error: 'Template id is required' }, 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return c.json({ error: 'Template name is required' }, 400);
    }

    const rows = await db.select().from(NoteTemplates).where(eq(NoteTemplates.id, id)).limit(1);
    const existing = rows[0];
    if (!existing) {
      return c.json({ error: 'Template not found', code: 'NOT_FOUND' }, 404);
    }

    const manage = await assertCanManageTemplate(existing, auth.userId);
    if (!manage.ok) {
      return c.json({ error: manage.error, code: manage.code }, manage.status);
    }

    const iconColor = isNoteTemplateIconColor(body.iconColor)
      ? body.iconColor
      : existing.iconColor && isNoteTemplateIconColor(existing.iconColor)
        ? existing.iconColor
        : 'blue';
    const descriptionRaw = typeof body.description === 'string' ? body.description.trim() : '';
    const description = descriptionRaw
      ? descriptionRaw.slice(0, NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH)
      : null;

    let nextSpaceId = existing.spaceId;
    if ('spaceId' in body) {
      nextSpaceId =
        typeof body.spaceId === 'string' && body.spaceId.trim() ? body.spaceId.trim() : null;
      if (nextSpaceId && nextSpaceId !== existing.spaceId) {
        let access;
        try {
          access = await requireSpaceAccess(nextSpaceId, auth.userId);
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
            403,
          );
        }
      }
    }

    const contentRaw = typeof body.content === 'string' ? body.content : null;
    const refreshBody = contentRaw !== null && contentRaw.trim().length > 0;
    const title = refreshBody
      ? typeof body.title === 'string'
        ? body.title
        : null
      : existing.title;
    const content = refreshBody ? contentRaw : existing.content;
    const noteType = refreshBody
      ? typeof body.noteType === 'string'
        ? body.noteType
        : existing.noteType
      : existing.noteType;

    const updatedAt = now();
    await db
      .update(NoteTemplates)
      .set({
        name,
        description,
        iconColor,
        spaceId: nextSpaceId,
        title,
        content,
        noteType,
        updatedAt,
      })
      .where(eq(NoteTemplates.id, id));

    const row: StoredTemplateRow = {
      id: existing.id,
      userId: existing.userId,
      spaceId: nextSpaceId,
      orgId: existing.orgId,
      name,
      description,
      title,
      content,
      noteType,
      iconColor,
      createdAt: existing.createdAt,
      updatedAt,
    };

    return c.json({ success: true, template: serializeStored(row) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/note-templates/update',
      action: 'update_note_template',
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

    const manage = await assertCanManageTemplate(row, auth.userId);
    if (!manage.ok) {
      return c.json({ error: manage.error, code: manage.code }, manage.status);
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
