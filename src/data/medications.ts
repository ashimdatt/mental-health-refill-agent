import type { MedicationDefinition } from "../types/index.js";

/**
 * Formulary + per-medication rubric thresholds (not a patient chart DB).
 * Derived from:
 * - DEA Practitioner's Manual / 21 CFR 1306 (controlled substance refill rules)
 * - Common bridge-refill clinical practice for stable non-controlled psychotropics
 * - Lithium / atypical antipsychotic lab monitoring guidance
 * See GUARDRAILS.md for citations.
 */
export const MEDICATIONS: Record<string, MedicationDefinition> = {
  sertraline: {
    id: "sertraline",
    genericName: "sertraline",
    brandNames: ["Zoloft"],
    class: "ssri",
    controlledSchedule: "none",
    commonIndications: ["major depressive disorder", "generalized anxiety", "panic disorder", "OCD", "PTSD"],
    commonDosesMg: [25, 50, 100, 150, 200],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 3,
    maxMonthsSinceFollowUp: 12,
    notes: "Non-controlled SSRI. Bridge refill often considered after months of stable dose.",
  },
  escitalopram: {
    id: "escitalopram",
    genericName: "escitalopram",
    brandNames: ["Lexapro"],
    class: "ssri",
    controlledSchedule: "none",
    commonIndications: ["major depressive disorder", "generalized anxiety"],
    commonDosesMg: [5, 10, 15, 20],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 3,
    maxMonthsSinceFollowUp: 12,
    notes: "Non-controlled SSRI.",
  },
  venlafaxine: {
    id: "venlafaxine",
    genericName: "venlafaxine",
    brandNames: ["Effexor", "Effexor XR"],
    class: "snri",
    controlledSchedule: "none",
    commonIndications: ["major depressive disorder", "generalized anxiety", "panic disorder"],
    commonDosesMg: [37.5, 75, 150, 225],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 3,
    maxMonthsSinceFollowUp: 12,
    notes: "Non-controlled SNRI. Abrupt gaps can cause discontinuation symptoms; adherence gaps escalate.",
  },
  bupropion: {
    id: "bupropion",
    genericName: "bupropion",
    brandNames: ["Wellbutrin", "Wellbutrin XL"],
    class: "other_antidepressant",
    controlledSchedule: "none",
    commonIndications: ["major depressive disorder", "seasonal affective disorder", "smoking cessation"],
    commonDosesMg: [150, 300, 450],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 3,
    maxMonthsSinceFollowUp: 12,
    notes: "Non-controlled antidepressant commonly eligible for bridge refill when stable.",
  },
  aripiprazole: {
    id: "aripiprazole",
    genericName: "aripiprazole",
    brandNames: ["Abilify"],
    class: "atypical_antipsychotic",
    controlledSchedule: "none",
    commonIndications: ["schizophrenia", "bipolar disorder", "adjunct depression"],
    commonDosesMg: [2, 5, 10, 15, 20],
    requiresLabMonitoring: true,
    minStableMonthsForRefill: 6,
    maxMonthsSinceFollowUp: 6,
    notes: "Atypical antipsychotic: metabolic monitoring expected; demo requires recent labs and closer follow-up.",
  },
  lithium: {
    id: "lithium",
    genericName: "lithium carbonate",
    brandNames: ["Lithobid", "Eskalith"],
    class: "mood_stabilizer",
    controlledSchedule: "none",
    commonIndications: ["bipolar disorder"],
    commonDosesMg: [300, 450, 600, 900],
    requiresLabMonitoring: true,
    minStableMonthsForRefill: 6,
    maxMonthsSinceFollowUp: 6,
    notes: "Narrow therapeutic index; lithium level / renal / thyroid monitoring required for maintenance.",
  },
  alprazolam: {
    id: "alprazolam",
    genericName: "alprazolam",
    brandNames: ["Xanax"],
    class: "benzodiazepine",
    controlledSchedule: "IV",
    commonIndications: ["panic disorder", "anxiety"],
    commonDosesMg: [0.25, 0.5, 1, 2],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 999,
    maxMonthsSinceFollowUp: 0,
    notes: "Schedule IV benzodiazepine. Demo always escalates; federal refill limits apply (max 5 refills / 6 months).",
  },
  clonazepam: {
    id: "clonazepam",
    genericName: "clonazepam",
    brandNames: ["Klonopin"],
    class: "benzodiazepine",
    controlledSchedule: "IV",
    commonIndications: ["panic disorder", "seizure disorders"],
    commonDosesMg: [0.5, 1, 2],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 999,
    maxMonthsSinceFollowUp: 0,
    notes: "Schedule IV benzodiazepine. Demo always escalates.",
  },
  amphetamine_salts: {
    id: "amphetamine_salts",
    genericName: "amphetamine mixed salts",
    brandNames: ["Adderall", "Adderall XR"],
    class: "stimulant",
    controlledSchedule: "II",
    commonIndications: ["ADHD", "narcolepsy"],
    commonDosesMg: [5, 10, 15, 20, 30],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 999,
    maxMonthsSinceFollowUp: 0,
    notes: "Schedule II stimulant. Federal law prohibits prescription refills; new Rx required each fill.",
  },
  methylphenidate: {
    id: "methylphenidate",
    genericName: "methylphenidate",
    brandNames: ["Ritalin", "Concerta"],
    class: "stimulant",
    controlledSchedule: "II",
    commonIndications: ["ADHD", "narcolepsy"],
    commonDosesMg: [10, 18, 20, 27, 36, 54],
    requiresLabMonitoring: false,
    minStableMonthsForRefill: 999,
    maxMonthsSinceFollowUp: 0,
    notes: "Schedule II stimulant. No refills under federal law.",
  },
};

export function findMedicationByName(raw: string): MedicationDefinition | undefined {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;

  for (const med of Object.values(MEDICATIONS)) {
    if (med.genericName === normalized || med.id === normalized) return med;
    if (med.brandNames.some((b) => b.toLowerCase() === normalized)) return med;
    if (normalized.includes(med.genericName)) return med;
    if (med.brandNames.some((b) => normalized.includes(b.toLowerCase()))) return med;
  }
  return undefined;
}

export function listMedications(): MedicationDefinition[] {
  return Object.values(MEDICATIONS);
}
