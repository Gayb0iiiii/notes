import { eq } from "drizzle-orm";
import { hashPassword } from "./auth/password";
import { db } from "./db/client";
import { users, workspaceMembers, workspaces } from "./db/schema";

const username = process.env.SEED_OWNER_USERNAME ?? "owner";
const password = process.env.SEED_OWNER_PASSWORD ?? "change-me-now";
const displayName = process.env.SEED_OWNER_DISPLAY_NAME ?? "Workspace Owner";
const workspaceName = process.env.SEED_WORKSPACE_NAME ?? "Private Notes";

const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
if (existing) {
  console.log(`Seed user ${username} already exists`);
  process.exit(0);
}

const [owner] = await db
  .insert(users)
  .values({ username, displayName, passwordHash: await hashPassword(password) })
  .returning();
const [workspace] = await db.insert(workspaces).values({ name: workspaceName, ownerUserId: owner.id }).returning();
await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: owner.id, role: "owner" });
console.log(`Seeded owner ${username} and workspace ${workspaceName}`);
