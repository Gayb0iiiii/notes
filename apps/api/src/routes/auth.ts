import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { users, workspaceMembers } from "../db/schema";
import { clearSession, createSession, requireAuth } from "../auth/session";
import { hashPassword, verifyPassword } from "../auth/password";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

// Tight rate limit shared by login and change-password to prevent brute-force.
const sensitiveRateLimit = { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } };

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", sensitiveRateLimit, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.username, body.username)).limit(1);

    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await createSession(reply, user.id);
    return { user: { id: user.id, username: user.username, displayName: user.displayName } };
  });

  app.post("/logout", async (request, reply) => {
    await clearSession(request, reply);
    return { ok: true };
  });

  app.get("/me", async (request) => {
    const auth = await requireAuth(request);
    const memberships = await db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, auth.userId));
    return { user: auth, memberships };
  });

  app.post("/change-password", sensitiveRateLimit, async (request) => {
    const auth = await requireAuth(request);
    const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10) }).parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.currentPassword))) {
      throw Object.assign(new Error("Invalid current password"), { statusCode: 400 });
    }
    await db.update(users).set({ passwordHash: await hashPassword(body.newPassword), updatedAt: new Date() }).where(eq(users.id, auth.userId));
    return { ok: true };
  });

  app.get("/csrf", async (_request, reply) => ({ csrfToken: await reply.generateCsrf() }));
};
