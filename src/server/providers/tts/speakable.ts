import type { LanguageCode } from "@/domain";

/**
 * Rewrites a display prompt into the form a voice should read. Gnani's TTS docs advise passing numbers,
 * IDs and dates as spoken words to avoid mispronunciation. Deterministic and pure.
 *  - order numbers (3+ digits) → digit by digit: "4821" → "chaar aath do ek" / "four eight two one" / "चार आठ दो एक"
 *  - "06 Nov, 18:00" → "6 November, shaam 6 baje" / "6 November at 6 PM" / "6 नवंबर, शाम 6 बजे"
 *  - typographic quotes removed
 */

const DIGITS: Record<LanguageCode, string[]> = {
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
  "hi-en": ["shunya", "ek", "do", "teen", "chaar", "paanch", "chhah", "saat", "aath", "nau"],
  hi: ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ"],
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS: Record<LanguageCode, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  "hi-en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hi: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
};

/** Hindi day period for a 24-hour hour. */
function period(h: number): "subah" | "dopahar" | "shaam" | "raat" {
  if (h >= 4 && h < 12) return "subah";
  if (h >= 12 && h < 16) return "dopahar";
  if (h >= 16 && h < 20) return "shaam";
  return "raat";
}
const PERIOD_HI = { subah: "सुबह", dopahar: "दोपहर", shaam: "शाम", raat: "रात" } as const;

export function spokenClock(hh: number, mm: number, language: LanguageCode): string {
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  if (language === "en") return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`;
  if (language === "hi-en") return `${period(hh)} ${h12}${mm ? ` baj kar ${mm} minute` : " baje"}`;
  return `${PERIOD_HI[period(hh)]} ${h12}${mm ? ` बजकर ${mm} मिनट` : " बजे"}`;
}

export function speakable(text: string, language: LanguageCode): string {
  const monthIndex = (m: string) => MONTHS_SHORT.indexOf(m);
  const date = (d: string, m: string) =>
    language === "hi" ? `${Number(d)} ${MONTHS.hi[monthIndex(m)]}` : `${Number(d)} ${MONTHS[language][monthIndex(m)]}`;
  const join = language === "en" ? " at " : ", ";
  const MON = MONTHS_SHORT.join("|");

  return (
    text
      // "06 Nov, 18:00"
      .replace(new RegExp(String.raw`\b(\d{1,2}) (${MON}), (\d{1,2}):(\d{2})\b`, "g"), (_, d, m, hh, mm) =>
        `${date(d, m)}${join}${spokenClock(Number(hh), Number(mm), language)}`)
      // bare "18:00"
      .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, hh, mm) => spokenClock(Number(hh), Number(mm), language))
      // "06 Nov"
      .replace(new RegExp(String.raw`\b(\d{1,2}) (${MON})\b`, "g"), (_, d, m) => date(d, m))
      // order numbers and other IDs: digit by digit
      .replace(/\b\d{3,}\b/g, (n) => [...n].map((c) => DIGITS[language][Number(c)]).join(" "))
      .replace(/[“”"]/g, "")
  );
}
