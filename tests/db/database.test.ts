import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  ACTION_TYPES,
  ISSUE_TYPES,
  LANGUAGE_CODES,
  ORDER_STATUSES,
  PRIORITIES,
  REPORT_STATUSES,
  VALIDATION_OUTCOMES,
} from "@/domain";
import { AGENT_101, DISPATCHER, as, createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);

const count = async (role: "anon" | "authenticated" | "service_role", claims: object, table: string) =>
  Number((await as<{ n: number }>(db, role, claims, `select count(*)::int as n from ${table}`))[0].n);

describe("migrations + seed", () => {
  it("load into real Postgres", async () => {
    const r = await db.query<{ agents: number; orders: number; reports: number; audit: number }>(
      `select (select count(*)::int from agents) agents, (select count(*)::int from orders) orders,
              (select count(*)::int from voice_reports) reports, (select count(*)::int from audit_events) audit`,
    );
    expect(r.rows[0]).toEqual({ agents: 6, orders: 22, reports: 12, audit: 43 });
  });

  it("keep CHECK constraints in sync with the domain enums", () => {
    const sql = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261106000001_core_schema.sql"), "utf8");
    const list = (col: string) => {
      const m = new RegExp(String.raw`${col}\s+text not null check \(${col} in \(([^)]*)\)\)`).exec(sql);
      return m ? m[1].split(",").map((s) => s.trim().replace(/'/g, "")) : null;
    };
    expect(list("status")).toEqual([...ORDER_STATUSES]); // orders.status is the first status column
    expect(list("priority")).toEqual([...PRIORITIES]);
    expect(list("language")).toEqual([...LANGUAGE_CODES]);
    expect(list("outcome")).toEqual([...VALIDATION_OUTCOMES]);
    expect(list("type")).toEqual([...ACTION_TYPES]);
    expect(sql).toContain(REPORT_STATUSES.map((s) => `'${s}'`).join(","));
    expect(ISSUE_TYPES.length).toBeGreaterThan(0); // issue types live inside JSON payloads, validated by Zod
  });
});

describe("row-level security", () => {
  it("lets an agent see only their own orders and reports", async () => {
    const orders = await as<{ assigned_agent_id: string }>(db, "authenticated", AGENT_101, "select assigned_agent_id from orders");
    expect(orders.length).toBe(4);
    expect(new Set(orders.map((o) => o.assigned_agent_id))).toEqual(new Set(["AG-101"]));

    const reports = await as<{ agent_id: string }>(db, "authenticated", AGENT_101, "select agent_id from voice_reports");
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.agent_id === "AG-101")).toBe(true);

    // Child tables follow their report.
    expect(await count("authenticated", AGENT_101, "transcripts")).toBe(reports.length);
  });

  it("(control) the restriction comes from the RLS policy itself", async () => {
    const n = await db.transaction(async (tx) => {
      await tx.exec("alter table orders disable row level security");
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(AGENT_101)]);
      await tx.exec("set local role authenticated");
      const r = await tx.query<{ n: number }>("select count(*)::int as n from orders");
      await tx.rollback();
      return r.rows[0].n;
    });
    expect(n).toBe(22);
  });

  it("lets a dispatcher see everything", async () => {
    expect(await count("authenticated", DISPATCHER, "orders")).toBe(22);
    expect(await count("authenticated", DISPATCHER, "voice_reports")).toBe(12);
    expect(await count("authenticated", DISPATCHER, "audit_events")).toBe(43);
  });

  it("shows nothing to anonymous or role-less users", async () => {
    await expect(count("anon", {}, "orders")).rejects.toThrow(/permission denied/);
    expect(await count("authenticated", { role: "authenticated", app_metadata: {} }, "orders")).toBe(0);
    expect(await count("authenticated", { role: "authenticated", app_metadata: { role: "agent", agent_id: "AG-999" } }, "voice_reports")).toBe(0);
  });

  it("does not let signed-in users write directly", async () => {
    await expect(as(db, "authenticated", DISPATCHER, "update orders set status = 'DELIVERED' where id = 'ORD-4821'")).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", AGENT_101, "insert into audit_events (id, actor_id, actor_role, entity, entity_id, event, created_at) values ('x','x','AGENT','REPORT','x','x', now())")).rejects.toThrow(/permission denied/);
  });

  it("does not let signed-in users call server write functions", async () => {
    await expect(as(db, "authenticated", AGENT_101, "select public.next_report_id()")).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", DISPATCHER, `select public.save_report('{}'::jsonb)`)).rejects.toThrow(/permission denied/);
  });
});

describe("testing lab tables", () => {
  it("are readable by dispatchers only and writable by nobody but the server", async () => {
    await db.query(`insert into public.lab_samples (id, title, language, accent, noise, duration_ms, audio_path, mime_type, created_by) values ('LS-t', 't', 'hi-en', 'x', 'clean', 1000, 'LS-t.wav', 'audio/wav', 'test')`);
    expect(await count("authenticated", DISPATCHER, "lab_samples")).toBe(1);
    expect(await count("authenticated", AGENT_101, "lab_samples")).toBe(0);
    await expect(count("anon", {}, "lab_samples")).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", DISPATCHER, "delete from public.lab_samples")).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", DISPATCHER, "insert into public.lab_runs (id) values ('x')")).rejects.toThrow(/permission denied/);
    await db.query("delete from public.lab_samples where id = 'LS-t'");
  });
});

describe("realtime", () => {
  it("publishes exactly the tables the console listens to", async () => {
    const { rows } = await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1");
    expect(rows.map((r) => r.tablename)).toEqual(["audit_events", "orders", "voice_reports"]);
  });
});

describe("audit trail", () => {
  it("is append-only, even for the service role", async () => {
    await expect(as(db, "service_role", {}, "update audit_events set event = 'X'")).rejects.toThrow(/append-only/);
    await expect(as(db, "service_role", {}, "delete from audit_events")).rejects.toThrow(/append-only/);
  });

  it("appends through append_audit with generated ids", async () => {
    const rows = await as<{ id: string; event: string }>(db, "service_role", {}, `select id, event from public.append_audit($1::jsonb)`, [
      JSON.stringify([{ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: "R-1042", reportId: "R-1042", event: "TEST", before: null, after: { ok: true }, createdAt: "2026-11-06T10:00:00Z" }]),
    ]);
    expect(rows[0].id).toMatch(/^AE-\d{6}$/);
    expect(rows[0].event).toBe("TEST");
  });
});

describe("write functions", () => {
  it("issues report ids from a sequence", async () => {
    const [{ id }] = await as<{ id: string }>(db, "service_role", {}, "select public.next_report_id() as id");
    expect(id).toMatch(/^R-\d+$/);
  });

  it("save_report round-trips a report with its artefacts", async () => {
    const stored = {
      report: { id: "R-TEST-1", agentId: "AG-101", language: "hi-en", status: "AWAITING_CONFIRMATION", audioPath: null, audioDurationMs: 4000, failureReason: null, timings: [{ stage: "stt", latencyMs: 400 }], timingSource: "measured", createdAt: "2026-11-06T09:00:00Z", updatedAt: "2026-11-06T09:00:01Z" },
      transcript: { id: "R-TEST-1-T", reportId: "R-TEST-1", text: "order 4821", language: "hi-en", confidence: null, segments: [], provenance: { provider: "gnani-prisma", simulated: false, latencyMs: 400, createdAt: "2026-11-06T09:00:00Z" } },
      extraction: { id: "R-TEST-1-X", reportId: "R-TEST-1", payload: { ambiguities: [] }, provenance: { provider: "mock-llm", simulated: true, latencyMs: 2, createdAt: "2026-11-06T09:00:00Z" } },
      validation: { reportId: "R-TEST-1", outcome: "VERIFIED", checks: [], resolvedOrderId: "ORD-4821", clarificationQuestion: null },
      actionId: null,
      priority: "HIGH",
      confirmationPrompt: "Order 4821: confirm?",
    };
    const rows = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("select public.save_report($1::jsonb)", [JSON.stringify(stored)]);
      await tx.query("select public.save_report($1::jsonb)", [JSON.stringify({ ...stored, report: { ...stored.report, status: "REJECTED" } })]); // upsert
      const r = await tx.query(`select r.status, r.priority, t.text, v.resolved_order_id, x.payload from voice_reports r
        join transcripts t on t.report_id = r.id join validations v on v.report_id = r.id join extractions x on x.report_id = r.id where r.id = 'R-TEST-1'`);
      await tx.rollback();
      return r.rows;
    });
    expect(rows).toEqual([{ status: "REJECTED", priority: "HIGH", text: "order 4821", resolved_order_id: "ORD-4821", payload: { ambiguities: [] } }]);
  });

  const confirmArgs = (expectedUpdatedAt: string) => [
    "R-1042",
    JSON.stringify([{ stage: "execution", latencyMs: 3 }]),
    "2026-11-06T09:15:00Z",
    JSON.stringify({ id: "R-1042-A", orderId: "ORD-4821", type: "RESCHEDULE", payload: { slot: "18:00" }, status: "EXECUTED", confirmedBy: "AG-101", confirmedAt: "2026-11-06T09:15:00Z", executedAt: "2026-11-06T09:15:00Z" }),
    JSON.stringify({ id: "ORD-4821", status: "RESCHEDULED", instructions: null, slotStart: "2026-11-06T12:30:00Z", slotEnd: "2026-11-06T14:30:00Z", updatedAt: "2026-11-06T09:15:00Z" }),
    expectedUpdatedAt,
    JSON.stringify([{ actorId: "system", actorRole: "SYSTEM", entity: "ACTION", entityId: "R-1042-A", reportId: "R-1042", event: "ACTION_EXECUTED", before: null, after: {}, createdAt: "2026-11-06T09:15:00Z" }]),
  ];
  const CONFIRM_SQL = "select public.commit_confirmed_action($1, $2::jsonb, $3::timestamptz, $4::jsonb, $5::jsonb, $6::timestamptz, $7::jsonb)";

  it("commit_confirmed_action executes atomically", async () => {
    const result = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("update voice_reports set status = 'CONFIRMED' where id = 'R-1042'");
      const { rows: [o] } = await tx.query<{ updated_at: Date }>("select updated_at from orders where id = 'ORD-4821'");
      await tx.query(CONFIRM_SQL, confirmArgs(o.updated_at.toISOString()));
      const r = await tx.query(`select (select status from orders where id='ORD-4821') order_status,
        (select status from voice_reports where id='R-1042') report_status,
        (select count(*)::int from operational_actions where report_id='R-1042') actions,
        (select count(*)::int from audit_events where report_id='R-1042' and event='ACTION_EXECUTED') audits`);
      await tx.rollback();
      return r.rows[0];
    });
    expect(result).toEqual({ order_status: "RESCHEDULED", report_status: "EXECUTED", actions: 1, audits: 1 });
  });

  it("commit_confirmed_action refuses and changes nothing when the order changed meanwhile", async () => {
    const after = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      await tx.query("update voice_reports set status = 'CONFIRMED' where id = 'R-1042'");
      await tx.exec("savepoint s");
      await expect(tx.query(CONFIRM_SQL, confirmArgs("2000-01-01T00:00:00Z"))).rejects.toThrow(/ORDER_CHANGED/);
      await tx.exec("rollback to savepoint s");
      const r = await tx.query(`select (select status from orders where id='ORD-4821') order_status,
        (select count(*)::int from operational_actions where report_id='R-1042') actions`);
      await tx.rollback();
      return r.rows[0];
    });
    expect(after).toEqual({ order_status: "ATTEMPTED", actions: 0 });
  });

  it("commit_confirmed_action refuses a report that is not CONFIRMED", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        const { rows: [o] } = await tx.query<{ updated_at: Date }>("select updated_at from orders where id = 'ORD-4821'");
        await tx.query(CONFIRM_SQL, confirmArgs(o.updated_at.toISOString()));
      }),
    ).rejects.toThrow(/REPORT_NOT_CONFIRMED/);
  });
});
