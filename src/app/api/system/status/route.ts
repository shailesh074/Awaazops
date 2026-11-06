import { connection } from "next/server";
import { getProviderStatus } from "@/server/providers/status";

/**
 * GET /api/system/status — which providers are active and whether they are simulated.
 * Returns names and booleans only; never keys or URLs.
 */
export async function GET() {
  // Reflect runtime env, not build-time env: opt out of prerendering.
  await connection();
  return Response.json({ providers: getProviderStatus() });
}
