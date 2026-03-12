# Tableau → dbt Exporter

Turn your Tableau workbook's calculated fields into a production-ready dbt semantic layer — staging models, mart models, MetricFlow metrics, schema tests, and source definitions — in Snowflake or BigQuery SQL.

**You're not starting from scratch. You're starting from 80% done.**

---

## What it does

Upload a `.twb` or `.twbx` file. The tool parses every calculated field, translates the Tableau formula syntax to SQL, and generates a structured dbt package ready to drop into your project.

**What you get in the `.zip`:**

```
dbt_export/
├── models/
│   ├── staging/
│   │   └── stg_{datasource}.sql       ← typed view over raw source
│   └── marts/
│       ├── fct_{datasource}.sql       ← aggregate metrics with GROUP BY
│       └── dim_{datasource}.sql       ← row-level expressions, no aggregation
├── metrics.yml                        ← MetricFlow semantic layer (dbt >= 1.6)
├── schema.yml                         ← model docs + not_null tests
├── sources.yml                        ← source definitions
├── dbt_project.yml
├── SETUP.md                           ← step-by-step wiring guide
├── translation_report.md              ← formula → SQL side by side, LOD CTEs, window hints
└── conflict_report.md                 ← multi-workbook merge summary (if applicable)
```

**Key capabilities:**
- Resolves `Calculation_XXXX` internal Tableau IDs to human-readable field names
- Splits aggregate expressions (`SUM`/`COUNT`/`AVG`) into `fct_` models and row-level expressions into `dim_` models — no more invalid SQL mixing both
- Translates LOD expressions (`FIXED`/`INCLUDE`/`EXCLUDE`) to CTE templates injected directly into the model's `WITH` clause
- AI refinement pass (Claude) for complex calcs — returns dialect-specific SQL, field descriptions, and AE recommendations
- Window function rewrite hints for untranslatable table calcs (`RUNNING_SUM`, `RANK`, `INDEX`, etc.)
- Privacy scan before any data leaves the browser — server URLs and connection metadata stay local
- **Multi-workbook merge mode** — upload 2+ workbooks, auto-deduplicate identical fields, flag formula conflicts, generate a `conflict_report.md`
- **Models breakdown preview** — see the full STG / FCT / DIM output structure before running, with grain status per model
- **PostHog analytics** — usage events tracked for product iteration

---

## Stack

- **Frontend:** React + Vite (`src/`)
- **Serverless functions:** Vercel (`api/`)
- **AI:** Anthropic Claude via `/api/translate` proxy
- **Payments:** Stripe Checkout
- **Email / Audience:** Resend
- **Database:** Supabase (`email_captures` table)
- **Analytics:** PostHog
- **Deployment:** Vercel (auto-deploys from `main`)

---

## Project structure

```
src/
├── App.jsx               # All UI stages and state
├── lib/
│   ├── engine.js         # Parser, classifier, translator, output generators
│   └── zip.js            # Output file assembly
└── components/
    ├── Badge.jsx
    ├── ProgressBar.jsx
    ├── EmailGateModal.jsx
    └── PaywallBanner.jsx

api/
├── translate.js          # Anthropic proxy
├── create-checkout.js    # Stripe Checkout session
├── verify-session.js     # Stripe payment verification
└── capture-email.js      # Supabase + Resend email capture
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for full engine design, translation logic, LOD handling, and known limitations.

---

## Deploying to Vercel

```bash
vercel --prod
```

Set environment variables in the Vercel dashboard. The `vercel.json` handles SPA routing and API function paths automatically.
