/**
 * Applies supabase/migrations to the database in SUPABASE_DB_URL, then optionally seeds it.
 * Each migration runs in its own transaction and is recorded in supabase_migrations.schema_migrations
 * (the table the Supabase CLI uses), so `supabase db push` later sees them as applied.
 *
 *   npm run db:migrate            # pending migrations only
 *   npm run db:migrate -- --seed  # plus supabase/seed.sql, if the database has no agents yet
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (see README → Connect Supabase).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const dir = path.resolve("supabase/migrations");

try {
  await sql`create schema if not exists supabase_migrations`;
  await sql`create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`;
  const applied = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version as string));

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    if (applied.has(version)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into supabase_migrations.schema_migrations (version, name, statements) values (${version}, ${rest.join("_")}, ${[body]})`;
    });
    console.log(`+ ${file} applied`);
  }

  if (process.argv.includes("--seed")) {
    const [{ n }] = await sql`select count(*)::int as n from public.agents`;
    if (n > 0) console.log(`✓ seed skipped (database already has ${n} agents)`);
    else {
      await sql.unsafe(fs.readFileSync(path.resolve("supabase/seed.sql"), "utf8"));
      const [c] = await sql`select (select count(*)::int from agents) agents, (select count(*)::int from orders) orders,
        (select count(*)::int from voice_reports) reports, (select count(*)::int from audit_events) audit`;
      console.log(`+ seed loaded: ${c.agents} agents, ${c.orders} orders, ${c.reports} reports, ${c.audit} audit events`);
    }
  }
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
