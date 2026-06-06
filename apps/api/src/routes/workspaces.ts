import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db } from "../db/client";
import { workspaceMembers, workspaces } from "../db/schema";

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const auth = await requireAuth(request);
    return db
      .select({ id: workspaces.id, name: workspaces.name, ownerUserId: workspaces.ownerUserId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, auth.userId));
  });

  app.get("/:id", async (request) => {
    await requireAuth(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await requireWorkspaceRole(request, params.id);
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, params.id)).limit(1);
    return { workspace };
  });

  app.patch("/:id", async (request) => {
    await requireAuth(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().min(1).max(120) }).parse(request.body);
    const role = await requireWorkspaceRole(request, params.id);
    if (role !== "owner") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const [workspace] = await db.update(workspaces).set({ name: body.name, updatedAt: new Date() }).where(eq(workspaces.id, params.id)).returning();
    return { workspace };
  });
};
