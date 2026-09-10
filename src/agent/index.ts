import { randomUUID } from "node:crypto";
import { GUARDRAIL_CONFIG } from "../data/guardrails.js";
import { findMedicationByName } from "../data/medications.js";
import type {
  AgentTurnResult,
  ChatMessage,
  ConversationState,
  DecisionOutcome,
  PharmacyOrder,
  ReviewCase,
} from "../types/index.js";
import { detectCrisisLanguage } from "./crisis.js";
import {
  evaluateConversationConsistency,
  evaluateRubric,
  mergeFlags,
  shouldEscalate,
} from "./rubric.js";

function nowIso(): string {
  return new Date().toISOString();
}

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: randomUUID(), role, content, createdAt: nowIso() };
}

const DISCLAIMER =
  "This is a DEMO only. It is not medical advice, not a real pharmacy, and not a clinician. " +
  "It does not prescribe or diagnose. If you are in crisis, call 911 or 988 (US).";

export function createConversation(): ConversationState {
  const createdAt = nowIso();
  return {
    id: randomUUID(),
    phase: "greeting",
    messages: [
      msg(
        "assistant",
        `${DISCLAIMER}\n\nHi. I can help triage a mental health medication refill request for this demo. ` +
          `I will ask structured questions and score your answers against a safety rubric ` +
          `(I do not look up a patient chart). What name should I use on this request?`,
      ),
    ],
    claimed: {},
    verificationStep: 0,
    flags: [],
    suspicionScore: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

const NON_NAME_WORDS = new Set([
  "a",
  "an",
  "the",
  "i",
  "im",
  "me",
  "my",
  "we",
  "you",
  "he",
  "she",
  "it",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "having",
  "had",
  "has",
  "do",
  "does",
  "did",
  "can",
  "could",
  "would",
  "should",
  "will",
  "need",
  "want",
  "please",
  "help",
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank",
  "sorry",
  "take",
  "taking",
  "took",
  "used",
  "use",
  "using",
  "refill",
  "medication",
  "medicine",
  "meds",
  "prescription",
  "dose",
  "mg",
  "panic",
  "anxiety",
  "depression",
  "attack",
  "attacks",
  "feeling",
  "experiencing",
  "looking",
  "trying",
  "going",
  "getting",
  "doing",
  "here",
  "there",
  "this",
  "that",
  "for",
  "with",
  "about",
  "from",
  "just",
  "some",
  "any",
  "and",
  "but",
  "or",
  "so",
  "to",
  "of",
  "in",
  "on",
  "at",
  "yes",
  "no",
  "ok",
  "okay",
  "patient",
  "demo",
  "request",
]);

const MED_TOKEN_STOPWORDS = new Set([
  ...NON_NAME_WORDS,
  "what",
  "which",
  "when",
  "where",
  "how",
  "who",
  "why",
  "name",
  "called",
  "generic",
  "brand",
  "pharmacy",
  "clinician",
  "doctor",
  "symptoms",
  "stable",
  "worsening",
  "improving",
  "months",
  "years",
  "weeks",
  "days",
  "ago",
  "last",
  "visit",
  "follow",
  "labs",
  "lab",
]);

function titleCaseName(raw: string): string {
  return raw
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isPlausibleNameToken(token: string): boolean {
  const cleaned = token.replace(/[.,!?]/g, "");
  if (!/^[A-Za-z][A-Za-z'-]{1,29}$/.test(cleaned)) return false;
  return !NON_NAME_WORDS.has(cleaned.toLowerCase());
}

function hasClinicalOrRefillIntent(text: string): boolean {
  return (
    text.length > 48 ||
    /[?]/.test(text) ||
    /\b(refill|medication|medicine|meds|prescription|rx|dose|\d+\s*mg|panic|anxiety|depression|adhd|ptsd|ocd|bipolar|schizophrenia|attacks?|symptoms?|pharmacy|help)\b/i.test(
      text,
    )
  );
}

/** Extract a short display name, or undefined when the utterance is not a clear name. */
function extractDisplayName(text: string): string | undefined {
  const explicit = text.match(
    /\b(?:my name is|call me|name(?:'s| is))\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})\b/i,
  );
  if (explicit) {
    const parts = explicit[1].split(/\s+/).filter(isPlausibleNameToken);
    if (parts.length >= 1) return titleCaseName(parts.join(" "));
  }

  // "I'm Alex" / "I am Sam Lee" only when the captured span looks like a name, not "I'm having..."
  const imName = text.match(
    /\b(?:i(?:'m| am))\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})(?=$|[.,!?]|\s+and\b)/i,
  );
  if (imName) {
    const parts = imName[1].split(/\s+/).filter(isPlausibleNameToken);
    if (parts.length >= 1 && parts.length <= 2) return titleCaseName(parts.join(" "));
  }

  const stripped = text.replace(/^(?:hi|hello|hey)[,!.\s]*/i, "").trim();
  if (stripped && stripped.length <= 40 && !hasClinicalOrRefillIntent(text)) {
    const tokens = stripped.split(/\s+/).map((t) => t.replace(/[.,!?]/g, ""));
    if (tokens.length >= 1 && tokens.length <= 3 && tokens.every(isPlausibleNameToken)) {
      return titleCaseName(tokens.join(" "));
    }
  }

  return undefined;
}

function briefSymptomAck(text: string): string {
  const t = text.toLowerCase();
  if (/\bpanic\b/.test(t)) return "I'm sorry you're dealing with panic attacks. ";
  if (/\banxiety\b/.test(t)) return "I'm sorry anxiety has been hard lately. ";
  if (/\bdepress/.test(t)) return "I'm sorry you've been struggling. ";
  if (hasClinicalOrRefillIntent(text)) return "Thanks for sharing that. ";
  return "";
}

function extractDose(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if (match) return Number(match[1]);
  const bare = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (bare) {
    const n = Number(bare[1]);
    if (!Number.isNaN(n) && n > 0 && n < 1000) return n;
  }
  return undefined;
}

function extractMonths(text: string): number | undefined {
  const year = text.match(/(\d+(?:\.\d+)?)\s*years?/i);
  if (year) return Number(year[1]) * 12;
  const month = text.match(/(\d+(?:\.\d+)?)\s*months?/i);
  if (month) return Number(month[1]);
  const weeks = text.match(/(\d+(?:\.\d+)?)\s*weeks?/i);
  if (weeks) return Math.round((Number(weeks[1]) / 4) * 10) / 10;
  const days = text.match(/(\d+(?:\.\d+)?)\s*days?/i);
  if (days) return Math.round((Number(days[1]) / 30) * 10) / 10;
  const bare = text.match(/\b(\d+)\b/);
  if (bare) return Number(bare[1]);
  return undefined;
}

function parseStability(text: string): "stable" | "worsening" | "improving" | "unclear" {
  const t = text.toLowerCase();
  if (/\b(worsen|worse|getting worse|unstable|relapse)\b/.test(t)) return "worsening";
  if (/\b(improv|better|getting better)\b/.test(t)) return "improving";
  if (/\b(stable|same|no change|unchanged|steady)\b/.test(t)) return "stable";
  return "unclear";
}

function parseYesNo(text: string): boolean | undefined {
  const t = text.toLowerCase().trim();
  if (/^(y|yes|yeah|yep|correct|true|right)\b/.test(t) || /\byes\b/.test(t)) return true;
  if (/^(n|no|nope|incorrect|false|wrong)\b/.test(t) || /\bno\b/.test(t)) return false;
  return undefined;
}

function extractPharmacy(text: string): string | undefined {
  const pharmacyMatch = text.match(
    /\b((?:harbor|summit|lakeside|campus|riverbend|metro)[\w\s]*pharmacy|[\w\s]{0,40}pharmacy)\b/i,
  );
  if (pharmacyMatch) return pharmacyMatch[1].trim();
  const chain = text.match(/\b(cvs|walgreens)\b/i);
  if (chain) return chain[1];
  return undefined;
}

function applyMedicationAndDose(conversation: ConversationState, text: string): void {
  const found = findMedicationByName(text);
  if (found) {
    conversation.claimed.medicationName = found.genericName;
    conversation.claimed.medicationId = found.id;
  } else if (!conversation.claimed.medicationName) {
    const tokens = text.match(/\b([A-Za-z][A-Za-z-]{2,})\b/g) ?? [];
    const token = tokens.find((t) => !MED_TOKEN_STOPWORDS.has(t.toLowerCase()));
    if (token) conversation.claimed.medicationName = token;
  }
  const dose = extractDose(text);
  if (dose !== undefined) conversation.claimed.doseMg = dose;
}

function nextGatherPrompt(conversation: ConversationState, preface: string): string {
  const med = conversation.claimed.medicationName;
  const dose = conversation.claimed.doseMg;
  if (med && dose !== undefined) {
    conversation.phase = "verify_history";
    conversation.verificationStep = 0;
    return (
      `${preface}` +
      `I've noted a ${med} ${dose} mg refill request. ` +
      `Roughly how long have you been taking it (weeks, months, or years)?`
    );
  }
  if (med) {
    conversation.phase = "gather_request";
    return `${preface}What dose in mg of ${med} are you requesting?`;
  }
  conversation.phase = "gather_request";
  return `${preface}Which medication refill do you need, and at what dose in mg?`;
}

function needsLabQuestion(conversation: ConversationState): boolean {
  const med = conversation.claimed.medicationName
    ? findMedicationByName(conversation.claimed.medicationName)
    : undefined;
  return Boolean(med?.requiresLabMonitoring);
}

export interface DecisionArtifacts {
  outcome: DecisionOutcome;
  summary: string;
  order?: PharmacyOrder;
  reviewCase?: ReviewCase;
}

export function finalizeDecision(conversation: ConversationState): DecisionArtifacts {
  if (conversation.decision === "crisis_escalation") {
    const reviewCase = buildReviewCase(
      conversation,
      "crisis_escalation",
      conversation.decisionSummary ?? "Crisis language detected.",
    );
    return {
      outcome: "crisis_escalation",
      summary: conversation.decisionSummary ?? "Crisis escalation",
      reviewCase,
    };
  }

  const rubric = evaluateRubric(conversation.claimed);
  conversation.flags = mergeFlags(conversation.flags, rubric.flags);
  conversation.suspicionScore += rubric.suspicionDelta;

  const escalate = shouldEscalate(conversation.flags, conversation.suspicionScore);
  const med = rubric.medication;
  const dose = conversation.claimed.doseMg;

  if (!escalate && med && dose !== undefined) {
    const order: PharmacyOrder = {
      id: randomUUID(),
      conversationId: conversation.id,
      patientDisplayName: conversation.claimed.displayName ?? "Demo patient",
      medicationId: med.id,
      medicationName: med.genericName,
      doseMg: dose,
      quantityDays: 30,
      pharmacyName: conversation.claimed.pharmacyPreference ?? "Preferred pharmacy (unspecified)",
      status: "simulated_sent",
      createdAt: nowIso(),
      notes: "Simulated pharmacy order created after refill rubric passed on conversation answers.",
    };
    return {
      outcome: "refill_approved",
      summary: `Simulated refill order sent for ${med.genericName} ${dose} mg to ${order.pharmacyName}.`,
      order,
    };
  }

  const summary =
    conversation.flags.length > 0
      ? `Escalated to human review: ${conversation.flags.map((f) => f.code).join(", ")}`
      : "Escalated to human review due to incomplete verification.";

  return {
    outcome: "human_review",
    summary,
    reviewCase: buildReviewCase(conversation, "human_review", summary),
  };
}

function buildReviewCase(
  conversation: ConversationState,
  recommendedAction: DecisionOutcome,
  decisionSummary: string,
): ReviewCase {
  return {
    id: randomUUID(),
    conversationId: conversation.id,
    patientDisplayName: conversation.claimed.displayName ?? "Unnamed demo patient",
    medicationRequested: conversation.claimed.medicationName ?? "unspecified",
    doseRequested: conversation.claimed.doseMg,
    flags: conversation.flags,
    transcript: [...conversation.messages],
    recommendedAction,
    decisionSummary,
    claimedSnapshot: { ...conversation.claimed },
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function processUserMessage(conversation: ConversationState, userText: string): AgentTurnResult {
  const text = userText.trim();
  if (!text) {
    const assistantMessage = "Please send a short reply so I can continue the refill triage.";
    conversation.messages.push(msg("user", userText));
    conversation.messages.push(msg("assistant", assistantMessage));
    conversation.updatedAt = nowIso();
    return { conversation, assistantMessage };
  }

  conversation.messages.push(msg("user", text));
  conversation.updatedAt = nowIso();

  if (detectCrisisLanguage(text)) {
    conversation.flags = mergeFlags(conversation.flags, [
      {
        code: "CRISIS_LANGUAGE",
        severity: "critical",
        message: "Crisis or self-harm language detected; immediate human escalation required.",
        evidence: "Matched safety keyword patterns in patient message.",
      },
    ]);
    conversation.decision = "crisis_escalation";
    conversation.decisionSummary = "Immediate escalation due to crisis language.";
    conversation.phase = "completed";
    conversation.completedAt = nowIso();
    const artifacts = finalizeDecision(conversation);
    conversation.reviewCaseId = artifacts.reviewCase?.id;
    const assistantMessage = GUARDRAIL_CONFIG.crisisRedirectMessage;
    conversation.messages.push(msg("assistant", assistantMessage));
    return {
      conversation,
      assistantMessage,
      createdCase: artifacts.reviewCase,
    };
  }

  if (conversation.phase === "completed") {
    const assistantMessage =
      "This conversation is already complete. Start a new chat from the patient page if you want another demo path.";
    conversation.messages.push(msg("assistant", assistantMessage));
    return { conversation, assistantMessage };
  }

  let assistantMessage = "";
  let createdCase: ReviewCase | undefined;
  let createdOrder: PharmacyOrder | undefined;

  switch (conversation.phase) {
    case "greeting":
    case "collect_name": {
      const extractedName = extractDisplayName(text);
      const clinicalIntent = hasClinicalOrRefillIntent(text);

      if (extractedName) {
        conversation.claimed.displayName = extractedName;
        // Only mine med/dose from this turn when the utterance also has refill/clinical content.
        if (clinicalIntent) applyMedicationAndDose(conversation, text);
        assistantMessage = nextGatherPrompt(conversation, `Thanks, ${extractedName}. `);
        break;
      }

      if (clinicalIntent) {
        // Never store a long free-form utterance as the patient name.
        delete conversation.claimed.displayName;
        applyMedicationAndDose(conversation, text);
        const preface = `${briefSymptomAck(text)}I can help triage a refill request. `;
        assistantMessage = nextGatherPrompt(conversation, preface);
        break;
      }

      conversation.phase = "collect_name";
      assistantMessage =
        "Sorry, I did not catch a name there. What first name (or preferred name) should I use on this request?";
      break;
    }

    case "gather_request": {
      applyMedicationAndDose(conversation, text);

      if (!conversation.claimed.medicationName) {
        assistantMessage =
          "I still need the medication name. Which medication do you want refilled (generic or brand)?";
        break;
      }
      if (conversation.claimed.doseMg === undefined) {
        assistantMessage = `Got it, ${conversation.claimed.medicationName}. What dose in mg are you requesting?`;
        break;
      }

      conversation.phase = "verify_history";
      conversation.verificationStep = 0;
      assistantMessage =
        `Thanks. Roughly how long have you been taking ${conversation.claimed.medicationName} ` +
        `(weeks, months, or years)?`;
      break;
    }

    case "verify_history": {
      if (conversation.verificationStep === 0) {
        const months = extractMonths(text);
        if (months === undefined) {
          assistantMessage =
            "Could you estimate how long you have been on it (for example: 14 months, 2 years, or 3 weeks)?";
          break;
        }
        conversation.claimed.durationMonthsClaimed = months;
        conversation.verificationStep = 1;
        assistantMessage =
          "Understood. What condition is this medication treating for you " +
          "(for example: depression, anxiety, ADHD, panic)?";
        break;
      }

      if (conversation.verificationStep === 1) {
        conversation.claimed.indicationClaimed = text.trim().slice(0, 120);
        conversation.verificationStep = 2;
        conversation.phase = "verify_consistency";
        assistantMessage =
          "Thanks. Has your dose changed in the last 3 months? Please answer yes or no.";
        break;
      }

      conversation.phase = "verify_consistency";
      assistantMessage = "Has your dose changed in the last 3 months? Please answer yes or no.";
      break;
    }

    case "verify_consistency": {
      if (conversation.claimed.recentDoseChange === undefined) {
        const changed = parseYesNo(text);
        if (changed === undefined) {
          conversation.suspicionScore += GUARDRAIL_CONFIG.suspicionWeights.vagueOrEvasive;
          conversation.flags = mergeFlags(conversation.flags, [
            {
              code: "VAGUE_ANSWERS",
              severity: "info",
              message: "Dose-change question needed a clear yes/no.",
            },
          ]);
          assistantMessage =
            "I need a clear yes or no: has your dose changed in the last 3 months?";
          break;
        }
        conversation.claimed.recentDoseChange = changed;
        const consistency = evaluateConversationConsistency(conversation.claimed, text);
        conversation.flags = mergeFlags(conversation.flags, consistency.flags);
        conversation.suspicionScore += consistency.suspicionDelta;

        assistantMessage =
          "Got it. About how many months ago was your last visit with the prescribing clinician?";
        break;
      }

      if (conversation.claimed.monthsSinceFollowUp === undefined) {
        const months = extractMonths(text);
        if (months === undefined) {
          assistantMessage =
            "Please estimate months since your last clinician visit (for example: 6 months ago).";
          break;
        }
        conversation.claimed.monthsSinceFollowUp = months;

        if (needsLabQuestion(conversation)) {
          assistantMessage =
            "Thanks. This medication class usually needs lab monitoring. " +
            "Have you had required labs in the last 6 months? Yes or no.";
          break;
        }

        conversation.phase = "assess_stability";
        assistantMessage =
          "Thanks. How are your symptoms lately: stable, improving, or worsening? " +
          "You can also name a preferred pharmacy (optional).";
        break;
      }

      if (needsLabQuestion(conversation) && conversation.claimed.recentLabsClaimed === undefined) {
        const labs = parseYesNo(text);
        if (labs === undefined) {
          conversation.claimed.recentLabsClaimed = "unknown";
        } else {
          conversation.claimed.recentLabsClaimed = labs;
        }
        conversation.phase = "assess_stability";
        assistantMessage =
          "Okay. How are your symptoms lately: stable, improving, or worsening? " +
          "You can also name a preferred pharmacy (optional).";
        break;
      }

      conversation.phase = "assess_stability";
      assistantMessage =
        "How are your symptoms lately: stable, improving, or worsening? " +
        "You can also name a preferred pharmacy (optional).";
      break;
    }

    case "assess_stability": {
      conversation.claimed.symptomStabilityClaimed = parseStability(text);
      const pharmacy = extractPharmacy(text);
      if (pharmacy) conversation.claimed.pharmacyPreference = pharmacy;

      const consistency = evaluateConversationConsistency(conversation.claimed, text);
      conversation.flags = mergeFlags(conversation.flags, consistency.flags);
      conversation.suspicionScore += consistency.suspicionDelta;

      conversation.phase = "decide";
      const artifacts = finalizeDecision(conversation);
      conversation.decision = artifacts.outcome;
      conversation.decisionSummary = artifacts.summary;
      conversation.completedAt = nowIso();
      conversation.phase = "completed";
      createdCase = artifacts.reviewCase;
      createdOrder = artifacts.order;
      conversation.reviewCaseId = createdCase?.id;
      conversation.pharmacyOrderId = createdOrder?.id;

      if (artifacts.outcome === "refill_approved") {
        assistantMessage =
          `Decision: Send refill order to pharmacy (simulated).\n\n${artifacts.summary}\n\n` +
          `Your answers met the demo refill rubric (non-controlled class, stability, follow-up, and consistency checks). ` +
          `${DISCLAIMER}`;
      } else {
        const reasons =
          conversation.flags.length > 0
            ? conversation.flags.map((f) => `- [${f.severity}] ${f.message}`).join("\n")
            : "- Incomplete verification";
        assistantMessage =
          `Decision: Escalate to human review.\n\nRubric flag reasons:\n${reasons}\n\n` +
          `A reviewer can open this case in the Human Review interface.\n\n${DISCLAIMER}`;
      }
      break;
    }

    default: {
      assistantMessage = "Let us restart. What name should I use on this request?";
      conversation.phase = "collect_name";
    }
  }

  conversation.messages.push(msg("assistant", assistantMessage));
  conversation.updatedAt = nowIso();
  return { conversation, assistantMessage, createdCase, createdOrder };
}
