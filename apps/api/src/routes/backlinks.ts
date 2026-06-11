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

    if (!page) {
      request.log.info({ pageId: params.pageId }, "Backlink lookup skipped for page that is not on the server yet");
      return { backlinks: [] };
    }

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
    if (!page) {
      request.log.info({ pageId: params.pageId }, "Link reindex skipped for page that is not on the server yet");
      return { ok: true, linkCount: 0, skipped: "page_not_synced" };
    }
    await requireWorkspaceRole(request, page.workspaceId);
    const links = mergePageLinks(params.pageId, body.targetPageIds);
    // Wrap delete + insert in a transaction so a partial insert failure
    // never leaves the page with zero recorded links.
    await db.transaction(async (tx) => {
      await tx.delete(pageLinks).where(eq(pageLinks.sourcePageId, params.pageId));
      if (links.length > 0) {
        await tx.insert(pageLinks).values(
          links.map((link) => ({
            workspaceId: page.workspaceId,
            sourcePageId: link.sourcePageId,
            targetPageId: link.targetPageId
          }))
        );
      }
    });
    return { ok: true, linkCount: links.length };
  });
};
