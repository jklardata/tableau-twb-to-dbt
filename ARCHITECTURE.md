# Tableau → dbt Calculated Field Exporter
## Project Requirements, Architecture & Context

> **Purpose of this document:** Full handoff context for continuing development in Claude Code. Everything discussed, decided, built, and deferred — in one place.

---

## 1. What We're Building

A web-based tool that parses Tableau workbook files (`.twb` / `.twbx`) and exports the calculated fields as production-ready dbt SQL models, with full documentation and Snowflake dialect support.

**The one-line pitch:** *"Turn your Tableau workbook's business logic into documented dbt metrics."*

**Target persona:** Analytics engineers (AEs) and BI engineers who are migrating business logic out of Tableau and into a dbt project. This is the person who inherits a Tableau workbook with 100+ calculated fields and needs to reconstruct that logic in SQL — documented, version-controlled, and maintainable.

---

## 2. Why We Built It

### The Pain

Analytics engineers face a specific, well-documented problem: Tableau workbooks accumulate years of business logic in calculated fields that exist nowhere else. When orgs migrate to dbt or a semantic layer, someone has to manually translate every formula. A single workbook can have 200–300 calculated fields. This is days of tedious, error-prone work.

The pain is real and validated by Tableau community posts — people actively asking how to export calculated fields in bulk, how to decode internal Calculation_XXXX references, and how to handle dependencies between fields.

### The Gap

The existing landscape does not solve this:

- **Native Tableau + dbt partnership (Coalesce 2024)** — handles future-state governance (dbt Semantic Layer ↔ Tableau), but does nothing to migrate existing Tableau calc logic into dbt. This is a forward-looking integration, not a migration tool.
- **Euno.ai** — raised $6.25M seed, positioned as an enterprise data governance platform. Not a point tool. Expensive, complex, wrong persona. Their existence validates the market but they're not competing on this specific use case.
- **TWB Auditor / Metadata API** — can export a list of calculated fields to Excel, but provides no SQL translation, no dbt output, no dependency resolution. Just audit/documentation.
- **Manual GPT prompting** — what AEs currently do. Paste formula, get SQL, fix it. One at a time. No structure, no dependency chains, no dbt-ready output.

**No standalone tool exists for the TWB → documented dbt SQL export use case.**

### Business Model Decision

We decided to build this as a **narrow web app** (not a CLI tool), specifically to:
- Have a shareable URL for organic distribution
- Build an email capture gate before download (lead gen)
- Surface a paywall for the paid tier
- Position as a consulting lead-gen tool for KlarData in the short term, monetizable SaaS in the medium term

**Monetization tiers decided:**
- Free: ≤10 fields translated per workbook
- Paid: $49/month or $99/one-time per workbook (unlimited fields)

**Realistic revenue ceiling as a point tool:** $50–150K ARR. Acquisition potential $200–500K. Strong consulting lead-gen value regardless.

---

## 3. Test Data

We built and validated the entire engine against a real client workbook:

- **File:** `Client_Reporting_V2_10_-_for_LF_Logo.twb` (RetireeFirst / LaborFirst client)
- **Raw calculated fields:** 297
- **Unique (deduplicated):** 68
- **Classified as skip:** 21
- **Translated:** 45
- **Untranslatable:** 3

This is the ground truth for all complexity thresholds and translation rule design.

---

## 4. Architecture

### Current State: React Single-Page App (Claude.ai artifact)

Everything is currently in one file: `tableau_dbt_exporter.jsx`

The app is a complete, working React SPA. All parsing happens in the browser. The AI translation layer calls the Anthropic API directly from the client.

### Production Target Stack

```
Frontend:     React (Vite) — same component structure as current JSX
Backend:      FastAPI (Python) OR serverless (Vercel/Netlify Functions)
AI layer:     Anthropic API — claude-sonnet-4-20250514
Storage:      None needed for MVP (stateless — upload → process → download)
Deployment:   Railway or Render (backend) + Vercel (frontend)
Email gate:   Simple form before download — pipe to Resend or Loops
```

### Data Flow

```
User uploads .twb/.twbx
        ↓
[BROWSER] XML parsing (DOMParser)
        ↓
[BROWSER] Privacy scan (scanTWB)
        ↓
[BROWSER] Rule-based translation pass
        ↓
[API] AI refinement pass (Anthropic) — formula logic only, batched
        ↓
[BROWSER] Output file assembly (JSZip)
        ↓
User downloads .zip
```

---

## 5. App Stages / UX Flow

The app has five stages, rendered conditionally:

| Stage | Trigger | What Happens |
|---|---|---|
| `upload` | Default | Drop zone + feature cards |
| `parsing` | File selected | XML parse + classify + rule-based translate |
| `scan` | Parse complete | Privacy disclosure screen |
| `preview` | User approves scan | Field breakdown table with complexity badges |
| `translating` | User clicks Run | AI pass on flagged calcs, live log |
| `results` | Translation done | 4-tab output (Report / SQL Models / schema.yml / sources.yml) |

---

## 6. Core Engine Logic

### 6a. Parsing (`parseTWB`)

Reads the TWB XML and extracts all `<column caption="...">` elements that contain a `<calculation formula="...">` child. Deduplicates by `caption + formula[:100]` key.

Also builds the **internal ID map**: Tableau generates internal IDs for calculated fields like `Calculation_1634806716618883078`. The parser maps these to their human-readable captions so the translation engine can resolve them.

### 6b. Complexity Classification (`classify`)

Every calc is classified into one of five buckets:

| Class | Criteria | Action |
|---|---|---|
| `skip` | Literal strings, numbers, booleans, parameter refs, bin definitions | Excluded from output |
| `simple` | Basic math, comparisons, aggregations | Rule-based only |
| `moderate` | Date functions, CASE/WHEN, IF/ELSEIF, IIF, COUNTD | Rule-based + optional AI |
| `complex` | LOD expressions (FIXED, INCLUDE, EXCLUDE) | Always AI-refined |
| `untranslatable` | Table calcs: INDEX, WINDOW_*, RUNNING_*, RANK, SIZE, FIRST, LAST | Flagged in report, no SQL generated |

### 6c. Rule-Based Translation (`ruleBasedTranslate`)

Applies regex-based substitutions for known Tableau → Snowflake function mappings:

| Tableau | Snowflake |
|---|---|
| `IIF(...)` | `IFF(...)` |
| `DATETRUNC('...')` | `DATE_TRUNC('...')` |
| `TODAY()` | `CURRENT_DATE` |
| `NOW()` | `CURRENT_TIMESTAMP` |
| `COUNTD(` | `COUNT(DISTINCT ` |
| `LEN(` | `LENGTH(` |
| `#2025-01-01#` | `'2025-01-01'::DATE` |
| `[Field Name]` | `field_name` (slugified) |
| Double-quoted strings | Single-quoted (Snowflake standard) |
| `// comments` | Stripped |
| `\r\n` | Normalized to `\n` |

### 6d. Internal Reference Resolution

Tableau auto-generates internal IDs for calculated fields when they're referenced by other calcs. Example: `[Calculation_1843661155940384776]` is actually the `Case Age` field.

The engine builds a registry from the XML and substitutes all `Calculation_XXXX` references with the human slug (`case_age`) before translation. **38 internal references were resolved in the test workbook.**

### 6e. Parameter Annotation

Tableau parameter references (`[Parameters].[Parameter 7]`) cannot be automatically resolved — they require an AE decision. Instead of silently dropping them or failing, the engine replaces them with inline comments:

```sql
/* 🔧 PARAM:parameter_7 — replace with your parameter logic */
```

This makes them impossible to miss during review.

### 6f. Dependency Chain Detection (`findDependencies`)

Some calculated fields reference other calculated fields. The engine builds a dependency graph and inlines dependencies as CTEs in the generated SQL model.

**12 dependency chains found in test workbook.** Example:
```
NPS Calculation → Total NPS → NPS Count Expression
Avg Age → Total Age → Age
```

Generated model output:
```sql
with total_nps as (
    -- dependency: Total NPS
    select count(distinct survey_respondent_id) as total_nps from source
),
final as (
    select
        case when total_nps.total_nps > 0 then ... end as nps_calculation
    from source
    left join total_nps on true
)
select * from final
```

### 6g. AI Refinement Layer (`claudeTranslate` / `needsClaude`)

The AI pass triggers on calcs that have any of these signals:

- Commented-out logic with an active fallback (suggests intent not captured by rules)
- Unresolved internal refs remaining after rule-based pass
- Complex multi-step date math (business days calculations)
- Self-division patterns (`x / x` count tricks → should be `NULLIFZERO` + literal `1`)
- LOD expressions (`FIXED`, `INCLUDE`, `EXCLUDE`)
- Heavy parameter dependency (more than 2 params in one formula)

AI calcs are **batched in groups of 8** to minimize API calls. Each batch sends:
- Original Tableau formula
- Rule-based attempt (if any)
- Complexity class and reasons for AI flagging

The AI returns:
- Refined Snowflake SQL
- A natural language description for `schema.yml`
- AE-facing recommendations (shown inline in the Results tab)

**API model:** `claude-sonnet-4-20250514`

---

## 7. Output Files

All outputs are bundled into a `.zip` download:

```
dbt_export/
├── models/
│   ├── nps_calculation.sql
│   ├── avg_age.sql
│   ├── gender_format.sql
│   └── ... (one file per translatable calc)
├── schema.yml
├── sources.yml
└── translation_report.md
```

### SQL Model Structure (`models/{slug}.sql`)

```sql
-- ============================================================
-- dbt model: nps_calculation
-- Migrated from Tableau calculated field: NPS Calculation
-- Complexity: moderate | ✨ AI-refined
-- Generated: 2026-03-12
-- ============================================================
-- REVIEW CHECKLIST:
--   [ ] Verify source table ref
--   [ ] Confirm field name mappings
--   [ ] Test against known values
--   [ ] Remove this header when approved
-- ============================================================
-- Original Tableau formula:
-- IIF([Total NPS] > 0, ([NPS Count Expression] / [Total NPS]) * 100, NULL)
-- ============================================================

{{ config(materialized='view') }}

with total_nps as (
    select count(distinct respondent_id) as total_nps from {{ ref('your_source_model') }}
),

final as (
    select
        IFF(total_nps.total_nps > 0,
            (nps_count_expression / total_nps.total_nps) * 100,
            NULL
        ) as nps_calculation
    from {{ ref('your_source_model') }}
    left join total_nps on true
)

select * from final
```

### schema.yml

Standard dbt schema file. Includes:
- Model name and description
- Column definitions derived from calc name + formula
- `not_null` tests auto-applied to measure fields

### sources.yml

Infers source tables from TWB datasource metadata and formula field references. Emits placeholder values:
- `TODO_DATABASE` — Snowflake database name
- `TODO_SCHEMA` — schema name
- `TODO_TABLE` — table name

Includes inline instructions for how to fill these in and integrate with dbt.

### translation_report.md

Human-readable summary including:
- Counts table (total, by complexity, untranslatable, skipped)
- Dependency chains found
- Parameter decisions required (list of all `/* 🔧 PARAM */` flags)
- Side-by-side original formula → SQL for every translated field
- Full list of untranslatable fields with explanation of why

---

## 8. Privacy Scan Feature

**Why we built it:** The TWB format embeds sensitive connection metadata (server URLs, database names, Tableau site paths) alongside the formula logic. Users uploading client workbooks need explicit assurance about what leaves their browser.

**How it works:** Between the `parsing` stage and the `preview` stage, the app shows a disclosure screen with three sections:

1. **Stays in browser** — lists every server URL, database name, Tableau site, and path found in the XML connection metadata. Tagged `BROWSER ONLY`. These are never transmitted.

2. **Flagged** — detects hardcoded strings in parameter defaults that look like org/client names (proper nouns with spaces and capitals). Tagged `NOT SENT`. Prompts user to review before sharing the workbook file externally.

3. **Sent to AI** — shows the count of formula expressions being sent, with a concrete example of what a formula looks like (`IIF([Survey Q8] > 8, 1, 0)`). Makes clear it's logic-only, no connection data.

**Implementation note:** The scan only parses what's already in the XML — no additional network requests. All sensitive metadata extraction happens in the browser via `DOMParser`.

---

## 9. UI / Design

### Theme

**Emerald / Teal dark** — applied globally across all stages.

| Token | Value |
|---|---|
| App background | `linear-gradient(160deg, #030f0a, #071a12, #071e2a)` |
| Primary accent | `#34d399` (emerald green) |
| Secondary accent | `#67e8f9` (cyan) |
| Tertiary accent | `#2dd4bf` (teal) |
| CTA gradient | `linear-gradient(135deg, #059669, #0891b2)` |
| Card background | `#0a1f15` |
| Card border | `#0d2b1e` |
| Muted text | `#4b5563` / `#6b7280` |
| Warning (flag) | `#fbbf24` |
| Error | `#f87171` |
| Code blocks | `#040d08` bg, `#67e8f9` text |

### Font

`'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace` — the tool is built for technical users. Monospace throughout feels appropriate and intentional.

### Complexity Badges

Dark translucent variants — no light backgrounds that would fight the dark theme:

| Type | Color |
|---|---|
| simple | `#34d399` on `#05966918` |
| moderate | `#67e8f9` on `#0891b218` |
| complex | `#fbbf24` on `#f59e0b18` |
| untranslatable | `#f87171` on `#f8717118` |
| skip | `#6b7280` on `#ffffff0a` |

---

## 10. Known Limitations & Deferred Items

### Technical Limitations

- **`.twbx` files** — currently treated as plain XML. In production, `.twbx` is a ZIP archive containing the `.twb` plus data extracts. Need JSZip to unpack it first. The app currently notes this but doesn't handle it correctly.
- **Multi-datasource workbooks** — the parser collects all calculated fields across all datasources. Fields that reference columns from a different datasource than their primary one may have incorrect source table inference in `sources.yml`.
- **LOD expressions** — AI pass handles these, but the Snowflake translation of `FIXED` LODs often requires subqueries or window functions. AI output should be reviewed carefully.
- **Table calculations** — `INDEX()`, `WINDOW_SUM()`, `RUNNING_SUM()`, `RANK()`, etc. are classified as `untranslatable` and excluded from output. These depend on Tableau's query context and have no direct SQL equivalent.
- **Parameters** — annotated with `/* 🔧 PARAM */` inline but not auto-resolved. Requires AE judgment call per parameter.

### Deferred Features

- [ ] Email capture gate before download (lead gen)
- [ ] Paid tier paywall ($49/mo or $99/workbook)
- [ ] Backend deployment (currently runs entirely in browser)
- [ ] JSZip for `.twbx` unpacking
- [ ] Additional SQL dialects: BigQuery, Redshift, DuckDB (v2)
- [ ] Power BI DAX → dbt exporter (v2 expansion — same concept, different parser)
- [ ] dbt `source()` macro substitution — currently emits `ref('your_source_model')` placeholders; after `sources.yml` is filled in, SQL models should use `source('datasource_name', 'table_name')` instead
- [ ] Tableau Server / Cloud API mode — instead of uploading a file, authenticate to Tableau Server and pull workbooks directly
- [ ] LinkedIn / dbt Slack launch post (#tools-and-extensions channel)

---

## 11. Current File Inventory

| File | Description |
|---|---|
| `tableau_dbt_exporter.jsx` | Complete React SPA — all logic, UI, and AI calls in one file |
| `tableau_to_dbt_export_v2.zip` | Python-generated test output from the real RetireeFirst workbook |
| `Client_Reporting_V2_10_-_for_LF_Logo.twb` | Test workbook (client data — handle carefully) |

---

## 12. Next Steps for Claude Code

Priority order for the production build:

1. **Scaffold the project** — Vite + React, move JSX component into `src/App.jsx`, extract engine functions into `src/lib/` modules
2. **Fix `.twbx` support** — add JSZip dependency, detect file type, unzip before parsing
3. **Wire real Anthropic API key** — currently the API call structure is correct but needs the key passed via environment variable, not hardcoded
4. **Add email gate** — simple modal before download, POST to a serverless function that stores email + workbook stats
5. **Deploy** — Vercel for frontend, or full-stack on Railway
6. **Add BigQuery dialect** — second most requested after Snowflake based on the AE community

### Key Implementation Note for AI API Calls

The current implementation in `tableau_dbt_exporter.jsx` calls the Anthropic API directly from the browser. In production this needs to be proxied through a backend to protect the API key. The fetch call structure is already correct — just swap the direct `api.anthropic.com` call for a call to your own `/api/translate` endpoint.

```javascript
// Current (browser direct — insecure for production)
const response = await fetch("https://api.anthropic.com/v1/messages", {
  headers: { "x-api-key": API_KEY, ... }
});

// Production (proxy through backend)
const response = await fetch("/api/translate", {
  method: "POST",
  body: JSON.stringify({ formulas: batch })
});
```

---

## 13. Market Context

- **dbt Cloud** has ~50,000+ users as of 2024. Analytics engineering as a job title grew 150% in 3 years.
- Most mid-market companies running Tableau also run dbt. The migration use case is a direct consequence of the dbt adoption curve hitting the "now what do we do with all our Tableau logic" phase.
- **Euno.ai's $6.25M seed** (2024) validates enterprise appetite for Tableau governance tooling. They're not competing on this point-tool use case — they're selling a platform.
- **The dbt Slack** `#tools-and-extensions` channel is the right launch channel. High AE density, tool-friendly culture, known to amplify niche-but-useful tools.
- **Upwork / Freelance angle** — this tool directly serves the "migrate Tableau to dbt" contract work that AEs pick up. Justin has existing Upwork credibility here.

---

*Document generated March 2026. Built in collaboration with Claude (Anthropic) during a single ideation + build session.*
