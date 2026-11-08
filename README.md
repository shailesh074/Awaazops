# AwaazOps

Voice operations intelligence for India's last-mile delivery: **Voice → Intelligence → Verification → Action.**

See [PROJECT.md](PROJECT.md) for the vision, architecture, decision log and development sequence.

## Run locally

```bash
npm install
cp .env.example .env.local   # demo mode: in-memory data, mock AI (labelled SIMULATED), no sign-in
npm run dev
```

- `/agent` — Agent Portal (mobile-first)
- `/dashboard` — Operations Dashboard
- `/lab` — Intelligence Testing Lab
- `/login` — sign-in (Supabase mode)

Real providers are switched on in `.env.local`: `AWAAZ_STT_PROVIDER=gnani-prisma`, `AWAAZ_TTS_PROVIDER=gnani-timbre`
(both need `GNANI_API_KEY`), `AWAAZ_LLM_PROVIDER=claude` (needs `ANTHROPIC_API_KEY`).

## Connect Supabase

1. Create a Supabase project. Put its URL, publishable (anon) key, secret (service role) key and the
   **Session pooler** connection string (`SUPABASE_DB_URL`, with your database password and no `[ ]`) in
   `.env.local`, and set `AWAAZ_DATA_BACKEND=supabase`.
2. Apply the schema and demo data:
   ```bash
   npm run db:migrate -- --seed
   ```
   Migrations are recorded in `supabase_migrations.schema_migrations`, so re-running is safe and the Supabase CLI
   sees them as applied. (Alternatively paste `supabase/migrations/*.sql` in order, then `supabase/seed.sql`, into
   the SQL editor.)
3. Create users and give them a role. Set the password in the environment, not on the command line:
   ```bash
   AWAAZ_PROVISION_PASSWORD='…' npm run db:provision -- --email ravi@example.com --role agent --agent AG-101
   AWAAZ_PROVISION_PASSWORD='…' npm run db:provision -- --email ops@example.com --role dispatcher
   ```
4. `npm run dev` and sign in at `/login`. Agents land on `/agent`, dispatchers on `/dashboard`.

**Security model.** Roles live in Supabase `app_metadata` (only the service role can set them). Page reads use the
signed-in user's session, so Postgres row-level security decides what each agent or dispatcher sees. The server
pipeline writes with the service role through transactional SQL functions, after checking the user. The proxy only
refreshes sessions and redirects; it is not the security boundary.

## API

| Endpoint | Who | Purpose |
|---|---|---|
| `POST /api/reports` | agent | multipart `audio`, `language` (`hi` \| `en` \| `hi-en`), `durationMs?`, `mockTranscript?` (mock STT only). Streams NDJSON stage events, then the result. |
| `GET /api/reports` | agent | The agent's own reports |
| `GET /api/reports/:id` | agent (own) / dispatcher | One report |
| `GET /api/reports/:id/recording` | agent (own) / dispatcher | The original recording (evidence) |
| `GET /api/reports/:id/prompt-audio` | agent (own) / dispatcher | Synthesized confirmation / clarification |
| `POST /api/reports/:id/edit` | agent (own) | JSON `{ orderReference?, requestedAction?, notes? }` — re-verified |
| `POST /api/reports/:id/confirm` | agent (own) | The only path to an operational change |
| `POST /api/reports/:id/reject` | agent (own) | Discard; nothing changes |
| `POST /api/lab/transcribe` | dispatcher | Real STT on a lab sample (refuses on the mock provider) |
| `GET /api/system/status` | anyone | Active providers and whether they are simulated |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Vitest: unit, pipeline, provider-contract and database tests (Postgres via PGlite) |
| `npm run db:seed:generate` | Regenerate `supabase/seed.sql` from the demo fixtures |
| `npm run db:migrate` | Apply pending migrations to `SUPABASE_DB_URL` (`-- --seed` also loads demo data once) |
| `npm run db:provision` | Create/update a user and set their role (see above) |
