create table if not exists public.geo_article_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.geo_articles(id) on delete cascade,
  platform text not null,
  article_title text not null default '',
  published_url text not null default '',
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'manual')),
  source text not null default 'automatic'
    check (source in ('automatic', 'manual')),
  published_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, article_id, platform, published_url)
);

alter table public.geo_ai_scans
  add column if not exists source_refs jsonb not null default '[]'::jsonb,
  add column if not exists citation_matches jsonb not null default '[]'::jsonb,
  add column if not exists cited_publication_count integer not null default 0;

create index if not exists geo_article_publications_article_idx
  on public.geo_article_publications (user_id, article_id, status, created_at desc);

create index if not exists geo_article_publications_campaign_lookup_idx
  on public.geo_article_publications (user_id, platform, status);

alter table public.geo_article_publications enable row level security;
grant select, insert, update, delete on public.geo_article_publications to authenticated;

drop policy if exists "geo_article_publications_select_own" on public.geo_article_publications;
drop policy if exists "geo_article_publications_insert_own" on public.geo_article_publications;
drop policy if exists "geo_article_publications_update_own" on public.geo_article_publications;
drop policy if exists "geo_article_publications_delete_own" on public.geo_article_publications;

create policy "geo_article_publications_select_own" on public.geo_article_publications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "geo_article_publications_insert_own" on public.geo_article_publications
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "geo_article_publications_update_own" on public.geo_article_publications
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "geo_article_publications_delete_own" on public.geo_article_publications
  for delete to authenticated using ((select auth.uid()) = user_id);
