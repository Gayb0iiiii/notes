import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { mergePageLinks } from "@notes/shared";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db } from "../db/client";
import { pageLinks, pages } from "../db/schema";
import { toPageDto } from "../db/mappers";

export const backlinkRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:pageId/backlinks", async (request) => {
    await requireAuth(request);
    const params = z.object({ pageId: z.string().uuid() }).parse(request.params);
    const [page] = await db.select().from(pages).where(eq(pages.id, params.pageId)).limit(1);
    if (!page) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await requireWorkspaceRole(request, page.workspaceId);
    const rows = await db
      .select({ page: pages })
      .from(pageLinks)
      .innerJoin(pages, eq(pages.id, pageLinks.sourcePageId))
      .where(eq(pageLinks.targetPageId, params.pageId));
    return { backlinks: rows.map((row) => toPageDto(row.page)) };
  });

  app.post("/:pageId/reindex-links", async (request) => {
    await requireAuth(request);
    const params = z.object({ pageId: z.string().uuid() }).parse(request.params);
    const body = z.object({ targetPageIds: z.array(z.string().uuid()) }).parse(request.body);
    const [page] = await db.select().from(pages).where(eq(pages.id, params.pageId)).limit(1);
    if (!page) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    await requireWorkspaceRole(request, page.workspaceId);
    await db.delete(pageLinks).where(eq(pageLinks.sourcePageId, params.pageId));
    const links = mergePageLinks(params.pageId, body.targetPageIds);
    if (links.length > 0) {
      await db.insert(pageLinks).values(
        links.map((link) => ({
          workspaceId: page.workspaceId,
          sourcePageId: link.sourcePageId,
          targetPageId: link.targetPageId
        }))
      );
    }
    return { ok: true, linkCount: links.length };
  });
};
