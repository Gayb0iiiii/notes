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
const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/"
} as const;

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

function authHeaderSessionId(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

export function requestSessionId(request: FastifyRequest): string | null {
  return authHeaderSessionId(request) ?? request.cookies[cookieName] ?? null;
}

export async function createSession(reply: FastifyReply, userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = sessionId();
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await db.insert(sessions).values({ id, userId, expiresAt });
  reply.setCookie(cookieName, id, {
    ...sessionCookieOptions,
    maxAge: Math.floor(sessionTtlMs / 1000),
    expires: expiresAt
  });
  return { id, expiresAt };
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = requestSessionId(request);
  if (id) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  reply.clearCookie(cookieName, sessionCookieOptions);
}

export async function requireAuth(request: FastifyRequest): Promise<AuthContext> {
  const id = requestSessionId(request);
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
