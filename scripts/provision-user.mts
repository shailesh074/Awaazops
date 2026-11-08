/**
 * Creates or updates an AwaazOps user in YOUR Supabase project and sets their role.
 * Roles live in app_metadata, which only the service role can write — users cannot change their own.
 *
 *   npm run db:provision -- --email ravi@example.com --role agent --agent AG-101
 *   npm run db:provision -- --email ops@example.com  --role dispatcher
 *
 * The password is read from the AWAAZ_PROVISION_PASSWORD environment variable (never from argv, so it
 * doesn't land in shell history). Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import fs from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const { values } = parseArgs({
  options: { email: { type: "string" }, role: { type: "string" }, agent: { type: "string" } },
});
const { email, role, agent } = values;
const password = process.env.AWAAZ_PROVISION_PASSWORD;

if (!email || (role !== "agent" && role !== "dispatcher") || (role === "agent" && !agent)) {
  console.error("Usage: --email <email> --role agent|dispatcher [--agent AG-101]  (agent requires --agent)");
  process.exit(1);
}
if (!password || password.length < 12) {
  console.error("Set AWAAZ_PROVISION_PASSWORD (at least 12 characters) in the environment.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (e.g. in .env.local).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const app_metadata = role === "agent" ? { role, agent_id: agent } : { role };

if (role === "agent") {
  const { data, error } = await admin.from("agents").select("id").eq("id", agent!).maybeSingle();
  if (error || !data) {
    console.error(`Agent ${agent} does not exist in public.agents. Seed the database first.`);
    process.exit(1);
  }
}

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;
const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, app_metadata });
  if (error) throw error;
  console.log(`Updated ${email}: ${JSON.stringify(app_metadata)}`);
} else {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata });
  if (error) throw error;
  console.log(`Created ${email}: ${JSON.stringify(app_metadata)}`);
}
