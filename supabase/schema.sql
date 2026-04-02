create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  username text not null unique,
  invite_code_used text,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  ban_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  exposure_consent_accepted boolean not null default false,
  age_confirmed boolean not null default false,
  onboarding_completed boolean not null default false,
  first_entry_pending boolean not null default true,
  terms_accepted_at timestamptz
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by_user_id uuid not null references public.profiles (id) on delete cascade,
  max_uses integer not null default 5,
  created_at timestamptz not null default now()
);

create table if not exists public.invite_usages (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites (id) on delete cascade,
  used_by_user_id uuid not null references public.profiles (id) on delete cascade,
  used_email text not null,
  used_username text not null,
  used_at timestamptz not null default now(),
  unique (invite_id, used_by_user_id)
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot_id text not null check (slot_id in ('01', '02', '03')),
  storage_path text not null,
  image_version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists photos_user_slot_active_idx
  on public.photos (user_id, slot_id, is_active)
  where is_active = true;

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  evaluator_user_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  target_photo_id uuid not null references public.photos (id) on delete cascade,
  question_id text not null,
  group_id text not null,
  stat_key text not null,
  answer_value integer not null check (answer_value between 1 and 5),
  response_time_ms integer not null,
  created_at timestamptz not null default now()
);

create index if not exists votes_target_photo_idx
  on public.votes (target_photo_id, created_at desc);

create index if not exists votes_target_user_idx
  on public.votes (target_user_id, created_at desc);

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  kind text not null check (kind in ('general', 'image')),
  direction text not null check (direction in ('to_admin', 'to_user')),
  from_user_id uuid references public.profiles (id) on delete set null,
  to_user_id uuid references public.profiles (id) on delete set null,
  subject text not null,
  body text not null,
  source_label text not null default 'Formulario',
  source_subject text,
  status text not null default 'new' check (status in ('new', 'read')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.invites enable row level security;
alter table public.invite_usages enable row level security;
alter table public.photos enable row level security;
alter table public.votes enable row level security;
alter table public.internal_messages enable row level security;

create policy "profiles are readable for signup and login"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "users insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users manage their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as admin_profile
      where admin_profile.id = auth.uid()
        and admin_profile.is_admin = true
    )
  );

create policy "admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as admin_profile
      where admin_profile.id = auth.uid()
        and admin_profile.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles as admin_profile
      where admin_profile.id = auth.uid()
        and admin_profile.is_admin = true
    )
  );

create policy "users manage their own settings"
  on public.user_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "public can read invites"
  on public.invites
  for select
  to anon, authenticated
  using (true);

create policy "invite owners manage their invites"
  on public.invites
  for all
  to authenticated
  using (auth.uid() = created_by_user_id)
  with check (auth.uid() = created_by_user_id);

create policy "public can read invite usages"
  on public.invite_usages
  for select
  to anon, authenticated
  using (true);

create policy "users can insert their invite usage"
  on public.invite_usages
  for insert
  to authenticated
  with check (auth.uid() = used_by_user_id);

create policy "owners manage their photos"
  on public.photos
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "authenticated users can read active photos"
  on public.photos
  for select
  to authenticated
  using (is_active = true);

create policy "authenticated users can insert votes"
  on public.votes
  for insert
  to authenticated
  with check (auth.uid() = evaluator_user_id);

create policy "authenticated users can read votes"
  on public.votes
  for select
  to authenticated
  using (true);

create policy "users can read their message threads"
  on public.internal_messages
  for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "admins can read all messages"
  on public.internal_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as admin_profile
      where admin_profile.id = auth.uid()
        and admin_profile.is_admin = true
    )
  );

create policy "users can send messages"
  on public.internal_messages
  for insert
  to authenticated
  with check (auth.uid() = from_user_id);

create policy "admins can send messages"
  on public.internal_messages
  for insert
  to authenticated
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1
      from public.profiles as admin_profile
      where admin_profile.id = auth.uid()
        and admin_profile.is_admin = true
    )
  );
