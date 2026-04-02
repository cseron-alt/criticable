drop policy if exists "profiles are readable by authenticated users" on public.profiles;
drop policy if exists "profiles are readable for signup and login" on public.profiles;

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

create policy "public can read invites"
  on public.invites
  for select
  to anon, authenticated
  using (true);

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
