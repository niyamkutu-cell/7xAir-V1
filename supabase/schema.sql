-- 7xAir Supabase PostgreSQL Schema, Storage Bucket, and Row-Level Security (RLS)
-- Run this entire file inside Supabase Dashboard -> SQL Editor -> New Query.

-- 1. User Profiles & Admin Permissions
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  email text unique not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Public can read profile usernames"
  on public.profiles for select
  using (true);

create policy "Users can update own non-role profile fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- 2. Showcase Screenshots Table
create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  author_username text not null,
  title text not null check (char_length(title) between 3 and 72),
  caption text not null default '',
  mc_version text not null check (mc_version in ('1.21.11', '26.2')),
  theme text not null check (theme in (
    'azure-mountains', 'emerald-wilderness', 'midnight-forest',
    'dreamy-anime', 'sunset-horizon', 'frozen-peaks', 'sakura-valley'
  )),
  storage_path text,
  public_url text not null,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.screenshots enable row level security;

create policy "Public can read approved screenshots"
  on public.screenshots for select
  using (approved = true);

create policy "Authenticated users can insert screenshots"
  on public.screenshots for insert
  with check (auth.uid() = user_id);

create policy "Admins can delete or moderate any screenshot"
  on public.screenshots for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 3. Releases & Changelog Metadata (Strictly Windows EXE only, NO standalone .jar)
create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  version text unique not null,
  channel text not null default 'stable' check (channel in ('stable', 'beta')),
  published_at timestamptz not null default now(),
  release_notes text not null,
  highlights jsonb not null default '[]'::jsonb,
  windows_installer_url text not null check (
    windows_installer_url ilike '%.exe' and windows_installer_url not ilike '%.jar%'
  ),
  windows_installer_sha256 text not null check (char_length(windows_installer_sha256) = 64),
  windows_installer_size bigint not null default 0,
  is_latest boolean not null default false
);

alter table public.releases enable row level security;

create policy "Public can read releases"
  on public.releases for select
  using (true);

create policy "Only admins can manage releases"
  on public.releases for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 4. Supabase Storage Bucket for Showcase Screenshots
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "Public read access for screenshots bucket"
  on storage.objects for select
  using (bucket_id = 'screenshots');

create policy "Authenticated users can upload to screenshots bucket"
  on storage.objects for insert
  with check (bucket_id = 'screenshots' and auth.role() = 'authenticated');

create policy "Admins can delete screenshots from storage"
  on storage.objects for delete
  using (
    bucket_id = 'screenshots'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
