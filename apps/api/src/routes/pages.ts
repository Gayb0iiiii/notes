import type { FastifyPluginAsync } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { canEdit, normalizeTitle } from "@notes/shared";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db } from "../db/client";
import { toPageDto } from "../db/mappers";
import { pages } from "../db/schema";

const createPageSchema = z.object({
  id: z.string().uuid(),
  parentPageId: z.string().uuid().nullable().optional(),
  title: z.string().default("Untitled"),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().default(0)
});

export const pageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:workspaceId/pages", async (request) => {
    await requireAuth(request);
    const params = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    await requireWorkspaceRole(request, params.workspaceId);
    const rows = await db.select().from(pages).where(eq(pages.workspaceId, params.workspaceId));
    return { pages: rows.map(toPageDto) };
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
