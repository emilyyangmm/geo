create extension if not exists pgcrypto;

create table if not exists public.geo_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_name text not null default '',
  product_name text not null default '',
  website text not null default '',
  selling_points text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  competitors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, brand_name, product_name)
);

create table if not exists public.geo_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.geo_campaigns(id) on delete cascade,
  source_key text not null,
  title text not null,
  content text not null default '',
  summary text not null default '',
  tags jsonb not null default '[]'::jsonb,
  published_platforms jsonb not null default '[]'::jsonb,
  publication_links jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists geo_articles_user_source_key_unique
  on public.geo_articles (user_id, source_key);

create table if not exists public.geo_ai_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.geo_campaigns(id) on delete cascade,
  article_id uuid references public.geo_articles(id) on delete set null,
  platform text not null check (platform in ('doubao', 'deepseek', 'kimi', 'qianwen', 'wenxin')),
  keyword text not null,
  question text not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'manual_required', 'failed')),
  answer_text text not null default '',
  screenshot_path text,
  mentions_brand boolean,
  first_mention_index integer,
  mention_count integer not null default 0,
  sentiment text not null default 'unknown' check (sentiment in ('recommended', 'positive', 'neutral', 'negative', 'unknown')),
  competitors_found jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists geo_articles_campaign_generated_idx
  on public.geo_articles (user_id, campaign_id, generated_at desc);

create index if not exists geo_ai_scans_campaign_keyword_platform_idx
  on public.geo_ai_scans (user_id, campaign_id, keyword, platform, created_at desc);

alter table public.geo_campaigns enable row level security;
alter table public.geo_articles enable row level security;
alter table public.geo_ai_scans enable row level security;

grant select, insert, update, delete on public.geo_campaigns to authenticated;
grant select, insert, update, delete on public.geo_articles to authenticated;
grant select, insert, update, delete on public.geo_ai_scans to authenticated;

drop policy if exists "geo_campaigns_select_own" on public.geo_campaigns;
drop policy if exists "geo_campaigns_insert_own" on public.geo_campaigns;
drop policy if exists "geo_campaigns_update_own" on public.geo_campaigns;
drop policy if exists "geo_campaigns_delete_own" on public.geo_campaigns;
create policy "geo_campaigns_select_own" on public.geo_campaigns for select to authenticated using ((select auth.uid()) = user_id);
create policy "geo_campaigns_insert_own" on public.geo_campaigns for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "geo_campaigns_update_own" on public.geo_campaigns for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "geo_campaigns_delete_own" on public.geo_campaigns for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "geo_articles_select_own" on public.geo_articles;
drop policy if exists "geo_articles_insert_own" on public.geo_articles;
drop policy if exists "geo_articles_update_own" on public.geo_articles;
drop policy if exists "geo_articles_delete_own" on public.geo_articles;
create policy "geo_articles_select_own" on public.geo_articles for select to authenticated using ((select auth.uid()) = user_id);
create policy "geo_articles_insert_own" on public.geo_articles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "geo_articles_update_own" on public.geo_articles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "geo_articles_delete_own" on public.geo_articles for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "geo_ai_scans_select_own" on public.geo_ai_scans;
drop policy if exists "geo_ai_scans_insert_own" on public.geo_ai_scans;
drop policy if exists "geo_ai_scans_update_own" on public.geo_ai_scans;
drop policy if exists "geo_ai_scans_delete_own" on public.geo_ai_scans;
create policy "geo_ai_scans_select_own" on public.geo_ai_scans for select to authenticated using ((select auth.uid()) = user_id);
create policy "geo_ai_scans_insert_own" on public.geo_ai_scans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "geo_ai_scans_update_own" on public.geo_ai_scans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "geo_ai_scans_delete_own" on public.geo_ai_scans for delete to authenticated using ((select auth.uid()) = user_id);
