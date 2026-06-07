import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const client = new pg.Client({ connectionString: databaseUrl });
const migrationName = "0000_initial";

async function hasTable(tableName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>("select to_regclass($1) is not null as exists", [`public.${tableName}`]);
  return result.rows[0]?.exists ?? false;
}

async function main(): Promise<void> {
  await client.connect();

  try {
    await client.query(`
      create table if not exists notes_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = await client.query("select 1 from notes_migrations where name = $1", [migrationName]);
    if (applied.rowCount) {
      console.log(`Migration ${migrationName} already applied`);
      return;
    }

    const usersTableExists = await hasTable("users");
    if (usersTableExists) {
      await client.query("insert into notes_migrations (name) values ($1) on conflict do nothing", [migrationName]);
      console.log(`Existing schema detected; marked ${migrationName} as applied`);
      return;
    }

    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationPath = resolve(currentDir, "../drizzle/0000_initial.sql");
    const sql = await readFile(migrationPath, "utf8");

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into notes_migrations (name) values ($1)", [migrationName]);
      await client.query("commit");
      console.log(`Applied migration ${migrationName}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.end();
  }
}

await main();
