-- Galileo Journal: profiles, invitations, editorial posts, revisions, and media.
-- Apply through `supabase db push` or the Supabase SQL editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public.member_role as enum ('reader', 'editor', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.post_status as enum ('draft', 'review', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 100),
  avatar_url text,
  bio text check (bio is null or char_length(bio) <= 500),
  role public.member_role not null default 'reader',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editor_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role public.member_role not null check (role in ('editor', 'admin')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint editor_invites_email_normalised check (email = lower(trim(email)))
);

create unique index if not exists editor_invites_email_unique
  on public.editor_invites (lower(email));

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null constraint posts_author_id_fkey references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 5 and 140),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  excerpt text not null check (char_length(excerpt) between 30 and 320),
  body_markdown text not null check (char_length(body_markdown) between 80 and 100000),
  category text not null check (char_length(category) between 3 and 60),
  cover_path text,
  status public.post_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_posts_have_date check (status <> 'published' or published_at is not null)
);

create index if not exists posts_public_feed_idx
  on public.posts (published_at desc)
  where status = 'published';
create index if not exists posts_author_idx on public.posts (author_id, updated_at desc);
create index if not exists posts_status_idx on public.posts (status, updated_at desc);

create table if not exists public.post_revisions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  editor_id uuid references public.profiles(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists post_revisions_post_idx
  on public.post_revisions (post_id, created_at desc);

create or replace function public.current_member_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role from public.profiles where id = (select auth.uid())),
    'reader'::public.member_role
  );
$$;

revoke all on function public.current_member_role() from public;
grant execute on function public.current_member_role() to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create or replace function public.capture_post_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.post_revisions (post_id, editor_id, snapshot)
  values (
    old.id,
    (select auth.uid()),
    jsonb_build_object(
      'title', old.title,
      'slug', old.slug,
      'excerpt', old.excerpt,
      'body_markdown', old.body_markdown,
      'category', old.category,
      'cover_path', old.cover_path,
      'status', old.status,
      'published_at', old.published_at,
      'updated_at', old.updated_at
    )
  );
  return new;
end;
$$;

drop trigger if exists posts_capture_revision on public.posts;
create trigger posts_capture_revision
before update on public.posts
for each row
when (old.* is distinct from new.*)
execute function public.capture_post_revision();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited_role public.member_role;
begin
  select role into invited_role
  from public.editor_invites
  where lower(email) = lower(new.email)
  limit 1;

  insert into public.profiles (id, display_name, avatar_url, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      split_part(coalesce(new.email, 'team-member'), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    coalesce(invited_role, 'reader'::public.member_role)
  )
  on conflict (id) do nothing;

  if invited_role is not null then
    update public.editor_invites
    set accepted_at = coalesce(accepted_at, now())
    where lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Bootstrap the two co-founders whose public team contacts are already confirmed.
insert into public.editor_invites (email, role)
values
  ('ghimpausilviu@gmail.com', 'admin'),
  ('loren.bufanu@gmail.com', 'admin')
on conflict ((lower(email))) do update set role = excluded.role;

-- Backfill profiles safely if the auth users existed before this migration.
insert into public.profiles (id, display_name, avatar_url, role)
select
  users.id,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'full_name', ''),
    nullif(users.raw_user_meta_data ->> 'user_name', ''),
    split_part(coalesce(users.email, 'team-member'), '@', 1)
  ),
  nullif(users.raw_user_meta_data ->> 'avatar_url', ''),
  coalesce(invites.role, 'reader'::public.member_role)
from auth.users as users
left join public.editor_invites as invites on lower(invites.email) = lower(users.email)
on conflict (id) do update
set role = excluded.role;

alter table public.profiles enable row level security;
alter table public.editor_invites enable row level security;
alter table public.posts enable row level security;
alter table public.post_revisions enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
on public.profiles for select
using (true);

drop policy if exists "Members update their public profile" on public.profiles;
create policy "Members update their public profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Admins manage editor invitations" on public.editor_invites;
create policy "Admins manage editor invitations"
on public.editor_invites for all
to authenticated
using ((select public.current_member_role()) = 'admin')
with check ((select public.current_member_role()) = 'admin');

drop policy if exists "Published posts and editorial workspace are readable" on public.posts;
create policy "Published posts and editorial workspace are readable"
on public.posts for select
using (
  (status = 'published' and published_at <= now())
  or (select public.current_member_role()) in ('editor', 'admin')
);

drop policy if exists "Editors create their own drafts" on public.posts;
create policy "Editors create their own drafts"
on public.posts for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (select public.current_member_role()) in ('editor', 'admin')
  and (
    (select public.current_member_role()) = 'admin'
    or status in ('draft', 'review')
  )
);

drop policy if exists "Editors update owned drafts and admins update all" on public.posts;
create policy "Editors update owned drafts and admins update all"
on public.posts for update
to authenticated
using (
  (select public.current_member_role()) = 'admin'
  or (
    (select public.current_member_role()) = 'editor'
    and author_id = (select auth.uid())
  )
)
with check (
  (select public.current_member_role()) = 'admin'
  or (
    (select public.current_member_role()) = 'editor'
    and author_id = (select auth.uid())
    and status in ('draft', 'review')
  )
);

drop policy if exists "Admins delete posts" on public.posts;
create policy "Admins delete posts"
on public.posts for delete
to authenticated
using ((select public.current_member_role()) = 'admin');

drop policy if exists "Editorial members read revisions" on public.post_revisions;
create policy "Editorial members read revisions"
on public.post_revisions for select
to authenticated
using ((select public.current_member_role()) in ('editor', 'admin'));

revoke all on public.profiles, public.editor_invites, public.posts, public.post_revisions from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url, bio) on public.profiles to authenticated;
grant select, insert, update, delete on public.editor_invites to authenticated;
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
grant select on public.post_revisions to authenticated;
grant usage, select on sequence public.post_revisions_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-media',
  'journal-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Journal media is public" on storage.objects;
create policy "Journal media is public"
on storage.objects for select
using (bucket_id = 'journal-media');

drop policy if exists "Editors upload journal media" on storage.objects;
create policy "Editors upload journal media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'journal-media'
  and (select public.current_member_role()) in ('editor', 'admin')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Editors update owned media and admins update all" on storage.objects;
create policy "Editors update owned media and admins update all"
on storage.objects for update
to authenticated
using (
  bucket_id = 'journal-media'
  and (
    (select public.current_member_role()) = 'admin'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
)
with check (
  bucket_id = 'journal-media'
  and (
    (select public.current_member_role()) = 'admin'
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);

drop policy if exists "Admins delete journal media" on storage.objects;
drop policy if exists "Editors delete owned media and admins delete all" on storage.objects;
create policy "Editors delete owned media and admins delete all"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'journal-media'
  and (
    (select public.current_member_role()) = 'admin'
    or (
      (select public.current_member_role()) = 'editor'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
);
