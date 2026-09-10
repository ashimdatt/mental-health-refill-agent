# Refill eligibility guardrails (rubric notes)

This document summarizes **publicly available** regulatory and clinical practice signals used to configure the demo **refill rubric**. The agent evaluates **conversation answers only**. It does **not** look up a patient chart or synthetic medical record database.

This is **not** a treatment guideline, **not** medical advice, and **not** a substitute for clinician judgment or pharmacy law.

Thresholds live in `src/data/guardrails.ts` and per-medication fields in `src/data/medications.ts`. Scoring is implemented in `src/agent/rubric.ts`.

## How evaluation works

1. Structured chat answers are captured as `ClaimedFacts`.
2. `evaluateRubric()` applies class/schedule thresholds, indication fit, stability, follow-up freshness, and lab requirements.
3. `evaluateConversationConsistency()` flags contradictions **within the same chat** (for example denying a dose change while stating a different mg).
4. Crisis patterns short-circuit to immediate escalation.

Demo scripts in `src/data/scenarios.ts` are walkthroughs for operators, not EHR rows.

## Core rubric policy

| Situation (from chat answers) | Demo decision | Rationale summary |
|-------------------------------|---------------|-------------------|
| Stable non-controlled SSRI/SNRI/bupropion, duration ≥ ~3 months, no recent dose change, follow-up within ~12 months, indication fits class, symptoms not worsening | May simulate pharmacy refill order | Common bridge-refill practice for stable non-controlled maintenance meds |
| Benzodiazepines (Schedule IV) | Always escalate | Controlled substance; federal refill limits; diversion / dependence risk |
| Stimulants (Schedule II) | Always escalate | Federal law prohibits refilling Schedule II prescriptions |
| Recent start or recent dose change | Escalate | Initiation / titration needs clinician oversight |
| Indication does not fit medication class | Escalate | Rubric clinical-fit check (not chart matching) |
| Within-chat dose / timeline contradictions | Escalate | Suspicion / consistency risk |
| Lithium / atypical antipsychotics without confirmed recent labs or with stale follow-up | Escalate | Monitoring requirements |
| Crisis / self-harm language | Immediate escalate + redirect | Safety-first; no methods discussion |

## Controlled substances (regulatory)

### Schedule II (example: amphetamine mixed salts, methylphenidate)

- Federal law **prohibits refilling** Schedule II prescriptions. A new prescription is required for each fill.
- Sources:
  - [21 U.S.C. 829(a)](https://www.law.cornell.edu/uscode/text/21/829)
  - [DEA Practitioner's Manual PDF](https://www.deadiversion.usdoj.gov/GDP/(DEA-DC-071)(EO-DEA226)_Practitioner's_Manual_(final).pdf)
  - [21 CFR Part 1306](https://www.ecfr.gov/current/title-21/chapter-II/part-1306)

### Schedule III / IV (example: alprazolam, clonazepam)

- Schedule III/IV prescriptions may be refilled only if authorized, generally **no more than five times within six months** of the issue date under federal rules.
- Sources:
  - [21 U.S.C. 829(b)](https://www.law.cornell.edu/uscode/text/21/829)
  - [21 CFR 1306.22](https://www.ecfr.gov/current/title-21/chapter-II/part-1306/section-1306.22)

### Demo interpretation

This demo **never auto-approves** controlled substances. Telemedicine flexibilities may affect how a clinician can prescribe remotely; they do not authorize an unattended chat agent to auto-refill controlled meds.

- Example: [DEA telemedicine flexibility extension](https://www.dea.gov/press-releases/2025/12/31/dea-extends-telemedicine-flexibilities-ensure-continued-access-care)

## Non-controlled antidepressants (SSRI / SNRI / bupropion)

Public-facing bridge-refill practices commonly treat **stable, non-controlled** antidepressants as potentially refillable when:

- The patient reports already being established on the medication
- Dose has been unchanged for months (often around **3 months**)
- Recent enough clinical follow-up (often within about **12 months**)
- Symptoms are not unstable and the request is not a new start / dose change

Illustrative practice descriptions:

- [Bridge refill overview](https://bidwellhealth.com/bridge-refill)
- [Sertraline refill guide](https://bidwellhealth.com/refill/sertraline)
- [FAQ](https://bidwellhealth.com/faq)

### Demo thresholds encoded

- SSRIs/SNRIs/bupropion: minimum **3 months** reported duration
- Recent dose change within **3 months** (yes answer): escalate
- Follow-up older than **12 months**: escalate
- Worsening symptoms: escalate
- Indication must fit medication `commonIndications` (class fit), not a charted diagnosis list

## Mood stabilizers and atypical antipsychotics

### Lithium

Maintenance practice typically includes periodic serum lithium levels plus renal / thyroid related monitoring (often every **3 to 6 months** once stable).

Sources:

- [NHS SPS lithium monitoring](https://sps.nhs.uk/monitorings/lithium-monitoring/)
- [PMC12145353](https://pmc.ncbi.nlm.nih.gov/articles/PMC12145353/)
- [PMC11604892](https://pmc.ncbi.nlm.nih.gov/articles/PMC11604892/)

### Atypical antipsychotics

Metabolic monitoring is commonly recommended during maintenance. Broader maintenance reassessment context: [PsychiatryOnline bipolar practice guideline (revision)](https://psychiatryonline.org/doi/10.1176/foc.1.1.64).

### Demo thresholds encoded

- Lithium / aripiprazole: `requiresLabMonitoring = true`
- Longer stability (**6 months**) and closer follow-up (**6 months**)
- Patient must confirm recent labs in chat or the case escalates with `REQUIRES_LAB_MONITORING`

## Crisis and safety

- Keyword/pattern detection for suicidal ideation / self-harm language
- Immediate human escalation
- Calm redirect to emergency services / 988
- No discussion of methods

## Important disclaimer

Encoding research into software thresholds does **not** create a clinical standard of care. Real refill decisions depend on jurisdiction, pharmacy corresponding responsibility, the patient's full chart, and a licensed clinician's judgment.
