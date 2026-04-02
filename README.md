# Criticable

Criticable is a web MVP for a perception experiment, not a conventional social network.

## Product Frame

- Users upload only their own photos.
- The product evaluates projected impression, not personal identity.
- The system is anonymous and removes direct user-to-user contact.
- Entry is warning-first, with explicit acknowledgement before access.

## Current MVP Routes

- `/`: warning-led landing and consent gate
- `/experiment`: post-consent chamber shell with a short recurring reminder

## Design Direction

- Strong yellow background
- Black text and borders
- Minimal editorial layout
- No social-style avatars, chat patterns, or playful affordances

## Local Setup

1. Install dependencies with `npm install`
2. Start the dev server with `npm run dev`

Node.js and npm need to be available on the machine before running the app.

## Supabase

Criticable now includes the base configuration for Supabase.

- Local client: [lib/supabase/client.ts](/Users/carlos/Documents/criticable/lib/supabase/client.ts)
- Environment template: [.env.example](/Users/carlos/Documents/criticable/.env.example)
- Setup guide: [SUPABASE_SETUP.md](/Users/carlos/Documents/criticable/SUPABASE_SETUP.md)
- Initial SQL schema: [supabase/schema.sql](/Users/carlos/Documents/criticable/supabase/schema.sql)
