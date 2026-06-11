import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const client = new pg.Client({ connectionString: databaseUrl });
const initialMigrationName = "0000_initial";
const importJobsMigrationName = "0001_import_jobs";

async function hasTable(tableName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>("select to_regclass($1) is not null as exists", [`public.${tableName}`]);
  return result.rows[0]?.exists ?? false;
}

async function migrationApplied(name: string): Promise<boolean> {
  const applied = await client.query("select 1 from notes_migrations where name = $1", [name]);
  return Boolean(applied.rowCount);
}

async function markMigrationApplied(name: string): Promise<void> {
  await client.query("insert into notes_migrations (name) values ($1) on conflict do nothing", [name]);
}

async function runSqlMigration(name: string, pathFromDist: string): Promise<void> {
  if (await migrationApplied(name)) {
    console.log(`Migration ${name} already applied`);
    return;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migrationPath = resolve(currentDir, pathFromDist);
  const sql = await readFile(migrationPath, "utf8");

  await client.query("begin");
  try {
    await client.query(sql);
    await markMigrationApplied(name);
    await client.query("commit");
    console.log(`Applied migration ${name}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
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

    const usersTableExists = await hasTable("users");
    if (await migrationApplied(initialMigrationName)) {
      console.log(`Migration ${initialMigrationName} already applied`);
    } else if (usersTableExists) {
      await markMigrationApplied(initialMigrationName);
      console.log(`Existing schema detected; marked ${initialMigrationName} as applied`);
    } else {
      await runSqlMigration(initialMigrationName, "../drizzle/0000_initial.sql");
    }

    if (!(await hasTable("import_jobs"))) {
      await runSqlMigration(importJobsMigrationName, "../drizzle/0001_import_jobs.sql");
    } else {
      await markMigrationApplied(importJobsMigrationName);
      console.log(`Existing import schema detected; marked ${importJobsMigrationName} as applied`);
    }
  } finally {
    await client.end();
  }
}

await main();
