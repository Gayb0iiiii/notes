import type { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { canManageUsers } from "@notes/shared";
import { hashPassword } from "../auth/password";
import { requireAuth, requireWorkspaceRole } from "../auth/session";
import { db } from "../db/client";
import { users, workspaceMembers, workspaces } from "../db/schema";

const createUserSchema = z.object({
  workspaceId: z.string().uuid(),
  username: z.string().min(1).max(80),
  password: z.string().min(10),
  displayName: z.string().min(1).max(120),
  role: z.enum(["owner", "editor"]).default("editor")
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const auth = await requireAuth(request);
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, auth.userId)).limit(1);
    if (!workspace) return [];
    const role = await requireWorkspaceRole(request, workspace.id);
    if (!canManageUsers(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    return db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: workspaceMembers.role,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspace.id));
  });

  app.post("/", async (request) => {
    await requireAuth(request);
    const body = createUserSchema.parse(request.body);
    const role = await requireWorkspaceRole(request, body.workspaceId);
    if (!canManageUsers(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });

    const [user] = await db
      .insert(users)
      .values({
        username: body.username,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password)
      })
      .returning();

    await db.insert(workspaceMembers).values({ workspaceId: body.workspaceId, userId: user.id, role: body.role });
    return { user: { id: user.id, username: user.username, displayName: user.displayName, role: body.role } };
  });

  app.patch("/:id", async (request) => {
    const auth = await requireAuth(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        workspaceId: z.string().uuid(),
        displayName: z.string().min(1).max(120).optional(),
        role: z.enum(["owner", "editor"]).optional(),
        password: z.string().min(10).optional()
      })
      .parse(request.body);
    const role = await requireWorkspaceRole(request, body.workspaceId);
    if (!canManageUsers(role) && auth.userId !== params.id) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });

    if (body.displayName) await db.update(users).set({ displayName: body.displayName, updatedAt: new Date() }).where(eq(users.id, params.id));
    if (body.role && canManageUsers(role)) {
      const [targetMembership] = await db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.userId, params.id)))
        .limit(1);
      const owners = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.role, "owner")));
      if (targetMembership?.role === "owner" && body.role !== "owner" && owners.length <= 1) {
        throw Object.assign(new Error("Workspace needs at least one owner"), { statusCode: 400 });
      }
      await db.update(workspaceMembers).set({ role: body.role }).where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.userId, params.id)));
    }
    if (body.password && canManageUsers(role)) {
      await db.update(users).set({ passwordHash: await hashPassword(body.password), updatedAt: new Date() }).where(eq(users.id, params.id));
    }
    return { ok: true };
  });

  app.delete("/:id", async (request) => {
    await requireAuth(request);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ workspaceId: z.string().uuid() }).parse(request.body);
    const role = await requireWorkspaceRole(request, body.workspaceId);
    if (!canManageUsers(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const [targetMembership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.userId, params.id)))
      .limit(1);
    if (targetMembership?.role === "owner") {
      const owners = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.role, "owner")));
      if (owners.length <= 1) {
        throw Object.assign(new Error("Workspace needs at least one owner"), { statusCode: 400 });
      }
    }
    await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.userId, params.id)));
    return { ok: true };
  });
};
