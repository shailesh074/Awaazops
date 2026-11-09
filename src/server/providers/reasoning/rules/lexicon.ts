import type { ActionType, IssueType } from "@/domain";

/**
 * Vocabulary for the deterministic rules engine: romanised Hindi / Hinglish, Indian English and
 * Devanagari Hindi, including spellings Gnani Prisma produced in live tests ("char auth do ek",
 * "order 4,907"). Each entry is a regex SOURCE matched case-insensitively with Unicode semantics.
 *
 * Word boundaries: `\b` does not work for Devanagari, and Devanagari vowel signs are Unicode marks
 * (\p{M}), so boundaries treat letters, marks and digits as word characters.
 */
export const B = String.raw`(?<![\p{L}\p{M}\p{N}])`;
export const E = String.raw`(?![\p{L}\p{M}\p{N}])`;
const alt = (...xs: string[]) => `(?:${xs.join("|")})`;
/** Hindi verb/inflection tail: matches "utha", "uthaya", "utha raha", "उठा", "उठाया"… */
const TAIL = String.raw`[\p{L}\p{M}]*`;

// ── Numbers ───────────────────────────────────────────────────────────────────────────────────────

/** Digits, grouped digits (Prisma `transcribe`: "4,821") and Devanagari digits. */
export const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d{3,}|[०-९]{3,})`;

/** Single-digit words: romanised Hindi, English, Devanagari Hindi, and English digits as Prisma writes them in Devanagari. */
export const DIGIT_WORD = alt(
  "shunya", "sunya", "zero", "ek", "ik", "one", "do", "two", "teen", "tin", "three", "chaa?r", "four",
  "paa?n?ch", "paach", "five", "chh?e", "chhah", "chah", "six", "saa?t", "seven", "aa?th", "auth", "aat", "eight",
  "nau", "nao", "nine",
  "शून्य", "ज़ीरो", "जीरो", "एक", "दो", "तीन", "चार", "पांच", "पाँच", "छह", "छः", "छे", "सात", "आठ", "नौ",
  "वन", "टू", "थ्री", "फोर", "फ़ोर", "फाइव", "सिक्स", "सेवन", "एट", "नाइन",
);
/** Three or more digit words in a row (optionally comma-separated). */
export const DIGIT_WORDS_SEQ = String.raw`${DIGIT_WORD}(?:[\s,]+${DIGIT_WORD}){2,}`;

export const ORDER_KEYWORD = alt("order", "ord", "ऑर्डर", "आर्डर", "ऑडर", "ओर्डर");
export const ORDER_NUMBER_WORD = alt("no\\.?", "number", "nambar", "नंबर", "नम्बर", "नं\\.?");
export const ORDER_SUFFIX = alt("ka", "ke", "ki", "wala", "wali", "vala", "vali", "का", "के", "की", "वाला", "वाली");

/** Hour words 1–12 for time expressions ("shaam chhe baje", "शाम छह बजे"). */
export const HOUR_WORDS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, chhah: 6, che: 6, saat: 7, sat: 7,
  aath: 8, ath: 8, nau: 9, das: 10, dus: 10, gyarah: 11, gyaarah: 11, barah: 12, baarah: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, छे: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
};
export const HOUR = alt(String.raw`\d{1,2}`, String.raw`[०-९]{1,2}`, ...Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length));
export const HALF = alt("saadhe", "sadhe", "saade", "साढ़े", "साढे");

export const PERIOD: Record<string, "morning" | "afternoon" | "evening" | "night"> = {
  subah: "morning", subha: "morning", savere: "morning", savera: "morning", morning: "morning", सुबह: "morning", सवेरे: "morning",
  dopahar: "afternoon", dopehar: "afternoon", afternoon: "afternoon", दोपहर: "afternoon",
  shaam: "evening", sham: "evening", evening: "evening", शाम: "evening",
  raat: "night", rat: "night", night: "night", रात: "night",
};
export const PERIOD_WORD = alt(...Object.keys(PERIOD).sort((a, b) => b.length - a.length));

export const DAY: Record<string, number> = {
  aaj: 0, today: 0, आज: 0,
  kal: 1, tomorrow: 1, कल: 1,
  parso: 2, parson: 2, parsoon: 2, "day after tomorrow": 2, परसों: 2, परसो: 2,
};
export const DAY_WORD = alt(...Object.keys(DAY).sort((a, b) => b.length - a.length));

export const WEEKDAY: Record<string, "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"> = {
  monday: "monday", somvar: "monday", somwar: "monday", सोमवार: "monday",
  tuesday: "tuesday", mangalvar: "tuesday", mangalwar: "tuesday", मंगलवार: "tuesday",
  wednesday: "wednesday", budhvar: "wednesday", budhwar: "wednesday", बुधवार: "wednesday",
  thursday: "thursday", guruvar: "thursday", guruwar: "thursday", गुरुवार: "thursday", बृहस्पतिवार: "thursday",
  friday: "friday", shukravar: "friday", shukrawar: "friday", शुक्रवार: "friday",
  saturday: "saturday", shanivar: "saturday", shaniwar: "saturday", शनिवार: "saturday",
  sunday: "sunday", ravivar: "sunday", raviwar: "sunday", रविवार: "sunday",
};
export const WEEKDAY_WORD = alt(...Object.keys(WEEKDAY));

export const BAJE = alt("baje", "bje", "बजे");
export const AFTER = alt("ke baad", "ke bad", "के बाद");
export const BEFORE = alt("se pehle", "se pahle", "से पहले");
export const TO = alt("se", "से");
export const BETWEEN_TAIL = alt("ke beech", "ke bich", "के बीच");

// ── Issues and actions ────────────────────────────────────────────────────────────────────────────

export interface IssueRule {
  issue: IssueType;
  action: ActionType;
  patterns: string[];
}

/**
 * Ordered by precedence: when several issues are mentioned, the earlier rule wins and the report is
 * flagged as mentioning more than one issue (the dispatcher sees it; nothing is guessed silently).
 */
export const ISSUE_RULES: IssueRule[] = [
  {
    issue: "PACKAGE_UNDELIVERABLE",
    action: "MARK_DELIVERY_FAILED",
    patterns: [
      String.raw`damaged?`, String.raw`phat[aie] hu[aie]`, String.raw`toot[aie]|tut[aie] hu[aie]`, String.raw`refus${TAIL}`,
      String.raw`lene se mana`, String.raw`mana kar di(ya|a)`, String.raw`return kar${TAIL}`,
      String.raw`डैमेज${TAIL}`, String.raw`फट[ाीे] हु[आई]`, String.raw`टूट[ाीे]( हु[आई])?`, String.raw`लेने से मना`, String.raw`मना कर दिया`,
      String.raw`रिफ्यूज${TAIL}`, String.raw`वापस कर${TAIL}`,
    ],
  },
  {
    issue: "WRONG_ADDRESS",
    action: "FLAG_ADDRESS_ISSUE",
    patterns: [
      String.raw`address\s*(?:galat|is wrong|wrong|incorrect)`, String.raw`(?:wrong|galat|incorrect) address`, String.raw`pata galat|galat pata`,
      String.raw`(?:building|ghar|makaan|makan) (?:hi )?nahi mil${TAIL}`, String.raw`building hi nahi`, String.raw`(?:galat|wrong) location|location (?:galat|wrong)`,
      String.raw`(?:पता|एड्रेस) गलत|गलत (?:पता|एड्रेस)`, String.raw`(?:बिल्डिंग|मकान|घर) (?:ही )?नहीं मिल${TAIL}`, String.raw`बिल्डिंग ही नहीं`,
      String.raw`लोकेशन गलत|गलत लोकेशन`,
    ],
  },
  {
    issue: "CUSTOMER_UNAVAILABLE",
    action: "MARK_CUSTOMER_UNAVAILABLE",
    patterns: [
      String.raw`ghar (?:pe|par|me|mein) nahi`, String.raw`not at home`, String.raw`(?:available|uplabdh|maujood|mojood) nahi`, String.raw`not available`,
      String.raw`(?:un|not )reachable`, String.raw`(?:phone|call|fone) nahi uth${TAIL}`, String.raw`not (?:picking|answering)`, String.raw`phone (?:switch(?:ed)? off|band)`,
      String.raw`bahar gay?[ae]`, String.raw`out of station`,
      String.raw`घर (?:पे|पर|में) नहीं`, String.raw`(?:उपलब्ध|मौजूद|अवेलेबल) नहीं`, String.raw`(?:फ़ोन|फोन|कॉल) नहीं उठ${TAIL}`, String.raw`(?:फ़ोन|फोन) बंद`,
      String.raw`बाहर गए?`, String.raw`शहर से बाहर`,
    ],
  },
  {
    issue: "UNCLEAR_INSTRUCTIONS",
    action: "UPDATE_INSTRUCTIONS",
    patterns: [
      String.raw`reception (?:pe|par|me) chhod${TAIL}`, String.raw`leave (?:it )?at (?:the )?reception`, String.raw`gate (?:number|no\.?) \d+ se (?:aana|ana|aao)`,
      String.raw`guard ke paas chhod${TAIL}`, String.raw`leave (?:it )?with (?:the )?(?:guard|security)`,
      String.raw`रिसेप्शन (?:पे|पर) छोड़${TAIL}`, String.raw`गेट नंबर \S+ से आ${TAIL}`, String.raw`गार्ड के पास छोड़${TAIL}`,
    ],
  },
];

/** Handing over to a third party needs a dispatcher's decision. */
export const ESCALATE_PATTERNS = [String.raw`neighbou?r`, String.raw`padosi`, String.raw`पड़ोसी`, String.raw`पडोसी`];

/** Security / gate access problems: context for instructions, not an instruction themselves. */
export const ACCESS_PROBLEM_PATTERNS = [
  String.raw`security (?:allow nahi|not allowing|nahi (?:aane|jaane) de${TAIL})`, String.raw`(?:main )?gate band`,
  String.raw`सिक्योरिटी .{0,20}नहीं`, String.raw`गेट बंद`,
];

/** "Come later" without a time: still a reschedule request, but the time must be asked for. */
export const LATER_PATTERNS = [String.raw`baad (?:me|mein) (?:aana|ana|dena|deliver)${TAIL}`, String.raw`come (?:back )?later`, String.raw`dobara aana`, String.raw`बाद में (?:आना|देना|डिलीवर)${TAIL}`, String.raw`दोबारा आना`];
