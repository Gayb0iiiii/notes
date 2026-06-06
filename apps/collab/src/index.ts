import { Server } from "@hocuspocus/server";
import pg from "pg";
import * as Y from "yjs";
import { z } from "zod";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    COLLAB_PORT: z.coerce.number().default(4001)
  })
  .parse(process.env);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

const roomSchema = /^workspace:([0-9a-f-]+):page:([0-9a-f-]+)$/i;

async function authenticate(cookieHeader: string | undefined, workspaceId: string): Promise<{ userId: string; displayName: string }> {
  const sessionId = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("notes_session="))
    ?.split("=")[1];

  if (!sessionId) throw new Error("Unauthorized");

  const result = await pool.query(
    `select u.id, u.display_name
       from sessions s
       join users u on u.id = s.user_id
       join workspace_members wm on wm.user_id = u.id and wm.workspace_id = $2
      where s.id = $1 and s.expires_at > now()
      limit 1`,
    [sessionId, workspaceId]
  );

  const row = result.rows[0];
  if (!row) throw new Error("Unauthorized");
  return { userId: row.id, displayName: row.display_name };
}

async function loadDocument(pageId: string, workspaceId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const snapshot = await pool.query("select yjs_state from page_documents where page_id = $1 and workspace_id = $2", [pageId, workspaceId]);
  if (snapshot.rows[0]?.yjs_state) {
    Y.applyUpdate(doc, new Uint8Array(snapshot.rows[0].yjs_state));
  }
  const updates = await pool.query("select update_binary from page_updates where page_id = $1 and workspace_id = $2 order by id asc", [pageId, workspaceId]);
  for (const row of updates.rows) {
    Y.applyUpdate(doc, new Uint8Array(row.update_binary));
  }
  return doc;
}

async function persistDocument(pageId: string, workspaceId: string, userId: string, doc: Y.Doc, update: Uint8Array): Promise<void> {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  const updateBinary = Buffer.from(update);
  await pool.query("begin");
  try {
    await pool.query(
      "insert into page_updates (page_id, workspace_id, user_id, update_binary) values ($1, $2, $3, $4)",
      [pageId, workspaceId, userId, updateBinary]
    );
    await pool.query(
      `insert into page_documents (page_id, workspace_id, yjs_state, version, updated_at)
       values ($1, $2, $3, 1, now())
       on conflict (page_id)
       do update set yjs_state = excluded.yjs_state, version = page_documents.version + 1, updated_at = now()`,
      [pageId, workspaceId, state]
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

const server = Server.configure({
  port: env.COLLAB_PORT,
  async onAuthenticate({ documentName, requestHeaders }) {
    const match = roomSchema.exec(documentName);
    if (!match) throw new Error("Invalid room");
    const [, workspaceId] = match;
    const user = await authenticate(requestHeaders.cookie, workspaceId);
    return { user };
  },
  async onLoadDocument({ documentName }) {
    const match = roomSchema.exec(documentName);
    if (!match) throw new Error("Invalid room");
    const [, workspaceId, pageId] = match;
    return loadDocument(pageId, workspaceId);
  },
  async onStoreDocument({ documentName, document, context }) {
    const match = roomSchema.exec(documentName);
    if (!match) throw new Error("Invalid room");
    const [, workspaceId, pageId] = match;
    const userId = context.user?.userId;
    if (!userId) throw new Error("Unauthorized");
    const update = Y.encodeStateAsUpdate(document);
    await persistDocument(pageId, workspaceId, userId, document, update);
  },
  async onChange({ documentName, update, document, context }) {
    const match = roomSchema.exec(documentName);
    if (!match) throw new Error("Invalid room");
    const [, workspaceId, pageId] = match;
    const userId = context.user?.userId;
    if (!userId) throw new Error("Unauthorized");
    await persistDocument(pageId, workspaceId, userId, document, update);
  }
});

server.listen();
console.log(`Collaboration server listening on ${env.COLLAB_PORT}`);
