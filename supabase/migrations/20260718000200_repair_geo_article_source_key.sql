-- Existing deployments may have created geo_articles before source_key was introduced.
-- Repair those installations without losing their prior article records.
alter table public.geo_articles add column if not exists source_key text;

update public.geo_articles
set source_key = 'legacy-' || id::text
where source_key is null or btrim(source_key) = '';

alter table public.geo_articles alter column source_key set not null;

create unique index if not exists geo_articles_user_source_key_uidx
  on public.geo_articles (user_id, source_key);
