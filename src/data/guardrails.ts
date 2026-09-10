/**
 * Typed refill rubric thresholds for the demo agent.
 * Values are informed by public clinical / regulatory sources summarized in GUARDRAILS.md.
 * Evaluation uses conversation answers only (no patient chart database).
 */

export const GUARDRAIL_CONFIG = {
  /** Non-controlled antidepressants: minimum months on therapy before auto-refill may be considered. */
  minStableMonthsSsriSnri: 3,

  /** Atypicals / lithium-like agents: longer stability required in this demo. */
  minStableMonthsHighMonitoring: 6,

  /** Months without a clinician visit before escalating non-controlled refills. */
  maxMonthsSinceFollowUpDefault: 12,

  /** High-monitoring meds need more recent follow-up. */
  maxMonthsSinceFollowUpHighMonitoring: 6,

  /** If patient claims days of supply remaining outside this window, escalate. */
  refillEarlyDaysMax: 14,
  refillGraceDaysAfterRunout: 10,

  /** Suspicion score threshold for escalation from vague / contradictory chat answers. */
  suspicionEscalateAt: 40,
  suspicionWeights: {
    indicationMismatch: 35,
    doseContradiction: 45,
    timelineInconsistency: 30,
    unsupportedDose: 20,
    vagueOrEvasive: 15,
    unknownMedication: 50,
  },

  /** Controlled substances: never auto-refill in this demo. */
  alwaysEscalateSchedules: ["II", "III", "IV", "V"] as const,

  crisisRedirectMessage:
    "I am concerned about your safety. I am escalating this to a human reviewer right away. " +
    "If you are in immediate danger, call 911 (US) or go to the nearest emergency department. " +
    "You can also contact the 988 Suicide & Crisis Lifeline by calling or texting 988. " +
    "I cannot provide advice about self-harm methods.",
} as const;

export type GuardrailConfig = typeof GUARDRAIL_CONFIG;
