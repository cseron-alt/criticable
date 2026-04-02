drop policy if exists "admins can read all profiles" on public.profiles;
drop policy if exists "admins can update profiles" on public.profiles;
drop policy if exists "admins can read all messages" on public.internal_messages;
drop policy if exists "admins can send messages" on public.internal_messages;

create policy "admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'bok-car@hotmail.com');

create policy "admins can update profiles"
  on public.profiles
  for update
  to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'bok-car@hotmail.com')
  with check (coalesce(auth.jwt() ->> 'email', '') = 'bok-car@hotmail.com');

create policy "admins can read all messages"
  on public.internal_messages
  for select
  to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'bok-car@hotmail.com');

create policy "admins can send messages"
  on public.internal_messages
  for insert
  to authenticated
  with check (
    auth.uid() = from_user_id
    and coalesce(auth.jwt() ->> 'email', '') = 'bok-car@hotmail.com'
  );

update public.profiles
set is_admin = true
where email = 'bok-car@hotmail.com';
