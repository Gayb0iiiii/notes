import type { FastifyPluginAsync } from "fastify";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { canEdit, normalizeTitle, shouldApplyMetadataOperation } from "@notes/shared";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db } from "../db/client";
import { toPageDto } from "../db/mappers";
import { metadataOperations, pages } from "../db/schema";

const operationSchema = z.object({
  idempotencyKey: z.string().min(1),
  workspaceId: z.string().uuid(),
  type: z.enum(["create_page", "rename_page", "move_page", "archive_page", "restore_page", "reorder_page"]),
  payload: z.record(z.unknown()),
  clientCreatedAt: z.string()
});

async function applyOperation(userId: string, operation: z.infer<typeof operationSchema>) {
  const pageId = String(operation.payload.pageId ?? operation.payload.id ?? "");
  const [existing] = pageId ? await db.select().from(pages).where(eq(pages.id, pageId)).limit(1) : [];
  const decision = shouldApplyMetadataOperation(existing ?? null, operation);
  if (!decision.apply) {
    return { status: "skipped", reason: decision.reason, page: existing ? toPageDto(existing) : null };
  }

  if (operation.type === "create_page") {
    const payload = z
      .object({
        id: z.string().uuid(),
        title: z.string().default("Untitled"),
        parentPageId: z.string().uuid().nullable().optional(),
        icon: z.string().nullable().optional(),
        sortOrder: z.number().default(0)
      })
      .parse(operation.payload);
    const [page] = await db
      .insert(pages)
      .values({
        id: payload.id,
        workspaceId: operation.workspaceId,
        parentPageId: payload.parentPageId ?? null,
        title: normalizeTitle(payload.title),
        icon: payload.icon ?? null,
        sortOrder: String(payload.sortOrder),
        createdBy: userId,
        updatedBy: userId
      })
      .onConflictDoNothing()
      .returning();
    return { status: "applied", page: page ? toPageDto(page) : null };
  }

  if (!existing) {
    return { status: "skipped", reason: "page_missing", page: null };
  }

  if (operation.type === "rename_page") {
    const payload = z.object({ pageId: z.string().uuid(), title: z.string() }).parse(operation.payload);
    const [page] = await db
      .update(pages)
      .set({ title: normalizeTitle(payload.title), updatedBy: userId, updatedAt: new Date() })
      .where(eq(pages.id, payload.pageId))
      .returning();
    return { status: "applied", page: toPageDto(page) };
  }

  if (operation.type === "move_page" || operation.type === "reorder_page") {
    const payload = z.object({ pageId: z.string().uuid(), parentPageId: z.string().uuid().nullable().optional(), sortOrder: z.number().default(0) }).parse(operation.payload);
    const [page] = await db
      .update(pages)
      .set({
        parentPageId: payload.parentPageId === undefined ? existing.parentPageId : payload.parentPageId,
        sortOrder: String(payload.sortOrder),
        updatedBy: userId,
        updatedAt: new Date()
      })
      .where(eq(pages.id, payload.pageId))
      .returning();
    return { status: "applied", page: toPageDto(page) };
  }

  if (operation.type === "archive_page") {
    const payload = z.object({ pageId: z.string().uuid() }).parse(operation.payload);
    const [page] = await db
      .update(pages)
      .set({ archivedAt: new Date(), updatedBy: userId, updatedAt: new Date() })
      .where(eq(pages.id, payload.pageId))
      .returning();
    return { status: "applied", page: toPageDto(page) };
  }

  const payload = z.object({ pageId: z.string().uuid() }).parse(operation.payload);
  const [page] = await db
    .update(pages)
    .set({ archivedAt: null, updatedBy: userId, updatedAt: new Date() })
    .where(eq(pages.id, payload.pageId))
    .returning();
  return { status: "applied", page: toPageDto(page) };
}

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post("/metadata", async (request) => {
    const auth = await requireAuth(request);
    const body = z.object({ operations: z.array(operationSchema).max(100) }).parse(request.body);
    const results = [];

    for (const operation of body.operations) {
      const role = await requireWorkspaceRole(request, operation.workspaceId);
      if (!canEdit(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });

      const [previous] = await db
        .select()
        .from(metadataOperations)
        .where(eq(metadataOperations.idempotencyKey, operation.idempotencyKey))
        .limit(1);
      if (previous) {
        results.push(JSON.parse(previous.responseJson));
        continue;
      }

      const response = await applyOperation(auth.userId, operation);
      await db.insert(metadataOperations).values({
        idempotencyKey: operation.idempotencyKey,
        workspaceId: operation.workspaceId,
        userId: auth.userId,
        type: operation.type,
        responseJson: JSON.stringify(response)
      });
      results.push(response);
    }

    return { results };
  });

  app.get("/metadata", async (request) => {
    await requireAuth(request);
    const query = z.object({ workspaceId: z.string().uuid(), since: z.string().optional() }).parse(request.query);
    await requireWorkspaceRole(request, query.workspaceId);
    const rows = await db
      .select()
      .from(pages)
      .where(query.since ? and(eq(pages.workspaceId, query.workspaceId), gt(pages.updatedAt, new Date(query.since))) : eq(pages.workspaceId, query.workspaceId));
    return { pages: rows.map(toPageDto), serverTime: new Date().toISOString() };
  });
};
