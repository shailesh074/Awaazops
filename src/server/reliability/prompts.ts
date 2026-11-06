import type { ActionType, ExtractionPayload, LanguageCode, Order, OrderStatus } from "@/domain";
import { formatDateTime } from "@/lib/format";

/**
 * What the system says back to the agent (spoken via Timbre once integrated), in the language they chose:
 * Hindi in Devanagari, Indian English, or Hinglish in Latin script.
 */

export interface PromptSet {
  unreadable: string;
  lowConfidence: string;
  missingOrder: string;
  orderNotFound: (n: string) => string;
  orderSuggest: (n: string, suggestion: string) => string;
  missingAction: string;
  missingTime: string;
  missingNotes: string;
  invalidTime: string;
  notAssigned: (n: string) => string;
  notAllowed: (n: string, status: OrderStatus) => string;
  confirm: (n: string, action: ActionType, time: string, notes: string | null) => string;
}

const STATUS: Record<LanguageCode, Record<OrderStatus, string>> = {
  "hi-en": { OUT_FOR_DELIVERY: "out for delivery", ATTEMPTED: "attempted", RESCHEDULED: "rescheduled", DELIVERED: "delivered", FAILED: "failed", ON_HOLD: "on hold" },
  en: { OUT_FOR_DELIVERY: "out for delivery", ATTEMPTED: "attempted", RESCHEDULED: "rescheduled", DELIVERED: "delivered", FAILED: "marked failed", ON_HOLD: "on hold" },
  hi: { OUT_FOR_DELIVERY: "डिलीवरी के लिए निकला", ATTEMPTED: "प्रयास किया गया", RESCHEDULED: "रीशेड्यूल", DELIVERED: "डिलीवर", FAILED: "फ़ेल", ON_HOLD: "होल्ड पर" },
};

const HINGLISH: PromptSet = {
  unreadable: "Maaf kijiye, report samajh nahi aayi. Kripya dobara boliye.",
  lowConfidence: "Awaaz saaf nahi aayi. Kripya dobara boliye.",
  missingOrder: "Yeh kaunse order ke baare mein hai? Order number boliye.",
  orderNotFound: (n) => `Order ${n} nahi mila. Kripya order number dobara boliye.`,
  orderSuggest: (n, s) => `Order ${n} nahi mila. Kya aap order ${s} ki baat kar rahe hain?`,
  missingAction: "Is order ke liye kya karna hai? Jaise reschedule, ya customer unavailable mark karna.",
  missingTime: "Delivery kis time pe karni hai? Kripya time boliye.",
  missingNotes: "Naye instructions kya hain? Kripya boliye.",
  invalidTime: "Yeh time sahi nahi lag raha. Kripya delivery ka naya time boliye.",
  notAssigned: (n) => `Order ${n} aapke route par nahi hai. Yeh update nahi kiya ja sakta.`,
  notAllowed: (n, st) => `Order ${n} pehle se ${STATUS["hi-en"][st]} hai. Yeh update nahi kiya ja sakta.`,
  confirm: (n, a, time, notes) =>
    ({
      RESCHEDULE: `Order ${n}: delivery${time} reschedule karun? Confirm karein.`,
      MARK_CUSTOMER_UNAVAILABLE: `Order ${n}: customer unavailable mark karun? Confirm karein.`,
      FLAG_ADDRESS_ISSUE: `Order ${n} ka address issue dispatcher ko flag karun? Confirm karein.`,
      UPDATE_INSTRUCTIONS: `Order ${n} ke instructions update karun: “${notes}”? Confirm karein.`,
      MARK_DELIVERY_FAILED: `Order ${n} ko failed delivery mark karun? Confirm karein.`,
      ESCALATE_TO_DISPATCHER: `Order ${n} dispatcher ko escalate karun? Confirm karein.`,
    })[a],
};

const ENGLISH: PromptSet = {
  unreadable: "Sorry, I couldn't understand the report. Please say it again.",
  lowConfidence: "The audio wasn't clear. Please say it again.",
  missingOrder: "Which order is this about? Please say the order number.",
  orderNotFound: (n) => `I couldn't find order ${n}. Please say the order number again.`,
  orderSuggest: (n, s) => `I couldn't find order ${n}. Did you mean order ${s}?`,
  missingAction: "What should be done for this order? For example, reschedule it or mark the customer unavailable.",
  missingTime: "When should the delivery happen? Please say the time.",
  missingNotes: "What are the new instructions? Please say them.",
  invalidTime: "That time doesn't look right. Please say a new delivery time.",
  notAssigned: (n) => `Order ${n} is not on your route, so it can't be updated.`,
  notAllowed: (n, st) => `Order ${n} is already ${STATUS.en[st]}, so it can't be updated.`,
  confirm: (n, a, time, notes) =>
    ({
      RESCHEDULE: `Order ${n}: reschedule the delivery${time}? Please confirm.`,
      MARK_CUSTOMER_UNAVAILABLE: `Order ${n}: mark the customer unavailable? Please confirm.`,
      FLAG_ADDRESS_ISSUE: `Order ${n}: flag an address issue to the dispatcher? Please confirm.`,
      UPDATE_INSTRUCTIONS: `Order ${n}: update the instructions to “${notes}”? Please confirm.`,
      MARK_DELIVERY_FAILED: `Order ${n}: mark this delivery as failed? Please confirm.`,
      ESCALATE_TO_DISPATCHER: `Order ${n}: escalate to the dispatcher? Please confirm.`,
    })[a],
};

const HINDI: PromptSet = {
  unreadable: "माफ़ कीजिए, रिपोर्ट समझ नहीं आई। कृपया दोबारा बोलिए।",
  lowConfidence: "आवाज़ साफ़ नहीं आई। कृपया दोबारा बोलिए।",
  missingOrder: "यह किस ऑर्डर के बारे में है? ऑर्डर नंबर बोलिए।",
  orderNotFound: (n) => `ऑर्डर ${n} नहीं मिला। कृपया ऑर्डर नंबर दोबारा बोलिए।`,
  orderSuggest: (n, s) => `ऑर्डर ${n} नहीं मिला। क्या आप ऑर्डर ${s} की बात कर रहे हैं?`,
  missingAction: "इस ऑर्डर के लिए क्या करना है? जैसे रीशेड्यूल करना, या ग्राहक को अनुपलब्ध मार्क करना।",
  missingTime: "डिलीवरी किस समय करनी है? कृपया समय बोलिए।",
  missingNotes: "नए निर्देश क्या हैं? कृपया बोलिए।",
  invalidTime: "यह समय सही नहीं लग रहा। कृपया डिलीवरी का नया समय बोलिए।",
  notAssigned: (n) => `ऑर्डर ${n} आपके रूट पर नहीं है। इसे अपडेट नहीं किया जा सकता।`,
  notAllowed: (n, st) => `ऑर्डर ${n} पहले से ${STATUS.hi[st]} है। इसे अपडेट नहीं किया जा सकता।`,
  confirm: (n, a, time, notes) =>
    ({
      RESCHEDULE: `ऑर्डर ${n}: डिलीवरी${time} रीशेड्यूल करूँ? कृपया पुष्टि करें।`,
      MARK_CUSTOMER_UNAVAILABLE: `ऑर्डर ${n}: ग्राहक को अनुपलब्ध मार्क करूँ? कृपया पुष्टि करें।`,
      FLAG_ADDRESS_ISSUE: `ऑर्डर ${n} के पते की समस्या डिस्पैचर को भेजूँ? कृपया पुष्टि करें।`,
      UPDATE_INSTRUCTIONS: `ऑर्डर ${n} के निर्देश अपडेट करूँ: “${notes}”? कृपया पुष्टि करें।`,
      MARK_DELIVERY_FAILED: `ऑर्डर ${n} की डिलीवरी फ़ेल मार्क करूँ? कृपया पुष्टि करें।`,
      ESCALATE_TO_DISPATCHER: `ऑर्डर ${n} डिस्पैचर को भेजूँ? कृपया पुष्टि करें।`,
    })[a],
};

export const PROMPTS: Record<LanguageCode, PromptSet> = { "hi-en": HINGLISH, en: ENGLISH, hi: HINDI };

/** Time phrase in the agent's language, e.g. " 06 Nov, 18:00 ke baad" / " after 06 Nov, 18:00". */
export function timePhrase(payload: ExtractionPayload, language: LanguageCode): string {
  const t = payload.timeConstraint.value;
  if (!t) return "";
  const s = t.start ? formatDateTime(t.start) : null;
  const e = t.end ? formatDateTime(t.end) : null;
  const eTime = e?.split(", ").at(-1);
  const day = s?.split(",")[0];
  const P = {
    "hi-en": { AFTER: `${s} ke baad`, BEFORE: `${e} se pehle`, AT: `${s} pe`, BETWEEN: `${s} se ${eTime} ke beech`, DATE_ONLY: `${day} ko` },
    en: { AFTER: `after ${s}`, BEFORE: `before ${e}`, AT: `at ${s}`, BETWEEN: `between ${s} and ${eTime}`, DATE_ONLY: `on ${day}` },
    hi: { AFTER: `${s} के बाद`, BEFORE: `${e} से पहले`, AT: `${s} पर`, BETWEEN: `${s} से ${eTime} के बीच`, DATE_ONLY: `${day} को` },
  }[language];
  const needs = { AFTER: s, BEFORE: e, AT: s, BETWEEN: s && e, DATE_ONLY: s }[t.kind];
  return needs ? ` ${P[t.kind]}` : "";
}

export function confirmationPrompt(payload: ExtractionPayload, order: Order, language: LanguageCode = "hi-en"): string {
  const action = payload.requestedAction.value;
  const n = order.id.replace(/\D/g, "");
  if (!action) return PROMPTS[language].missingAction;
  return PROMPTS[language].confirm(n, action, timePhrase(payload, language), payload.notes.value);
}
