create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  uploaded_by uuid not null references users(id),
  status text not null default 'uploaded' check (status in ('uploaded', 'extracting', 'scanning', 'preview_ready', 'importing_metadata', 'uploading_assets', 'importing_documents', 'reindexing_links', 'completed', 'failed', 'cancelled')),
  source_type text not null default 'notion_export',
  original_filename text null,
  temp_storage_path text null,
  file_count integer not null default 0,
  page_count integer not null default 0,
  asset_count integer not null default 0,
  database_count integer not null default 0,
  unsupported_count integer not null default 0,
  total_size_bytes bigint not null default 0,
  error_count integer not null default 0,
  preview_json text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index import_jobs_workspace_idx on import_jobs(workspace_id);

create table import_pages (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references import_jobs(id) on delete cascade,
  source_path text not null,
  source_id_guess text not null,
  title text not null,
  parent_source_path text null,
  html_path text null,
  markdown_path text null,
  csv_path text null,
  asset_paths text not null default '[]',
  created_at timestamptz not null default now(),
  unique(import_job_id, source_path)
);

create table import_assets (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references import_jobs(id) on delete cascade,
  source_path text not null,
  original_filename text null,
  mime_type text null,
  size_bytes bigint not null default 0,
  kind text not null default 'unknown' check (kind in ('html', 'markdown', 'csv', 'image', 'pdf', 'file', 'unknown')),
  created_at timestamptz not null default now(),
  unique(import_job_id, source_path)
);

create table import_errors (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references import_jobs(id) on delete cascade,
  source_path text null,
  severity text not null check (severity in ('warning', 'error')),
  code text not null,
  message text not null,
  created_at timestamptz not null default now()
);
