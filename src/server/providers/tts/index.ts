import "server-only";
import { getServerEnv } from "@/server/env";
import { GnaniTimbreProvider } from "./gnani-timbre";
import { MockTtsProvider } from "./mock";
import type { TextToSpeechProvider } from "./types";

export type * from "./types";

export function getTtsProvider(): TextToSpeechProvider {
  return getServerEnv().AWAAZ_TTS_PROVIDER === "gnani-timbre"
    ? new GnaniTimbreProvider()
    : new MockTtsProvider();
}
