import "server-only";
import { getServerEnv } from "@/server/env";
import { GnaniPrismaProvider } from "./gnani-prisma";
import { MockSttProvider } from "./mock";
import type { SpeechToTextProvider } from "./types";

export type * from "./types";

/** Returns the configured provider. A real provider that fails is surfaced — never swapped for the mock. */
export function getSttProvider(): SpeechToTextProvider {
  return getServerEnv().AWAAZ_STT_PROVIDER === "gnani-prisma"
    ? new GnaniPrismaProvider()
    : new MockSttProvider();
}
