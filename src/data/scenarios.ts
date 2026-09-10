import type { DemoScenario } from "../types/index.js";

/**
 * Demo walkthrough scripts only. These are NOT patient medical records and are
 * never looked up during triage. The agent scores free-form chat answers against
 * the refill rubric in src/data/guardrails.ts and src/agent/rubric.ts.
 */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "eligible-ssri",
    title: "Eligible SSRI refill",
    expectedOutcome: "refill_approved",
    summary:
      "Stable non-controlled antidepressant, long enough duration, no recent dose change, recent follow-up, stable symptoms.",
    suggestedName: "Alex Rivera",
    script: [
      "Alex Rivera",
      "sertraline 100 mg",
      "14 months",
      "depression",
      "no",
      "6 months ago",
      "stable, Harbor Community Pharmacy",
    ],
  },
  {
    id: "suspicious-answers",
    title: "Rubric fail: contradictory / mismatched answers",
    expectedOutcome: "human_review",
    summary:
      "Dose figures contradict each other, indication does not fit the drug class, and answers are inconsistent within the chat.",
    suggestedName: "Jordan Lee",
    script: [
      "Jordan Lee",
      "escitalopram 10 mg",
      "2 years",
      "ADHD",
      "no, still on 40 mg though",
      "1 year ago",
      "stable",
    ],
  },
  {
    id: "controlled-benzo",
    title: "Controlled substance (benzodiazepine)",
    expectedOutcome: "human_review",
    summary: "Schedule IV benzo always fails the auto-refill rubric.",
    suggestedName: "Sam Chen",
    script: [
      "Sam Chen",
      "alprazolam 0.5 mg",
      "24 months",
      "panic disorder",
      "no",
      "2 months ago",
      "stable, Lakeside Pharmacy",
    ],
  },
  {
    id: "schedule-ii-stimulant",
    title: "Schedule II stimulant",
    expectedOutcome: "human_review",
    summary: "Federal no-refill rule for Schedule II; always escalate.",
    suggestedName: "Taylor Brooks",
    script: [
      "Taylor Brooks",
      "Adderall 20 mg",
      "36 months",
      "ADHD",
      "no",
      "3 months ago",
      "stable",
    ],
  },
  {
    id: "recent-starter",
    title: "Recent starter / dose change",
    expectedOutcome: "human_review",
    summary: "Short duration and recent titration fail stability thresholds.",
    suggestedName: "Morgan Patel",
    script: [
      "Morgan Patel",
      "venlafaxine 75 mg",
      "3 weeks",
      "depression",
      "yes",
      "2 weeks ago",
      "stable",
    ],
  },
  {
    id: "lithium-monitoring",
    title: "High-monitoring mood stabilizer",
    expectedOutcome: "human_review",
    summary: "Lithium requires lab monitoring; missing/unclear labs fail the rubric.",
    suggestedName: "Casey Nguyen",
    script: [
      "Casey Nguyen",
      "lithium 600 mg",
      "24 months",
      "bipolar disorder",
      "no",
      "8 months ago",
      "no",
      "stable, Metro Specialty Pharmacy",
    ],
  },
  {
    id: "crisis",
    title: "Crisis language",
    expectedOutcome: "crisis_escalation",
    summary: "Any crisis / self-harm language immediately escalates with redirect messaging.",
    suggestedName: "Any name",
    script: ["Any name", "(at any step) include suicidal ideation wording"],
  },
];

export function listDemoScenarios(): DemoScenario[] {
  return DEMO_SCENARIOS;
}
