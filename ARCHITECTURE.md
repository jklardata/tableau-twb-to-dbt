# Tableau → dbt Calculated Field Exporter
## Project Architecture, Engine Design & Development Context

> **Purpose of this document:** Full handoff context for continuing development in Claude Code. Everything built, decided, and deferred — in one place. Kept up to date as features ship.

---

## 1. What We're Building

A web-based tool that parses Tableau workbook files (`.twb` / `.twbx`) and exports the calculated fields as a production-ready dbt semantic layer — staging models, consolidated mart models, MetricFlow metrics, schema tests, and source definitions — targeting Snowflake and BigQuery SQL dialects.

**The one-line pitch:** *"Turn your Tableau workbook's business logic into a documented, reusable dbt semantic layer."*

**Target persona:** Analytics engineers (AEs) and BI engineers migrating business logic out of Tableau and into a dbt project. Typically a small team (1–3 AEs) setting up dbt for the first time. This is the person who inherits a workbook with 100+ calculated fields and needs to reconstruct that logic in SQL — documented, version-controlled, and maintainable — not just for the one dashboard they're migrating, but as a reusable foundation for other reports.

---

## 2. Architecture

### Data Flow

```
User selects .twb or .twbx (single or multi-workbook mode)
        ↓
[BROWSER] .twbx? → JSZip extracts inner .twb XML
        ↓
[BROWSER] XML parsing (DOMParser) — parseTWB()
        ↓
[BROWSER] Privacy scan — scanTWB() (server URLs, flagged strings)
        ↓
[BROWSER] Classify + rule-based translate — classify(), ruleBasedTranslate()
          LOD expressions → translateLOD() generates CTE templates rule-based
        ↓
[BROWSER] Multi-workbook mode? → mergeWorkbooks() deduplicates + flags conflicts
        ↓
[BROWSER] Preview — models breakdown (STG/FCT/DIM tree), grain config
        ↓
[API /api/translate] AI refinement pass (Claude) — complex + flagged calcs, batched 8
        ↓
[BROWSER] Output file assembly — buildZip() via JSZip
        ↓
User downloads .zip
```

---

## 3. App Stages / UX Flow

| Stage | Trigger | What Happens |
|---|---|---|
| `upload` | Default | Dialect selector + drop zone + feature cards + multi-workbook toggle |
| `parsing` | File selected | .twbx unzip if needed, XML parse, classify, rule-based translate, LOD CTE generation |
| `scan` | Parse complete | Privacy disclosure screen |
| `conflicts` | Multi-workbook merge | Auto-merged count + conflict list, continue button |
| `preview` | User approves scan | Models breakdown (STG/FCT/DIM per datasource) + grain config + field list |
| `translating` | User clicks Run | AI pass on flagged calcs, live progress log |
| `results` | Translation done | 6-tab output (Report / SQL Models / schema.yml / metrics.yml / sources.yml / Conflicts) |

---

## 4. Core Engine Logic (`src/lib/engine.js`)

### 4a. Parsing (`parseTWB`)

Reads the TWB XML and extracts all `<column caption="...">` elements containing a `<calculation formula="...">` child. Deduplicates by `caption + formula[:100]`.

Builds the **internal ID map**: Tableau auto-generates IDs like `Calculation_1634806716618883078` for calculated fields referenced by other calcs. The parser maps these to human-readable captions so they can be resolved downstream.

### 4b. Complexity Classification (`classify`)

| Class | Criteria | Action |
|---|---|---|
| `skip` | Literals, booleans, parameter refs, bin definitions | Excluded from output |
| `simple` | Basic math, comparisons, aggregations | Rule-based only |
| `moderate` | Date functions, CASE/WHEN, IF/ELSEIF, IIF, COUNTD | Rule-based + optional AI |
| `complex` | LOD expressions (FIXED, INCLUDE, EXCLUDE) | Rule-based CTE + optional AI for inner expression |
| `untranslatable` | Table calcs: INDEX, WINDOW_*, RUNNING_*, RANK, SIZE, FIRST, LAST | Window function hints in report, no SQL generated |

### 4c. Rule-Based Translation (`ruleBasedTranslate`)

Dialect-aware regex substitutions. Accepts `dialect = "Snowflake" | "BigQuery"`.

| Tableau | Snowflake | BigQuery |
|---|---|---|
| `IIF(...)` | `IFF(...)` | `IF(...)` |
| `DATETRUNC('month', x)` | `DATE_TRUNC('month', x)` | `DATE_TRUNC(x, MONTH)` |
| `TODAY()` | `CURRENT_DATE` | `CURRENT_DATE()` |
| `NOW()` | `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP()` |
| `#2025-01-01#` | `'2025-01-01'::DATE` | `DATE('2025-01-01')` |
| `COUNTD(` | `COUNT(DISTINCT ` | `COUNT(DISTINCT ` |
| `LEN(` | `LENGTH(` | `LENGTH(` |
| `[Field Name]` | `field_name` (slugified) | `field_name` (slugified) |

### 4d. LOD Expression Translation (`parseLOD`, `translateLOD`)

LOD expressions are handled rule-based before the AI pass. `parseLOD()` extracts type, dimension list, and inner expression from the Tableau LOD syntax.

**FIXED LODs** → CTE template injected into the model's `WITH` clause:
```sql
-- FIXED LOD: aggregated at [customer_id] grain
lod_customer_id as (
    select
        customer_id,
        SUM(revenue) as lod_value
    from {{ ref('stg_your_source') }}
    group by 1
)
-- Column reference: lod_customer_id.lod_value
-- FIXED LOD: LEFT JOIN lod_customer_id ON t.customer_id = lod_customer_id.customer_id
```

**INCLUDE LODs** → inline note added to the column SQL with a GROUP BY instruction.

**EXCLUDE LODs** → CTE template with coarser grain; requires manual grain column specification.

LOD calcs with a rule-based CTE are not sent to Claude for the LOD itself — only if other signals (unresolved refs, long formula, etc.) also apply.

### 4e. AI Refinement Layer (`claudeTranslate` / `needsClaude`)

AI pass triggers on calcs with any of these signals:

- Commented-out logic with an active fallback
- Unresolved internal refs remaining after rule-based pass
- Complex multi-step formula (>300 chars)
- Self-division patterns (`x / x` count tricks)
- LOD expression where rule-based translation wasn't possible
- Heavy parameter dependency (>2 params in one formula)

Batched in groups of 8. Prompt includes: original formula, rule-based attempt, complexity class, and reasons. Claude returns: refined SQL, calc_type (aggregate | row_level), suggested_grain, dbt description, AE recommendations.

**API model:** `claude-sonnet-4-6`

### 4f. Aggregate Detection + Datasource Grouping (`isAggregate`, `groupByDatasource`)

After all translation passes, calcs are grouped by datasource and split into two buckets:
- **aggregates** — SQL contains `SUM(`, `COUNT(`, `AVG(`, `MIN(`, `MAX(`, etc.
- **rowLevel** — row-level expressions, safe without GROUP BY

Uses SQL-based detection (`isAggregate()`) rather than Tableau's `role` attribute, which is unreliable.

### 4g. Multi-Workbook Merge (`mergeWorkbooks`, `generateConflictReport`)

Groups calcs across multiple workbooks by `datasourceSlug::slug` key.

- **Exact formula match** → auto-merged, one canonical definition used, listed in `conflict_report.md` as confirmed matches
- **Different formula** → conflict flagged, first version used in output, all versions shown in conflict report
- **Untranslatables** → deduplicated separately

`generateConflictReport()` produces a markdown file included in the zip summarising auto-merged fields and detailing each conflict with all formula versions side by side.

---

## 5. Output Files

All outputs are bundled into a `.zip` download:

```
dbt_export/
├── models/
│   ├── staging/
│   │   └── stg_{datasource}.sql       ← clean typed view over raw source
│   └── marts/
│       ├── fct_{datasource}.sql       ← aggregate metrics, user-specified GROUP BY
│       └── dim_{datasource}.sql       ← row-level expressions, no aggregation
├── metrics.yml                        ← MetricFlow semantic layer (dbt >= 1.6)
├── schema.yml                         ← model docs + not_null tests
├── sources.yml                        ← source definitions (TODOs to fill in)
├── dbt_project.yml                    ← project scaffold
├── SETUP.md                           ← step-by-step wiring guide
├── translation_report.md              ← original formula → SQL, LOD CTEs, window hints
└── conflict_report.md                 ← multi-workbook merge summary (only in multi mode)
```

### Staging model (`stg_{slug}.sql`)

A clean `materialized='view'` over the raw source. Raw column names referenced in Tableau formulas are pre-populated as the column list. Source table reference uses `{{ source() }}` macro with `TODO_TABLE` placeholder.

### Fact model (`fct_{slug}.sql`)

`materialized='table'`. Contains only aggregate expressions (SUM/COUNT/AVG). GROUP BY uses grain columns specified by the user in the preview step. LOD CTEs are injected into the `WITH` clause. Grain placeholder is dialect-specific.

### Dimension model (`dim_{slug}.sql`)

`materialized='view'`. Contains only row-level expressions. No GROUP BY. Safe to join to any grain.

### metrics.yml

MetricFlow semantic layer starter template. Simple aggregations (SUM/COUNT/AVG of a single column) are generated as proper `semantic_model` measures with correct `agg:` type. Derived expressions (e.g. `SUM(a) / COUNT(b)`) are generated as `type: derived` metrics with a TODO decomposition note.

Requires: fill in `TODO_primary_entity` and `TODO_ID_COLUMN`, then run `dbt sl validate`.

---

## 6. Preview Stage — Models Breakdown

Before running the AI pass, the preview stage shows a full models breakdown:

```
MODELS TO BE GENERATED

STG  stg_orders.sql          12 fields
  └  FCT  fct_orders.sql     8 aggregates    GROUP BY date_day, customer_id
  └  DIM  dim_orders.sql     4 row-level     2 LOD CTEs

STG  stg_customers.sql       6 fields
  └  DIM  dim_customers.sql  6 row-level
```

- FCT rows show grain badge (green if set, amber warning if not configured)
- DIM rows show LOD CTE count if any
- Summary footer: total datasources, total models, LOD CTEs to wire up, table calcs needing manual rewrite

This gives the AE a structural preview of the output before committing to the full translation run.

---

## 7. Privacy Scan Feature

Between the `parsing` stage and `preview`, the app shows a disclosure screen:

1. **Stays in browser** — server URLs, database names, Tableau site paths. Tagged `BROWSER ONLY`. Never transmitted.
2. **Flagged** — hardcoded strings in parameter defaults that look like org/client names. Tagged `NOT SENT`.
3. **Sent to AI** — count of formula expressions being sent. Makes clear it's logic-only, no connection data.

All sensitive metadata extraction happens in the browser via `DOMParser`. No additional network requests.

---

## 8. Analytics (PostHog)

PostHog initialized in `main.jsx`. Events captured:

| Event | Key Properties |
|---|---|
| `workbook_uploaded` | dialect, field_count, translatable_count, claude_count, has_lod |
| `translation_completed` | dialect, field_count, claude_count, multi_workbook, conflict_count, paid |
| `download_triggered` | field_count, paid, multi_workbook, trigger |
| `paywall_hit` | trigger (field_limit \| multi_workbook) |
| `checkout_started` | trigger |
| `merge_completed` | workbook_count, conflict_count, auto_merged_count |
| `email_captured` | source |

---

## 9. UI / Design

**Emerald / Teal dark theme** — monospace throughout.

| Token | Value |
|---|---|
| App background | `linear-gradient(160deg, #030f0a, #071a12, #071e2a)` |
| Primary accent | `#34d399` (emerald) |
| Secondary accent | `#67e8f9` (cyan) |
| CTA gradient | `linear-gradient(135deg, #059669, #0891b2)` |
| Card background | `#0a1f15` / border `#0d2b1e` |

Font: `'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace`

---

## 10. Known Limitations

### Technical Limitations

- **Multi-datasource workbooks** — calcs across all datasources are collected and grouped by their declared datasource. Fields that reference columns from a different datasource than their own may produce incorrect `{{ source() }}` references in the staging model. Requires manual review.
- **LOD inner expressions** — CTE templates are generated rule-based, but the `stg_TODO` source reference and join key in the CTE must be manually updated to the actual staging model and primary key. The inner expression SQL is correct for simple cases; review complex nested LODs.
- **LOD INCLUDE** — adds a note to add the specified dimension to the GROUP BY, but cannot automatically determine whether this is correct for the user's grain. Requires AE judgment.
- **Table calculations** — `INDEX()`, `WINDOW_SUM()`, `RUNNING_SUM()`, `RANK()`, etc. are classified as `untranslatable`. Window function rewrite hints (with SQL templates) are provided in the translation report, but the PARTITION BY / ORDER BY columns must be determined by the AE.
- **Parameters** — annotated with `/* 🔧 PARAM */` inline but not auto-resolved. Requires AE judgment per parameter: hardcode, dbt var, or seed.
- **BigQuery dialect coverage** — DATE_TRUNC arg order, IF(), DATE() casts, and CURRENT_DATE() are handled rule-based. Complex BigQuery-specific functions (SAFE_DIVIDE, FORMAT_DATE, TIMESTAMP_DIFF, COUNTIF) are covered by the AI pass but not by the rule-based layer.
- **MetricFlow entity setup** — metrics.yml outputs `TODO_primary_entity` and `TODO_ID_COLUMN` as placeholders. Primary key auto-detection from workbook XML is not implemented. Must be filled in manually before `dbt sl validate` passes.
- **Grain config is manual** — grain columns for `fct_` models are entered by the user in the preview step. The AI suggests a grain per aggregate field, but the final GROUP BY is user-controlled.

### Deferred Features

- [ ] Redshift and DuckDB dialects
- [ ] Primary key / entity auto-detection from workbook XML join relationships
- [ ] LOD INCLUDE automatic grain expansion
- [ ] `dbt source()` macro substitution — currently staging models use `source('slug', 'TODO_TABLE')`, which is correct; sources.yml must be filled in first
- [ ] Tableau Server / Cloud API mode — pull workbooks directly instead of uploading a file
- [ ] Power BI DAX → dbt exporter (same concept, different parser)

---

## 11. Current File Inventory

| File | Description |
|---|---|
| `src/App.jsx` | Main React SPA — all UI stages, state management, file handling |
| `src/lib/engine.js` | Core engine — parsing, classification, translation, LOD handling, multi-workbook merge, output generation |
| `src/lib/zip.js` | Output assembly — calls engine generators, bundles into JSZip |
| `src/components/Badge.jsx` | Complexity badge component |
| `src/components/ProgressBar.jsx` | Translation progress bar |
| `src/components/EmailGateModal.jsx` | Email capture modal (free tier gate) |
| `src/components/PaywallBanner.jsx` | Paid tier paywall banner |
| `api/translate.js` | Vercel function — Anthropic API proxy |
| `api/create-checkout.js` | Vercel function — Stripe Checkout session ($19) |
| `api/verify-session.js` | Vercel function — Stripe payment verification on redirect |
| `api/capture-email.js` | Vercel function — Supabase insert + Resend audience add |
| `vercel.json` | SPA rewrites + API routing |
| `.env.example` | Required env vars |

---

## 12. Next Development Priorities

1. **Redshift dialect** — similar to Snowflake with DATEDIFF/DATEADD differences; lower effort than BigQuery was
2. **Primary key detection** — parse join relationships from the workbook XML to pre-populate MetricFlow entity fields
3. **LOD INCLUDE auto-grain** — detect current grain from the fct_ model and suggest whether the INCLUDE dimension needs to be added
4. **Tableau Server API mode** — authenticate to Tableau Server/Cloud and pull workbooks without file upload; major UX improvement for enterprise users
5. **Power BI DAX → dbt** — same architecture, different parser; significant market expansion

---

*Last updated March 2026. Built with Claude Code (Anthropic).*
