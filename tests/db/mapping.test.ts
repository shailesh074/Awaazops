import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { REPORTS } from "@/mocks/reports";
import { AUDIT_EVENTS } from "@/mocks/reports";
import { ORDERS } from "@/mocks/fleet";
import {
  agentFromRow,
  auditFromRow,
  orderFromRow,
  reportDetailFromRow,
  type AgentRow,
  type AuditRow,
  type OrderRow,
  type ReportRow,
} from "@/server/repositories/supabase-mapping";
import { createDb } from "./harness";

// Round trip: fixtures → generated seed.sql → save_report() → Postgres → JSON shaped like PostgREST's
// embedded select (REPORT_SELECT) → our row mapping → must equal the original fixtures.

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);

/** Same shape PostgREST returns for "*, transcripts(*), extractions(*), validations(*), operational_actions(*), prompt_audio(text, provenance)". */
const REPORT_JSON = `
  select to_jsonb(r) || jsonb_build_object(
    'transcripts', (select to_jsonb(t) from transcripts t where t.report_id = r.id),
    'extractions', (select to_jsonb(x) from extractions x where x.report_id = r.id),
    'validations', (select to_jsonb(v) from validations v where v.report_id = r.id),
    'operational_actions', (select to_jsonb(a) from operational_actions a where a.report_id = r.id),
    'prompt_audio', (select jsonb_build_object('text', p.text, 'provenance', p.provenance) from prompt_audio p where p.report_id = r.id)
  ) as row
  from voice_reports r`;

describe("Supabase row mapping", () => {
  it("reproduces every fixture report exactly", async () => {
    const agents = (await db.query<{ row: AgentRow }>("select to_jsonb(a) as row from agents a")).rows.map((r) => agentFromRow(r.row));
    const orders = (await db.query<{ row: OrderRow }>("select to_jsonb(o) as row from orders o")).rows.map((r) => orderFromRow(r.row));
    const rows = (await db.query<{ row: ReportRow }>(REPORT_JSON)).rows.map((r) => r.row);

    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const orderMap = new Map(orders.map((o) => [o.id, o]));
    for (const original of REPORTS) {
      const row = rows.find((r) => r.id === original.report.id)!;
      expect(reportDetailFromRow(row, agentMap, orderMap)).toEqual(original);
    }
  });

  it("reproduces orders and audit events, normalising Postgres timestamps", async () => {
    const orders = (await db.query<{ row: OrderRow }>("select to_jsonb(o) as row from orders o")).rows.map((r) => orderFromRow(r.row));
    expect(orders.sort((a, b) => a.id.localeCompare(b.id))).toEqual([...ORDERS].sort((a, b) => a.id.localeCompare(b.id)));

    const audit = (await db.query<{ row: AuditRow }>("select to_jsonb(e) as row from audit_events e order by created_at desc, seq desc")).rows.map((r) => auditFromRow(r.row));
    // jsonb reorders object keys, so compare structurally (order-insensitive), sorted by id.
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect([...audit].sort(byId)).toEqual([...AUDIT_EVENTS].sort(byId));
  });

  it("hides a report whose agent the viewer cannot see", async () => {
    const [row] = (await db.query<{ row: ReportRow }>(`${REPORT_JSON} where r.id = 'R-1042'`)).rows.map((r) => r.row);
    expect(reportDetailFromRow(row, new Map(), new Map())).toBeNull();
  });
});
