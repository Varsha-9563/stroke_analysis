# NeuroFlex frontend redesign

## Goal
Rebuild the supplied working React frontend in the selected Clinical Command Precision direction while preserving every existing API contract, JWT/localStorage behavior, role redirect, chart, exercise action, and discharge flow.

## What will change
- Replace the placeholder home screen with a complete NeuroFlex landing page explaining the glove-to-insight workflow, five-step process, demo-labeled movement comparison, doctor/patient experiences, and login calls to action.
- Add a polished split-screen sign-in and registration experience that keeps the existing role-based authentication behavior unchanged.
- Recreate the doctor workspace with a compact responsive navigation rail, patient metrics, search and status filters, patient rows, recovery profile, trend and finger analysis, recommendation selection, notes, adherence history, refresh, and discharge actions.
- Recreate the patient workspace with personal recovery progress, assigned doctor, daily completion, exercise tracking, encouraging confirmations, recovery chart, and honest empty/error/loading states.
- Use the selected navy/teal palette, Sora/Manrope typography, restrained motion, accessible controls, and responsive layouts, with particular care for patient use on mobile.

## Technical details
- Keep TanStack Start routing and create `/`, `/login`, `/doctor`, `/doctor/patient/$patientId`, and `/patient` routes.
- Keep API endpoints exactly as supplied and attach the stored JWT bearer token to all protected calls.
- Keep `token`, `role`, and `user_id` localStorage keys and the existing doctor/patient redirect rules.
- Continue using Recharts for live data visualizations; never invent clinical results when an API field is absent.
- Use the generated clinical glove image from the selected direction as a local app asset.
- Add unique metadata for every content route and verify desktop and mobile screens, route protection, forms, charts, and action states.

## Data and infrastructure
No new database or backend is added. The supplied backend remains the source of truth and must be running at `http://localhost:8000` for authenticated data and actions.
