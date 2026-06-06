create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text null,
  display_name text not null,
  auth_provider text not null default 'local',
  apple_sub text unique null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz null
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id),
  user_id uuid not null references users(id),
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table pages (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id),
  parent_page_id uuid null references pages(id),
  title text not null,
  icon text null,
  sort_order numeric not null default 0,
  created_by uuid not null references users(id),
  updated_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  deleted_at timestamptz null
);

create index pages_workspace_idx on pages(workspace_id);
create index pages_parent_idx on pages(parent_page_id);

create table page_documents (
  page_id uuid primary key references pages(id),
  workspace_id uuid not null references workspaces(id),
  yjs_state bytea not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table page_updates (
  id bigserial primary key,
  page_id uuid not null references pages(id),
  workspace_id uuid not null references workspaces(id),
  user_id uuid not null references users(id),
  update_binary bytea not null,
  created_at timestamptz not null default now()
);

create index page_updates_page_idx on page_updates(page_id);

create table page_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  source_page_id uuid not null references pages(id),
  target_page_id uuid not null references pages(id),
  created_at timestamptz not null default now(),
  unique(source_page_id, target_page_id)
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  uploaded_by uuid not null references users(id),
  storage_key text not null,
  original_filename text null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer null,
  height integer null,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table metadata_operations (
  idempotency_key text primary key,
  workspace_id uuid not null references workspaces(id),
  user_id uuid not null references users(id),
  type text not null,
  response_json text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key,
  user_id uuid not null references users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
