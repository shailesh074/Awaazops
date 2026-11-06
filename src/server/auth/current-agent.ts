import "server-only";
import { DEMO_AGENT_ID } from "@/mocks/fleet";

/**
 * Identity of the acting agent. Until Supabase Auth (step 8) every request acts as the demo agent.
 * The client never supplies an agent ID — identity is always resolved server-side.
 */
export async function getCurrentAgentId(): Promise<string> {
  return DEMO_AGENT_ID;
}
