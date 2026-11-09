/**
 * Strict, deterministic yes/no classifier for an agent's spoken answer to a confirmation prompt.
 *
 * A reply counts only when every word is either a known "yes" word or a filler ("haan ji", "theek hai",
 * "yes confirm it"), or every word is a "no" word or a filler ("nahi", "cancel karo"). Anything else —
 * mixed signals ("haan… nahi"), a negated yes ("sahi nahi hai"), extra content ("haan but slot 6 baje")
 * or silence — is "unclear", and the caller changes nothing. False negatives are cheap (the agent taps a
 * button); a false positive would execute an action the agent did not mean, so the lexicon stays narrow.
 */

export type SpokenDecision = "yes" | "no" | "unclear";

const YES = new Set([
  // English / Hinglish (romanised)
  "yes", "yeah", "yep", "yup", "confirm", "confirmed", "correct", "ok", "okay", "haan", "haa", "haanji", "hanji",
  "han", "theek", "thik", "thick", "sahi", "bilkul",
  // Devanagari
  "हाँ", "हां", "हा", "हांजी", "हाँजी", "ठीक", "सही", "बिल्कुल", "बिलकुल", "कन्फर्म", "ओके", "यस",
]);

const NO = new Set([
  "no", "nope", "nahi", "nahin", "nai", "na", "mat", "galat", "cancel", "reject", "wrong",
  "नहीं", "नही", "ना", "मत", "गलत", "ग़लत", "रद्द", "कैंसल", "नो",
]);

/** Words that carry no decision of their own. Kept short: an unknown word makes the reply unclear. */
const FILLER = new Set([
  "ji", "hai", "please", "sir", "madam", "it", "is", "that", "s", "its", "do", "it's", "kar", "karo", "kardo",
  "kijiye", "karein", "de", "dijiye", "ho", "gaya", "bhai", "haina",
  "जी", "है", "कर", "करो", "दो", "दीजिए", "कीजिए", "करें", "हो", "गया", "भाई",
]);

const MAX_WORDS = 6;

export function tokenizeReply(text: string): string[] {
  return (text.normalize("NFC").toLowerCase().match(/[\p{L}\p{M}']+/gu) ?? []).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);
}

export function classifySpokenReply(text: string): SpokenDecision {
  const words = tokenizeReply(text);
  if (words.length === 0 || words.length > MAX_WORDS) return "unclear";
  let yes = 0;
  let no = 0;
  for (const w of words) {
    if (YES.has(w)) yes++;
    else if (NO.has(w)) no++;
    else if (!FILLER.has(w)) return "unclear";
  }
  if (yes > 0 && no === 0) return "yes";
  if (no > 0 && yes === 0) return "no";
  return "unclear";
}
