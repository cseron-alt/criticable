# Criticable Supabase Setup

## 1. Environment

This project expects:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Local values live in `.env.local`.

## 2. Database

Open your Supabase project and go to:

- `SQL Editor`
- create a new query
- paste the contents of [`supabase/schema.sql`](./supabase/schema.sql)
- run it
- if you already ran an earlier schema version, also run [`supabase/patch-auth-policies.sql`](./supabase/patch-auth-policies.sql)

That creates the initial tables for:

- profiles
- settings
- invite codes
- photo records
- votes
- internal admin messaging

## 3. Authentication

In Supabase:

- `Authentication` -> `Providers`
- enable `Email`
- keep email/password sign-in active
- disable mandatory email confirmation for this MVP so signup can enter immediately

For this MVP, the signup/login flow also uses a public-readable profile index through RLS
so that users can enter with email or username across devices.

## 4. Storage

Create a bucket called:

- `photos`

Recommended:

- private bucket
- access controlled through signed URLs or server logic

## 5. Admin user

After you create your own real admin account through Supabase Auth, mark it in SQL:

```sql
update public.profiles
set is_admin = true
where email = 'carlos@criticable.app';
```

## 6. Vercel

When the app is ready to deploy:

- import the GitHub repo into Vercel
- add the same environment variables there:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## 7. Important note

At this stage the app has the Supabase base prepared, but the full migration from
`localStorage` to shared Supabase auth/data still needs to be completed route by route.
