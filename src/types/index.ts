/** Shared domain types for the refill triage demo. */

export type MedicationClass =
  | "ssri"
  | "snri"
  | "atypical_antipsychotic"
  | "benzodiazepine"
  | "stimulant"
  | "mood_stabilizer"
  | "other_antidepressant";

export type ControlledSchedule = "none" | "II" | "III" | "IV" | "V";

export type ConversationPhase =
  | "greeting"
  | "collect_name"
  | "gather_request"
  | "verify_history"
  | "verify_consistency"
  | "assess_stability"
  | "decide"
  | "completed";

export type DecisionOutcome = "refill_approved" | "human_review" | "crisis_escalation";

export type CaseStatus = "pending" | "in_review" | "resolved_refill" | "resolved_no_refill" | "closed";

export type FlagSeverity = "info" | "warning" | "critical";

export type FlagCode =
  | "CRISIS_LANGUAGE"
  | "CONTROLLED_SUBSTANCE"
  | "SCHEDULE_II_NO_REFILL"
  | "RECENT_START"
  | "RECENT_DOSE_CHANGE"
  | "INSUFFICIENT_STABILITY"
  | "OUTSIDE_REFILL_WINDOW"
  | "INDICATION_MISMATCH"
  | "DOSE_CONTRADICTION"
  | "TIMELINE_INCONSISTENCY"
  | "REQUIRES_LAB_MONITORING"
  | "STALE_FOLLOW_UP"
  | "SYMPTOM_INSTABILITY"
  | "UNKNOWN_MEDICATION"
  | "UNSUPPORTED_DOSE"
  | "SUSPICIOUS_CLAIMS"
  | "MISSING_VERIFICATION"
  | "VAGUE_ANSWERS";

export interface FlagReason {
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
  evidence?: string;
}

export interface MedicationDefinition {
  id: string;
  genericName: string;
  brandNames: string[];
  class: MedicationClass;
  controlledSchedule: ControlledSchedule;
  commonIndications: string[];
  commonDosesMg: number[];
  requiresLabMonitoring: boolean;
  /** Minimum months on therapy before auto-refill may be considered (non-controlled only). */
  minStableMonthsForRefill: number;
  /** Max months since last clinician follow-up for auto-refill consideration. */
  maxMonthsSinceFollowUp: number;
  notes: string;
}

/** Scripted demo walkthroughs (not a patient chart database). */
export interface DemoScenario {
  id: string;
  title: string;
  expectedOutcome: DecisionOutcome | "human_review_or_crisis";
  summary: string;
  suggestedName: string;
  script: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface ClaimedFacts {
  displayName?: string;
  medicationName?: string;
  medicationId?: string;
  doseMg?: number;
  durationMonthsClaimed?: number;
  indicationClaimed?: string;
  recentDoseChange?: boolean;
  monthsSinceFollowUp?: number;
  recentLabsClaimed?: boolean | "unknown";
  daysSupplyRemainingClaimed?: number;
  symptomStabilityClaimed?: "stable" | "worsening" | "improving" | "unclear";
  pharmacyPreference?: string;
}

export interface ConversationState {
  id: string;
  phase: ConversationPhase;
  messages: ChatMessage[];
  claimed: ClaimedFacts;
  verificationStep: number;
  flags: FlagReason[];
  suspicionScore: number;
  decision?: DecisionOutcome;
  decisionSummary?: string;
  reviewCaseId?: string;
  pharmacyOrderId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PharmacyOrder {
  id: string;
  conversationId: string;
  patientDisplayName: string;
  medicationId: string;
  medicationName: string;
  doseMg: number;
  quantityDays: number;
  pharmacyName: string;
  status: "simulated_sent";
  createdAt: string;
  notes: string;
}

export interface ReviewCase {
  id: string;
  conversationId: string;
  patientDisplayName: string;
  medicationRequested: string;
  doseRequested?: number;
  flags: FlagReason[];
  transcript: ChatMessage[];
  recommendedAction: DecisionOutcome;
  decisionSummary: string;
  claimedSnapshot: ClaimedFacts;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  reviewerNotes?: string;
}

export interface AgentTurnResult {
  conversation: ConversationState;
  assistantMessage: string;
  createdCase?: ReviewCase;
  createdOrder?: PharmacyOrder;
}
