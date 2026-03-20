# TableautoDbt — Tableau Workbook Tools

A suite of free, browser-based tools for Tableau users and analytics engineers. Parse, document, audit, diff, and migrate Tableau workbooks — all without uploading anything to a server.

**tableautodbt.com**

---

## Tools

### /convert — Tableau → dbt Exporter
Turn your Tableau workbook's calculated fields into a production-ready dbt semantic layer — staging models, mart models, MetricFlow metrics, schema tests, and source definitions — in Snowflake or BigQuery SQL.

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
- Splits aggregate expressions (`SUM`/`COUNT`/`AVG`) into `fct_` models and row-level expressions into `dim_` models
- Translates LOD expressions (`FIXED`/`INCLUDE`/`EXCLUDE`) to CTE templates injected into the model's `WITH` clause
- AI refinement pass (Claude) for complex calcs — dialect-specific SQL, field descriptions, and AE recommendations
- Window function rewrite hints for untranslatable table calcs (`RUNNING_SUM`, `RANK`, `INDEX`, etc.)
- Privacy scan before any data leaves the browser — server URLs and connection metadata stay local
- **Multi-workbook merge mode** — upload 2+ workbooks, auto-deduplicate identical fields, flag formula conflicts
- **Models breakdown preview** — see full STG / FCT / DIM output structure before running, with grain status per model

---

### /docs — Workbook Documentation Generator
Auto-generate complete documentation from any Tableau workbook. Browse every formula, field, and data source — no manual effort.

**Tabs:**
- **Calculated Fields** — every formula with syntax highlighting, datatype, role, and dependency list
- **Field Lineage** — interactive dependency graph showing upstream and downstream connections
- **Data Sources** — connection type, server, database, and full field inventory with CSV export
- **Sheets & Dashboards** — which data sources, filters, and fields each sheet uses
- **Parameters** — current values, allowed ranges, and domain types
- **Filters** — every filter across every sheet

**Export options:** JSON, Markdown, Copy MD, Copy for AI (Claude/ChatGPT), Copy for Notion, Download Confluence

---

### /audit — Workbook Health Check & Audit
Instant health score and issue detection for any Tableau workbook. Run before migrating to catch problems early.

**What it checks:**
- Circular dependencies
- Unused calculated fields
- Division without null protection
- Deep and excessive nesting
- Nested LOD expressions
- Non-additive window functions
- Long IF chains
- High overall complexity
- Hardcoded DATETRUNC values

**Health score:** `100 − (errors × 10) − (warnings × 3) − (info × 1)`, clamped 0–100

**Per-field complexity scoring:** Every calc field scored 0–100 across four tiers:
- Simple (0–25): basic math, comparisons, single aggregations
- Moderate (26–50): date functions, CASE/WHEN, IF/ELSEIF, COUNTD
- Complex (51–75): LOD expressions, nested conditions, multi-step logic
- Critical (76–100): deeply nested LODs, circular patterns, untranslatable table calcs

**Export options:** JSON, Markdown, Copy MD, Copy for AI, Copy for Notion, Download Confluence

---

### /diff — Workbook Diff Tool
Compare two versions of a Tableau workbook side by side. See every added, removed, and modified field, formula, parameter, and sheet.

**Categories diffed:** Calculated Fields, Parameters, Data Sources, Sheets, Filters

**Features:**
- Line-level formula diff for modified fields
- Change summary strip with totals by category
- Filter by change type (added / removed / modified)
- Copy individual formula changes

---

### /insights — Cross-Workbook Portfolio Analysis
Upload multiple workbooks and detect duplicates and migration effort across the portfolio.

**Duplicate detection:** Groups fields by normalized name across workbooks, classifies as identical (same formula) or diverged (different formulas)

**Migration effort estimator:** Buckets fields into low / medium / high complexity tiers with hour estimates (low: 0.25–0.5h, medium: 1–2h, high: 4–8h) and per-workbook breakdown table

---

### /methodology — Audit Methodology Reference
Documents all audit rules, complexity scoring formula, health score formula, unused field detection logic, circular dependency detection, and migration effort tiers.

---

## Stack

- **Frontend:** React + Vite (`src/`)
- **Serverless functions:** Vercel (`api/`)
- **AI:** Anthropic Claude (`claude-sonnet-4-6`) via `/api/translate` proxy
- **Payments:** Stripe Checkout
- **Email / Audience:** Resend
- **Database:** Supabase (`email_captures` table)
- **Analytics:** PostHog
- **Deployment:** Vercel

---

## Project Structure

```
src/
├── App.jsx                        # Convert tool — all UI stages and state
├── lib/
│   ├── engine.js                  # Parser, classifier, translator, output generators
│   ├── zip.js                     # Output file assembly
│   ├── auditEngine.js             # Audit rules, health scoring, complexity scoring
│   ├── multiWorkbookAnalysis.js   # Cross-workbook duplicate detection + effort estimation
│   └── markdownExport.js          # AI prompt generator, Markdown/Notion/Confluence exporters
└── pages/
    ├── DocsPage.jsx               # /docs — workbook documentation browser
    ├── AuditPage.jsx              # /audit — health check and issue list
    ├── DiffPage.jsx               # /diff — side-by-side workbook comparison
    ├── InsightsPage.jsx           # /insights — cross-workbook portfolio analysis
    └── MethodologyPage.jsx        # /methodology — audit rules reference

public/
├── landing-convert.html           # SEO landing page for /convert
├── landing-docs.html              # SEO landing page for /docs
├── landing-audit.html             # SEO landing page for /audit
├── landing-diff.html              # SEO landing page for /diff
├── sitemap.xml
└── robots.txt

api/
├── translate.js                   # Anthropic API proxy
├── create-checkout.js             # Stripe Checkout session
├── verify-session.js              # Stripe payment verification
└── capture-email.js               # Supabase insert + Resend email capture
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for full engine design, translation logic, LOD handling, and known limitations.

---

## Deploying

```bash
npm run build
vercel --prod
```

Set environment variables in the Vercel dashboard. The `vercel.json` handles SPA routing and API function paths automatically.

---

## SEO

Each tool has a dedicated keyword-optimized landing page served from `public/`:

| Landing page | Target keywords |
|---|---|
| `/landing-convert` | tableau to dbt converter, tableau calculated fields to dbt models |
| `/landing-docs` | tableau workbook documentation generator, read twb file without tableau |
| `/landing-audit` | tableau workbook audit tool, tableau workbook health check |
| `/landing-diff` | tableau workbook diff tool, compare tableau workbooks |

All pages include Open Graph tags, Twitter cards, and JSON-LD `SoftwareApplication` structured data. Sitemap at `/sitemap.xml`.
