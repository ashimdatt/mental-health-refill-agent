import { GUARDRAIL_CONFIG } from "../data/guardrails.js";
import { findMedicationByName } from "../data/medications.js";
import type { ClaimedFacts, FlagReason, MedicationDefinition } from "../types/index.js";

function normalizeIndication(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(major|generalized|disorder|syndrome)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function indicationFitsMedication(claimedRaw: string, med: MedicationDefinition): boolean {
  const claimed = normalizeIndication(claimedRaw);
  if (!claimed) return false;

  const known = med.commonIndications.map(normalizeIndication);
  for (const k of known) {
    if (claimed.includes(k) || k.includes(claimed)) return true;
  }

  const blob = `${claimed} ${known.join(" ")}`;
  if (/\bdepress/.test(claimed) && known.some((k) => /\bdepress/.test(k))) return true;
  if (/\banxi/.test(claimed) && known.some((k) => /\banxi|panic|ptsd|ocd/.test(k))) return true;
  if (/\bpanic/.test(claimed) && known.some((k) => /\bpanic|anxi/.test(k))) return true;
  if (/\bbipolar/.test(claimed) && known.some((k) => /\bbipolar/.test(k))) return true;
  if (/\badhd/.test(claimed) && known.some((k) => /\badhd/.test(k))) return true;
  if (/\bocd/.test(claimed) && known.some((k) => /\bocd/.test(k))) return true;
  if (/\bptsd/.test(claimed) && known.some((k) => /\bptsd/.test(k))) return true;
  if (/\bschizophren/.test(claimed) && known.some((k) => /\bschizophren/.test(k))) return true;
  if (/\bnarcolepsy/.test(claimed) && known.some((k) => /\bnarcolepsy/.test(k))) return true;
  void blob;
  return false;
}

export function mergeFlags(existing: FlagReason[], incoming: FlagReason[]): FlagReason[] {
  const map = new Map<string, FlagReason>();
  for (const flag of [...existing, ...incoming]) {
    const key = `${flag.code}:${flag.message}`;
    map.set(key, flag);
  }
  return [...map.values()];
}

/**
 * Score claimed conversation facts against the refill rubric.
 * No patient chart / synthetic EHR lookup is performed.
 */
export function evaluateRubric(claimed: ClaimedFacts): {
  flags: FlagReason[];
  suspicionDelta: number;
  medication?: MedicationDefinition;
} {
  const flags: FlagReason[] = [];
  let suspicionDelta = 0;
  const weights = GUARDRAIL_CONFIG.suspicionWeights;

  if (!claimed.medicationName || claimed.doseMg === undefined) {
    flags.push({
      code: "MISSING_VERIFICATION",
      severity: "critical",
      message: "Medication name and dose were not fully collected before decision.",
    });
    return { flags, suspicionDelta };
  }

  const medication = findMedicationByName(claimed.medicationName);
  if (!medication) {
    flags.push({
      code: "UNKNOWN_MEDICATION",
      severity: "critical",
      message: `Medication "${claimed.medicationName}" is not in the demo formulary / rubric catalog.`,
      evidence: "Auto-refill only applies to configured non-controlled maintenance medications.",
    });
    suspicionDelta += weights.unknownMedication;
    return { flags, suspicionDelta };
  }

  const isControlled = medication.controlledSchedule !== "none";

  if (isControlled) {
    flags.push({
      code: "CONTROLLED_SUBSTANCE",
      severity: "critical",
      message: `${medication.genericName} is a Schedule ${medication.controlledSchedule} controlled substance and cannot be auto-refilled in this demo.`,
      evidence: medication.notes,
    });
    if (medication.controlledSchedule === "II") {
      flags.push({
        code: "SCHEDULE_II_NO_REFILL",
        severity: "critical",
        message:
          "Schedule II prescriptions cannot be refilled under federal law (21 U.S.C. 829(a)); a new prescription is required.",
        evidence: "DEA Practitioner's Manual / 21 CFR 1306.12",
      });
    }
  }

  if (
    claimed.doseMg !== undefined &&
    medication.commonDosesMg.length > 0 &&
    !medication.commonDosesMg.includes(claimed.doseMg)
  ) {
    flags.push({
      code: "UNSUPPORTED_DOSE",
      severity: "warning",
      message: `Requested dose ${claimed.doseMg} mg is outside common tablet strengths for ${medication.genericName} in this demo formulary.`,
      evidence: `Common doses: ${medication.commonDosesMg.join(", ")} mg`,
    });
    suspicionDelta += weights.unsupportedDose;
  }

  // Stability / follow-up thresholds apply to non-controlled auto-refill candidates.
  // Controlled substances already fail above; skip noisy redundant flags.
  if (!isControlled && claimed.durationMonthsClaimed === undefined) {
    flags.push({
      code: "MISSING_VERIFICATION",
      severity: "critical",
      message: "Duration on medication was not provided.",
    });
  } else if (!isControlled && claimed.durationMonthsClaimed !== undefined && claimed.durationMonthsClaimed < medication.minStableMonthsForRefill) {
    flags.push({
      code: "RECENT_START",
      severity: "warning",
      message: `Reported ~${claimed.durationMonthsClaimed} months on therapy; rubric requires ≥${medication.minStableMonthsForRefill} months before auto-refill for this class.`,
      evidence: medication.notes,
    });
  }

  if (claimed.recentDoseChange === true) {
    flags.push({
      code: "RECENT_DOSE_CHANGE",
      severity: "warning",
      message: "Patient reported a dose change within the last 3 months; titration needs clinician review.",
    });
  }

  if (claimed.indicationClaimed) {
    if (!indicationFitsMedication(claimed.indicationClaimed, medication)) {
      flags.push({
        code: "INDICATION_MISMATCH",
        severity: "warning",
        message: `Reported indication "${claimed.indicationClaimed}" does not align with common indications for ${medication.genericName}.`,
        evidence: `Rubric indications: ${medication.commonIndications.join(", ")}`,
      });
      suspicionDelta += weights.indicationMismatch;
    }
  } else {
    flags.push({
      code: "MISSING_VERIFICATION",
      severity: "warning",
      message: "Indication was not provided.",
    });
  }

  if (!isControlled) {
    if (claimed.monthsSinceFollowUp === undefined) {
      flags.push({
        code: "MISSING_VERIFICATION",
        severity: "warning",
        message: "Time since last clinician follow-up was not provided.",
      });
    } else if (claimed.monthsSinceFollowUp > medication.maxMonthsSinceFollowUp) {
      flags.push({
        code: "STALE_FOLLOW_UP",
        severity: "warning",
        message: `Last clinician visit reported ~${claimed.monthsSinceFollowUp} months ago; exceeds ${medication.maxMonthsSinceFollowUp}-month follow-up window for this medication class.`,
      });
    }
  }

  if (!isControlled && medication.requiresLabMonitoring) {
    if (claimed.recentLabsClaimed !== true) {
      flags.push({
        code: "REQUIRES_LAB_MONITORING",
        severity: "critical",
        message: `${medication.genericName} requires recent laboratory monitoring; patient did not confirm current labs within the rubric window.`,
        evidence: medication.notes,
      });
    }
  }

  if (claimed.daysSupplyRemainingClaimed !== undefined) {
    const days = claimed.daysSupplyRemainingClaimed;
    if (days > GUARDRAIL_CONFIG.refillEarlyDaysMax) {
      flags.push({
        code: "OUTSIDE_REFILL_WINDOW",
        severity: "warning",
        message: `Patient reports ~${days} days of medication remaining; earlier than the ${GUARDRAIL_CONFIG.refillEarlyDaysMax}-day refill window.`,
      });
    } else if (days < -GUARDRAIL_CONFIG.refillGraceDaysAfterRunout) {
      flags.push({
        code: "OUTSIDE_REFILL_WINDOW",
        severity: "warning",
        message: `Patient reports being out of medication for ~${Math.abs(days)} days; outside grace window for auto-refill.`,
      });
    }
  }

  if (claimed.symptomStabilityClaimed === "worsening") {
    flags.push({
      code: "SYMPTOM_INSTABILITY",
      severity: "warning",
      message: "Patient reports worsening symptoms; auto-refill is not appropriate.",
    });
  } else if (claimed.symptomStabilityClaimed === "unclear") {
    flags.push({
      code: "VAGUE_ANSWERS",
      severity: "info",
      message: "Symptom stability answer was unclear.",
    });
    suspicionDelta += weights.vagueOrEvasive;
  }

  return { flags, suspicionDelta, medication };
}

/** Within-chat consistency checks (no external records). */
export function evaluateConversationConsistency(
  claimed: ClaimedFacts,
  latestUserText: string,
): { flags: FlagReason[]; suspicionDelta: number } {
  const flags: FlagReason[] = [];
  let suspicionDelta = 0;
  const weights = GUARDRAIL_CONFIG.suspicionWeights;
  const doseMatch = latestUserText.match(/(\d+(?:\.\d+)?)\s*mg\b/i);

  if (
    claimed.recentDoseChange === false &&
    doseMatch &&
    claimed.doseMg !== undefined &&
    Number(doseMatch[1]) !== claimed.doseMg
  ) {
    flags.push({
      code: "DOSE_CONTRADICTION",
      severity: "critical",
      message: `Patient denied a recent dose change but mentioned ${doseMatch[1]} mg, which differs from the requested ${claimed.doseMg} mg.`,
      evidence: latestUserText.slice(0, 160),
    });
    suspicionDelta += weights.doseContradiction;
  }

  if (
    claimed.durationMonthsClaimed !== undefined &&
    claimed.durationMonthsClaimed < 3 &&
    claimed.recentDoseChange === false &&
    /\b(years?|long[- ]?term|forever)\b/i.test(latestUserText)
  ) {
    flags.push({
      code: "TIMELINE_INCONSISTENCY",
      severity: "warning",
      message: "Duration answers appear internally inconsistent within the conversation.",
      evidence: latestUserText.slice(0, 160),
    });
    suspicionDelta += weights.timelineInconsistency;
  }

  return { flags, suspicionDelta };
}

export function shouldEscalate(flags: FlagReason[], suspicionScore: number): boolean {
  if (flags.some((f) => f.severity === "critical")) return true;
  if (suspicionScore >= GUARDRAIL_CONFIG.suspicionEscalateAt) return true;
  const escalateCodes = new Set([
    "RECENT_START",
    "RECENT_DOSE_CHANGE",
    "STALE_FOLLOW_UP",
    "REQUIRES_LAB_MONITORING",
    "SYMPTOM_INSTABILITY",
    "OUTSIDE_REFILL_WINDOW",
    "INDICATION_MISMATCH",
    "DOSE_CONTRADICTION",
    "TIMELINE_INCONSISTENCY",
    "UNKNOWN_MEDICATION",
    "UNSUPPORTED_DOSE",
    "MISSING_VERIFICATION",
    "CONTROLLED_SUBSTANCE",
    "SCHEDULE_II_NO_REFILL",
    "CRISIS_LANGUAGE",
  ]);
  return flags.some((f) => escalateCodes.has(f.code));
}
