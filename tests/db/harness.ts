import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Real Postgres (PGlite) with the pieces of Supabase our migrations rely on, recreated the way Supabase
 * defines them: the anon / authenticated / service_role roles, auth.jwt() reading request.jwt.claims,
 * and storage.buckets. Then the actual migrations and seed are applied unchanged.
 */
const SUPABASE_BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's real defaults: every new public table/sequence/function is fully granted to all three roles.
  -- (Verified live 2026-11-08: an authenticated UPDATE without explicit revokes matched 0 rows instead of failing.)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
`;

const root = path.resolve(import.meta.dirname, "../..");

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);
  const dir = path.join(root, "supabase/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  await db.exec(fs.readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
  // Mirror Supabase: the service role can use sequences created by migrations.
  await db.exec("grant usage, select on all sequences in schema public to service_role;");
  return db;
}

export type Claims = { role?: string; app_metadata?: { role?: string; agent_id?: string }; sub?: string };

/** Runs `sql` as a database role with the given JWT claims, inside a transaction that is rolled back. */
export async function as<T = Record<string, unknown>>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  claims: Claims,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    const res = await tx.query<T>(sql, params);
    await tx.rollback();
    return res.rows;
  });
}

export const AGENT_101: Claims = { role: "authenticated", sub: "00000000-0000-0000-0000-000000000101", app_metadata: { role: "agent", agent_id: "AG-101" } };
export const DISPATCHER: Claims = { role: "authenticated", sub: "00000000-0000-0000-0000-000000000900", app_metadata: { role: "dispatcher" } };
