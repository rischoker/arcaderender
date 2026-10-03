-- Tabla para la clasificación mundial de Castle Quest (pégala en Supabase → SQL Editor → Run)
create table if not exists castle_scores (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  name text not null,
  char text,
  level text not null,
  points int not null,
  accuracy int,
  correct int,
  total int,
  win boolean
);
create index if not exists castle_scores_level_points on castle_scores (level, points desc);
alter table castle_scores enable row level security;
create policy "read scores" on castle_scores for select using (true);
create policy "insert scores" on castle_scores for insert with check (true);
