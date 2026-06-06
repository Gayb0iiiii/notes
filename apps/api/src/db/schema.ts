import { relations, sql } from "drizzle-orm";
import { bigint, bigserial, customType, index, integer, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  }
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  authProvider: text("auth_provider").notNull().default("local"),
  appleSub: text("apple_sub").unique(),
  ...timestamps,
  lastLoginAt: timestamp("last_login_at", { withTimezone: true })
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  ...timestamps
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: text("role", { enum: ["owner", "editor"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({ pk: primaryKey({ columns: [table.workspaceId, table.userId] }) })
);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    parentPageId: uuid("parent_page_id"),
    title: text("title").notNull(),
    icon: text("icon"),
    sortOrder: numeric("sort_order").notNull().default("0"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    updatedBy: uuid("updated_by").notNull().references(() => users.id),
    ...timestamps,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
  },
  (table) => ({
    workspaceIdx: index("pages_workspace_idx").on(table.workspaceId),
    parentIdx: index("pages_parent_idx").on(table.parentPageId)
  })
);

export const pageDocuments = pgTable("page_documents", {
  pageId: uuid("page_id").primaryKey().references(() => pages.id),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  yjsState: bytea("yjs_state").notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const pageUpdates = pgTable(
  "page_updates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pageId: uuid("page_id").notNull().references(() => pages.id),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    updateBinary: bytea("update_binary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({ pageIdx: index("page_updates_page_idx").on(table.pageId) })
);

export const pageLinks = pgTable(
  "page_links",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    sourcePageId: uuid("source_page_id").notNull().references(() => pages.id),
    targetPageId: uuid("target_page_id").notNull().references(() => pages.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({ sourceTargetUnique: unique().on(table.sourcePageId, table.targetPageId) })
);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  width: integer("width"),
  height: integer("height"),
  uploadStatus: text("upload_status", { enum: ["pending", "uploaded", "failed"] }).notNull().default("pending"),
  ...timestamps
});

export const metadataOperations = pgTable("metadata_operations", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const userRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers)
}));
