-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/wwwqueddxfilhhpjuybb)
-- Enable RLS
alter table if exists boards enable row level security;
alter table if exists sources enable row level security;
alter table if exists articles enable row level security;
alter table if exists daily_reports enable row level security;

-- Boards table
create table if not exists boards (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  icon text default '📁',
  color text,
  criteria jsonb default '{}',
  keywords text[] default '{}',
  exclude_keywords text[] default '{}',
  min_importance int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sources table
create table if not exists sources (
  id uuid default gen_random_uuid() primary key,
  board_id uuid not null references boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('rss', 'wechat', 'api', 'web')),
  url text not null,
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Articles table
create table if not exists articles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid references boards(id) on delete set null,
  source_id uuid references sources(id) on delete set null,
  title text not null,
  summary text,
  content text,
  url text not null,
  image_url text,
  author text,
  published_at timestamptz,
  fetched_at timestamptz default now(),
  importance_score int default 50,
  sentiment text default 'neutral' check (sentiment in ('positive', 'neutral', 'negative')),
  tags text[] default '{}',
  is_read boolean default false,
  is_favorite boolean default false,
  hash text not null,
  created_at timestamptz default now(),
  unique(user_id, hash)
);

-- Model configs table
create table if not exists model_configs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  alias text not null,
  provider text not null,
  api_key text not null,
  base_url text,
  model text not null,
  temperature float default 0.3,
  max_tokens int default 800,
  system_prompt text,
  enabled boolean default true,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Daily reports table
create table if not exists daily_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  title text not null,
  summary text,
  article_count int default 0,
  top_articles jsonb default '[]',
  is_sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- Indexes
create index if not exists idx_articles_user_board on articles(user_id, board_id);
create index if not exists idx_articles_user_date on articles(user_id, published_at desc);
create index if not exists idx_articles_hash on articles(user_id, hash);
create index if not exists idx_articles_search on articles using gin(to_tsvector('simple', title || ' ' || coalesce(summary, '')));

-- RLS Policies
create policy "Users can CRUD their own boards"
  on boards for all using (auth.uid() = user_id);
create policy "Users can CRUD their own sources"
  on sources for all using (auth.uid() = user_id);
create policy "Users can CRUD their own articles"
  on articles for all using (auth.uid() = user_id);
create policy "Users can CRUD their own daily_reports"
  on daily_reports for all using (auth.uid() = user_id);
create policy "Users can CRUD their own model_configs"
  on model_configs for all using (auth.uid() = user_id);

create index if not exists idx_model_configs_user_default on model_configs(user_id, is_default);

-- Update trigger for updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_boards_updated_at before update on boards
  for each row execute function update_updated_at_column();
create trigger update_sources_updated_at before update on sources
  for each row execute function update_updated_at_column();
