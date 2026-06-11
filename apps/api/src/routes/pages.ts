import type { FastifyPluginAsync } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { canEdit, normalizeTitle } from "@notes/shared";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db, pool } from "../db/client";
import { toPageDto } from "../db/mappers";
import { pages } from "../db/schema";

const createPageSchema = z.object({
  id: z.string().uuid(),
  parentPageId: z.string().uuid().nullable().optional(),
  title: z.string().default("Untitled"),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().default(0)
});

type HistoryRow = {
  id: number;
  user_id: string;
  display_name: string;
  created_at: Date;
  bytes_changed: number;
};

type MetadataEditorRow = {
  user_id: string;
  display_name: string;
  edited_at: Date;
};

function revisionStats(bytesChanged: number, previousBytesChanged: number): { additions: number; deletions: number } {
  const normalized = Math.max(1, Math.round(bytesChanged / 96));
  const previous = Math.max(0, Math.round(previousBytesChanged / 96));
  return {
    additions: Math.max(1, normalized),
    deletions: previous > normalized ? Math.max(1, previous - normalized) : 0
  };
}

export const pageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:workspaceId/pages", async (request) => {
    await requireAuth(request);
    const params = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    await requireWorkspaceRole(request, params.workspaceId);
    const rows = await db.select().from(pages).where(eq(pages.workspaceId, params.workspaceId));
    return { pages: rows.map(toPageDto) };
  });

  app.get("/pages/:pageId/history", async (request) => {
    await requireAuth(request);
    const params = z.object({ pageId: z.string().uuid() }).parse(request.params);
    const [existing] = await db.select().from(pages).where(eq(pages.id, params.pageId)).limit(1);
    if (!existing) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await requireWorkspaceRole(request, existing.workspaceId);

    const historyResult = await pool.query<HistoryRow>(
      `select pu.id,
              pu.user_id,
              u.display_name,
              pu.created_at,
              octet_length(pu.update_binary) as bytes_changed
         from page_updates pu
         join users u on u.id = pu.user_id
        where pu.page_id = $1 and pu.workspace_id = $2
        order by pu.id desc
        limit 80`,
      [params.pageId, existing.workspaceId]
    );

    const metadataEditor = await pool.query<MetadataEditorRow>(
      `select u.id as user_id, u.display_name, p.updated_at as edited_at
         from pages p
         join users u on u.id = p.updated_by
        where p.id = $1
        limit 1`,
      [params.pageId]
    );

    const ascending = historyResult.rows.slice().reverse();
    let previousBytes = 0;
    const computed = ascending.map((row) => {
      const stats = revisionStats(Number(row.bytes_changed), previousBytes);
      previousBytes = Number(row.bytes_changed);
      return {
        id: String(row.id),
        editor: { userId: row.user_id, displayName: row.display_name },
        editedAt: row.created_at.toISOString(),
        additions: stats.additions,
        deletions: stats.deletions,
        changeSizeBytes: Number(row.bytes_changed)
      };
    });
    const revisions = computed.reverse();
    const latestRevision = revisions[0];
    const latestMetadata = metadataEditor.rows[0];

    return {
      pageId: params.pageId,
      lastEdited: latestRevision
        ? { editor: latestRevision.editor, editedAt: latestRevision.editedAt }
        : latestMetadata
          ? { editor: { userId: latestMetadata.user_id, displayName: latestMetadata.display_name }, editedAt: latestMetadata.edited_at.toISOString() }
          : null,
      revisions
    };
  });

  app.post("/workspaces/:workspaceId/pages", async (request) => {
    const auth = await requireAuth(request);
    const params = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    const body = createPageSchema.parse(request.body);
    const role = await requireWorkspaceRole(request, params.workspaceId);
    if (!canEdit(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const [page] = await db
      .insert(pages)
      .values({
        id: body.id,
        workspaceId: params.workspaceId,
        parentPageId: body.parentPageId ?? null,
        title: normalizeTitle(body.title),
        icon: body.icon ?? null,
        sortOrder: String(body.sortOrder),
        createdBy: auth.userId,
        updatedBy: auth.userId
      })
      .onConflictDoNothing()
      .returning();
    return { page: page ? toPageDto(page) : null };
  });

  app.patch("/pages/:pageId", async (request) => {
    const auth = await requireAuth(request);
    const params = z.object({ pageId: z.string().uuid() }).parse(request.params);
    const body = z.object({ title: z.string().optional(), icon: z.string().nullable().optional() }).parse(request.body);
    const [existing] = await db.select().from(pages).where(eq(pages.id, params.pageId)).limit(1);
    if (!existing) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    const role = await requireWorkspaceRole(request, existing.workspaceId);
    if (!canEdit(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const [page] = await db
      .update(pages)
      .set({
        title: body.title ? normalizeTitle(body.title) : existing.title,
        icon: body.icon === undefined ? existing.icon : body.icon,
        updatedBy: auth.userId,
        updatedAt: new Date()
      })
      .where(and(eq(pages.id, params.pageId), isNull(pages.archivedAt)))
      .returning();
    return { page: page ? toPageDto(page) : toPageDto(existing) };
  });

  app.post("/pages/:pageId/move", async (request) => {
    const auth = await requireAuth(request);
    const params = z.object({ pageId: z.string().uuid() }).parse(request.params);
    const body = z.object({ parentPageId: z.string().uuid().nullable(), sortOrder: z.number().default(0) }).parse(request.body);
    const [existing] = await db.select().from(pages).where(eq(pages.id, params.pageId)).limit(1);
    if (!existing) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    const role = await requireWorkspaceRole(request, existing.workspaceId);
    if (!canEdit(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const [page] = await db
      .update(pages)
      .set({ parentPageId: body.parentPageId, sortOrder: String(body.sortOrder), updatedBy: auth.userId, updatedAt: new Date() })
      .where(and(eq(pages.id, params.pageId), isNull(pages.archivedAt)))
      .returning();
    return { page: page ? toPageDto(page) : toPageDto(existing) };
  });

  app.post("/pages/:pageId/archive", async (request) => {
    const auth = await requireAuth(request);
    const params = z.object({ pageId: z.string().uuid() }).parse(request.params);
    const [existing] = await db.select().from(pages).where(eq(pages.id, params.pageId)).limit(1);
    if (!existing) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    const role = await requireWorkspaceRole(request, existing.workspaceId);
    if (!canEdit(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const [page] = await db.update(pages).set({ archivedAt: new Date(), updatedBy: auth.userId, updatedAt: new Date() }).where(eq(pages.id, params.pageId)).returning();
    return { page: toPageDto(page) };
  });

  app.post("/pages/:pageId/restore", async (request) => {
    const auth = await requireAuth(request);
    const params = z.object({ pageId: z.string().uuid() }).parse(request.params);
    const [existing] = await db.select().from(pages).where(eq(pages.id, params.pageId)).limit(1);
    if (!existing) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    const role = await requireWorkspaceRole(request, existing.workspaceId);
    if (!canEdit(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const [page] = await db.update(pages).set({ archivedAt: null, updatedBy: auth.userId, updatedAt: new Date() }).where(eq(pages.id, params.pageId)).returning();
    return { page: toPageDto(page) };
  });
};
