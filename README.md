# Mental health refill triage agent (demo)

Plain Node.js + TypeScript demo of a chat agent that triages mental health medication refill requests by scoring **conversation answers against a safety rubric**. It can either **simulate sending a refill order to a pharmacy** or **escalate to human review** with structured flag reasons.

This is **not** medical advice, **not** a real pharmacy system, and **not** a clinician. It does not prescribe or diagnose.

## Decision model

1. Ask structured follow-up questions in chat (name for display, medication/dose, duration, indication, recent dose change, last clinician visit, labs if needed, symptom stability, pharmacy).
2. Score answers against the refill **rubric** (`src/agent/rubric.ts`, thresholds in `src/data/guardrails.ts` + medication catalog).
3. Rubric pass → simulate pharmacy refill order.
4. Rubric fail, within-chat contradictions, controlled substance, or crisis language → human review with clear flags.

**There is no patient chart / synthetic EHR lookup.** Demo scripts on the home page are walkthroughs only, not medical records.

## Features

- Patient chat UI with disclaimer banner and clear decision status
- Human review queue with display name, claimed answers, transcript, and articulated flag reasons
- Research-backed guardrail thresholds (see [GUARDRAILS.md](./GUARDRAILS.md))
- Within-chat consistency checks (for example denying a dose change while stating a conflicting mg)
- Crisis / self-harm detection with calm redirect messaging and immediate escalation

## Requirements

- Node.js 18+
- npm

## How to run

```bash
npm install
npm run build
npm start
```

Then open:

- Home: http://localhost:3000/
- Patient chat: http://localhost:3000/patient/
- Human review: http://localhost:3000/review/

Development:

```bash
npm install
npm run dev
```

Optional: `PORT=4000 npm start`

## API overview

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/scenarios` | Demo walkthrough scripts |
| GET | `/api/medications` | Formulary / rubric medication catalog |
| POST | `/api/chat/sessions` | Start conversation |
| POST | `/api/chat/sessions/:id/messages` | Send patient message |
| GET | `/api/cases` | List review cases |
| PATCH | `/api/cases/:id` | Update case status / notes |
| GET | `/api/orders` | List simulated pharmacy orders |
| POST | `/api/demo/reset` | Clear local store |

Runtime state is stored under `data/runtime/store.json`.

## Demo walkthrough

### Refill approved

In Patient chat, answer:

1. `Alex Rivera`
2. `sertraline 100 mg`
3. `14 months`
4. `depression`
5. `no` (no dose change in last 3 months)
6. `6 months ago` (last clinician visit)
7. `stable, Harbor Community Pharmacy`

Expected: **Simulated refill order sent**. Check `/api/orders`.

### Human review examples

| Path | Key answers that fail the rubric |
|------|----------------------------------|
| Contradictory / mismatched | `escitalopram 10 mg` → indication `ADHD` → dose-change `no, still on 40 mg though` |
| Benzodiazepine | `alprazolam 0.5 mg` (any otherwise "good" answers still escalate) |
| Schedule II stimulant | `Adderall 20 mg` |
| Recent starter | `venlafaxine 75 mg` + `3 weeks` + dose change `yes` |
| Lithium monitoring | `lithium 600 mg` + follow-up `8 months ago` + labs `no` |
| Crisis | Any message with suicidal ideation / self-harm language |

## Project layout

```text
src/
  agent/       conversation loop, crisis detection, rubric scoring
  data/        medications, guardrail config, demo scenarios
  server/      Express app + REST API
  store/       JSON file persistence
  types/       shared TypeScript types
public/
  patient/     chat UI
  review/      human review dashboard
GUARDRAILS.md  research notes + citations
```

## Safety notes

- Crisis language triggers mandatory human escalation.
- Controlled substances (benzodiazepines, stimulants) always escalate.
- Medications requiring labs (for example lithium) escalate unless recent labs are confirmed in chat.
- All pharmacy orders are simulated only.
