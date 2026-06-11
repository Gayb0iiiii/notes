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

const recentHistoryDays = 7;
const editSessionGapMinutes = 15;

type HistorySessionRow = {
  session_id: string;
  user_id: string;
  display_name: string;
  started_at: Date;
  ended_at: Date;
  update_count: number;
  bytes_changed: number;
};

type MetadataEditorRow = {
  user_id: string;
  display_name: string;
  edited_at: Date;
};

function sessionStats(bytesChanged: number, updateCount: number): { additions: number; deletions: number; changeSizeBytes: number } {
  const normalized = Math.max(1, Math.round(bytesChanged / 160));
  const groupedPenalty = Math.max(0, updateCount - 1);
  return {
    additions: Math.max(1, normalized),
    deletions: 0,
    changeSizeBytes: Math.max(0, bytesChanged - groupedPenalty)
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

    const historyResult = await pool.query<HistorySessionRow>(
      `with recent_updates as (
         select pu.id,
                pu.user_id,
                pu.created_at,
                octet_length(pu.update_binary)::int as bytes_changed,
                lag(pu.user_id) over (order by pu.created_at asc, pu.id asc) as previous_user_id,
                lag(pu.created_at) over (order by pu.created_at asc, pu.id asc) as previous_created_at
           from page_updates pu
          where pu.page_id = $1
            and pu.workspace_id = $2
            and pu.created_at >= now() - ($3::int * interval '1 day')
       ), grouped_updates as (
         select *,
                sum(
                  case
                    when previous_user_id = user_id
                     and previous_created_at is not null
                     and created_at - previous_created_at <= ($4::int * interval '1 minute')
                    then 0
                    else 1
                  end
                ) over (order by created_at asc, id asc) as session_number
           from recent_updates
       )
       select concat(min(gu.id)::text, '-', max(gu.id)::text) as session_id,
              gu.user_id,
              u.display_name,
              min(gu.created_at) as started_at,
              max(gu.created_at) as ended_at,
              count(*)::int as update_count,
              sum(gu.bytes_changed)::int as bytes_changed
         from grouped_updates gu
         join users u on u.id = gu.user_id
        group by gu.session_number, gu.user_id, u.display_name
        order by max(gu.created_at) desc
        limit 40`,
      [params.pageId, existing.workspaceId, recentHistoryDays, editSessionGapMinutes]
    );

    const metadataEditor = await pool.query<MetadataEditorRow>(
      `select u.id as user_id, u.display_name, p.updated_at as edited_at
         from pages p
         join users u on u.id = p.updated_by
        where p.id = $1
          and p.updated_at >= now() - ($2::int * interval '1 day')
        limit 1`,
      [params.pageId, recentHistoryDays]
    );

    const revisions = historyResult.rows.map((row) => {
      const stats = sessionStats(Number(row.bytes_changed), Number(row.update_count));
      return {
        id: row.session_id,
        editor: { userId: row.user_id, displayName: row.display_name },
        editedAt: row.ended_at.toISOString(),
        startedAt: row.started_at.toISOString(),
        endedAt: row.ended_at.toISOString(),
        updateCount: Number(row.update_count),
        additions: stats.additions,
        deletions: stats.deletions,
        changeSizeBytes: stats.changeSizeBytes
      };
    });
    const latestRevision = revisions[0];
    const latestMetadata = metadataEditor.rows[0];

    return {
      pageId: params.pageId,
      windowDays: recentHistoryDays,
      groupedByMinutes: editSessionGapMinutes,
      lastEdited: latestRevision
        ? { editor: latestRevision.editor, editedAt: latestRevision.editedAt, updateCount: latestRevision.updateCount }
        : latestMetadata
          ? { editor: { userId: latestMetadata.user_id, displayName: latestMetadata.display_name }, editedAt: latestMetadata.edited_at.toISOString(), updateCount: 1 }
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
