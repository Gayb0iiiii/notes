import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "../db/client";
import { sessions, users, workspaceMembers } from "../db/schema";
import { config, isProduction } from "../config";
import type { Role } from "@notes/shared";

const sessionId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 48);
const cookieName = "notes_session";
const sessionTtlMs = 1000 * 60 * 60 * 24 * config.SESSION_TTL_DAYS;

export interface AuthContext {
  userId: string;
  username: string;
  displayName: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const id = sessionId();
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await db.insert(sessions).values({ id, userId, expiresAt });
  reply.setCookie(cookieName, id, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(sessionTtlMs / 1000),
    expires: expiresAt
  });
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = request.cookies[cookieName];
  if (id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  reply.clearCookie(cookieName, { path: "/" });
}

export async function requireAuth(request: FastifyRequest): Promise<AuthContext> {
  const id = request.cookies[cookieName];
  if (!id) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  const [row] = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  request.auth = row;
  return row;
}

export async function requireWorkspaceRole(request: FastifyRequest, workspaceId: string): Promise<Role> {
  const auth = request.auth ?? (await requireAuth(request));
  const [membership] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, auth.userId)))
    .limit(1);

  if (!membership) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }

  return membership.role as Role;
}
