# TableautoDbt — Architecture & Engine Design

> **Purpose of this document:** Full handoff context for continuing development in Claude Code. Everything built, decided, and deferred — in one place. Kept up to date as features ship.

---

## 1. What We're Building

A suite of free, browser-based tools for Tableau users and analytics engineers:

| Tool | Path | Description |
|---|---|---|
| Convert | `/` | Parse a `.twb` and export a production-ready dbt semantic layer |
| Docs | `/docs` | Auto-generate structured documentation from any workbook |
| Audit | `/audit` | Health score + issue detection across all calculated fields |
| Diff | `/diff` | Side-by-side comparison of two workbook versions |
| Insights | `/insights` | Cross-workbook portfolio analysis — duplicates + migration effort |
| Methodology | `/methodology` | Reference docs for audit rules and scoring formulas |

**The one-line pitch:** *"Everything you need to understand, audit, and migrate your Tableau workbooks — in your browser, free."*

**Target persona:** Analytics engineers (AEs) and BI engineers migrating business logic out of Tableau and into a dbt project. Typically a small team (1–3 AEs) setting up dbt for the first time, inheriting a workbook with 100+ calculated fields.

All tools run 100% in the browser. No files are uploaded to a server. The only outbound network call is the AI translation pass (`/api/translate`), which sends formula expressions only — no connection metadata, no server URLs.

---

## 2. Architecture Overview

### Convert Tool Data Flow

```
User selects .twb (single or multi-workbook mode)
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

### Docs / Audit / Diff Data Flow

```
User selects .twb
        ↓
[BROWSER] XML parsing (DOMParser) — same parseTWB() used by Convert
        ↓
[BROWSER] Tool-specific processing:
  /docs   → structured metadata extraction → tabbed browser UI + export
  /audit  → auditWorkbook() → health score + issue list + complexity scores
  /diff   → diffWorkbooks() → added/removed/modified per category
        ↓
User browses, copies, or downloads results — no server involved
```

---

## 3. Convert Tool — App Stages

| Stage | Trigger | What Happens |
|---|---|---|
| `upload` | Default | Dialect selector + drop zone + feature cards + multi-workbook toggle |
| `parsing` | File selected | XML parse, classify, rule-based translate, LOD CTE generation |
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

### 4f. Aggregate Detection + Datasource Grouping

After all translation passes, calcs are grouped by datasource and split into two buckets:
- **aggregates** — SQL contains `SUM(`, `COUNT(`, `AVG(`, `MIN(`, `MAX(`, etc.
- **rowLevel** — row-level expressions, safe without GROUP BY

Uses SQL-based detection (`isAggregate()`) rather than Tableau's `role` attribute, which is unreliable.

### 4g. Multi-Workbook Merge (`mergeWorkbooks`, `generateConflictReport`)

Groups calcs across multiple workbooks by `datasourceSlug::slug` key.

- **Exact formula match** → auto-merged, one canonical definition used
- **Different formula** → conflict flagged, first version used in output, all versions shown in conflict report
- **Untranslatables** → deduplicated separately

---

## 5. Audit Engine (`src/lib/auditEngine.js`)

### Health Score

```
score = 100 − (errors × 10) − (warnings × 3) − (info × 1)
clamped to 0–100
```

### Audit Rules

| Rule | Severity | Description |
|---|---|---|
| Circular dependency | Error | Field A depends on field B which depends on field A |
| Division without null protection | Error | Raw division without `ZN()` or `NULLIF()` guard |
| Nested LOD expressions | Error | LOD inside another LOD — Tableau often rejects these |
| Unused calculated fields | Warning | Field defined but not referenced in any sheet or other field |
| Deep nesting | Warning | More than 3 levels of nested IF/CASE |
| Excessive nesting | Warning | More than 5 levels |
| Non-additive window function | Warning | `RUNNING_SUM`, `RANK`, etc. cannot be aggregated further |
| Long IF chain | Info | More than 5 ELSEIF branches |
| High overall complexity | Info | Field complexity score above 75 |
| Hardcoded DATETRUNC | Info | Date truncation with a literal string instead of a parameter |

### Per-Field Complexity Scoring

Each calculated field is scored 0–100 based on:
- Formula length
- Number of nested functions
- Presence of LOD expressions
- Use of table calculations
- Number of dependencies
- IF chain depth

| Tier | Score | Description |
|---|---|---|
| Simple | 0–25 | Basic math, comparisons, single aggregations |
| Moderate | 26–50 | Date functions, CASE/WHEN, IF/ELSEIF, COUNTD |
| Complex | 51–75 | LOD expressions, nested conditions, multi-step logic |
| Critical | 76–100 | Deeply nested LODs, circular patterns, untranslatable table calcs |

---

## 6. Cross-Workbook Analysis (`src/lib/multiWorkbookAnalysis.js`)

### Duplicate Detection (`detectDuplicates`)

Groups fields by normalized caption across all uploaded workbooks.

- **Identical** — same caption, same formula across 2+ workbooks → safe to deduplicate
- **Diverged** — same caption, different formulas → potential conflict, needs review

Sorted with diverged fields first (bigger problem), then by workbook spread.

### Migration Effort Estimation (`estimateEffort`)

Buckets fields by complexity tier and applies hour ranges:

| Tier | Hours per field |
|---|---|
| Low (simple) | 0.25–0.5h |
| Medium (moderate) | 1–2h |
| High (complex/critical) | 4–8h |

Outputs per-workbook breakdown and portfolio totals.

### Portfolio Summary (`summarizePortfolio`)

Aggregates across all workbooks: total fields, total datasources, unique fields, duplicate groups, total estimated hours.

---

## 7. Docs Export (`src/lib/markdownExport.js`)

Generates structured export formats from parsed workbook metadata:

| Format | Description |
|---|---|
| JSON | Full metadata as structured JSON |
| Markdown | Human-readable doc with sections per category |
| Copy for AI | Prompt-optimized format with workbook context header (Claude/ChatGPT) |
| Copy for Notion | Markdown compatible with Notion paste |
| Download Confluence | Confluence-compatible storage format |

---

## 8. Output Files (Convert Tool)

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

---

## 9. Privacy Scan

Between the `parsing` stage and `preview`, the app shows a disclosure screen:

1. **Stays in browser** — server URLs, database names, Tableau site paths. Tagged `BROWSER ONLY`. Never transmitted.
2. **Flagged** — hardcoded strings in parameter defaults that look like org/client names. Tagged `NOT SENT`.
3. **Sent to AI** — count of formula expressions being sent. Makes clear it's logic-only, no connection data.

All sensitive metadata extraction happens in the browser via `DOMParser`. No additional network requests.

---

## 10. Analytics (PostHog)

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

## 11. UI / Design

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

## 12. SEO

Each tool has a dedicated SEO landing page in `public/` with full title tags, meta descriptions, Open Graph, Twitter cards, and JSON-LD `SoftwareApplication` structured data.

| Landing page | Target keywords |
|---|---|
| `/landing-convert` | tableau to dbt converter, tableau calculated fields to dbt models |
| `/landing-docs` | tableau workbook documentation generator, read twb file without tableau |
| `/landing-audit` | tableau workbook audit tool, tableau workbook health check |
| `/landing-diff` | tableau workbook diff tool, compare tableau workbooks |

Sitemap: `/sitemap.xml` — covers all landing pages, tool pages, and utility pages.

---

## 13. File Inventory

| File | Description |
|---|---|
| `src/App.jsx` | Convert tool — all UI stages, state management, file handling |
| `src/lib/engine.js` | Core engine — parsing, classification, translation, LOD handling, multi-workbook merge, output generation |
| `src/lib/zip.js` | Output assembly — calls engine generators, bundles into JSZip |
| `src/lib/auditEngine.js` | Audit rules engine — health scoring, complexity scoring, issue detection |
| `src/lib/multiWorkbookAnalysis.js` | Cross-workbook duplicate detection, effort estimation, portfolio summary |
| `src/lib/markdownExport.js` | AI prompt generator, Markdown/Notion/Confluence exporters |
| `src/pages/DocsPage.jsx` | /docs — tabbed workbook documentation browser |
| `src/pages/AuditPage.jsx` | /audit — health check, issue list, complexity breakdown |
| `src/pages/DiffPage.jsx` | /diff — side-by-side workbook diff |
| `src/pages/InsightsPage.jsx` | /insights — cross-workbook portfolio analysis |
| `src/pages/MethodologyPage.jsx` | /methodology — audit rules and scoring reference |
| `src/components/Badge.jsx` | Complexity badge component |
| `src/components/ProgressBar.jsx` | Translation progress bar |
| `src/components/EmailGateModal.jsx` | Email capture modal (free tier gate) |
| `src/components/PaywallBanner.jsx` | Paid tier paywall banner |
| `api/translate.js` | Vercel function — Anthropic API proxy |
| `api/create-checkout.js` | Vercel function — Stripe Checkout session |
| `api/verify-session.js` | Vercel function — Stripe payment verification on redirect |
| `api/capture-email.js` | Vercel function — Supabase insert + Resend audience add |
| `public/landing-convert.html` | SEO landing page for /convert |
| `public/landing-docs.html` | SEO landing page for /docs |
| `public/landing-audit.html` | SEO landing page for /audit |
| `public/landing-diff.html` | SEO landing page for /diff |
| `public/sitemap.xml` | XML sitemap covering all pages |
| `public/robots.txt` | Robots directives |
| `vercel.json` | SPA rewrites + API routing |

---

## 14. Known Limitations

- **Multi-datasource workbooks** — calcs across all datasources are collected and grouped by their declared datasource. Fields that reference columns from a different datasource than their own may produce incorrect `{{ source() }}` references. Requires manual review.
- **LOD inner expressions** — CTE templates are generated rule-based, but the `stg_TODO` source reference and join key must be manually updated. Review complex nested LODs.
- **LOD INCLUDE** — adds a note to add the specified dimension to the GROUP BY, but cannot automatically determine whether this is correct for the user's grain.
- **Table calculations** — `INDEX()`, `WINDOW_SUM()`, `RUNNING_SUM()`, `RANK()`, etc. are classified as `untranslatable`. Window function rewrite hints are provided but PARTITION BY / ORDER BY columns must be determined by the AE.
- **Parameters** — annotated with `/* 🔧 PARAM */` inline but not auto-resolved. Requires AE judgment per parameter: hardcode, dbt var, or seed.
- **BigQuery dialect** — DATE_TRUNC arg order, IF(), DATE() casts, and CURRENT_DATE() are handled rule-based. Complex BigQuery-specific functions are covered by the AI pass but not rule-based.
- **MetricFlow entity setup** — metrics.yml outputs `TODO_primary_entity` and `TODO_ID_COLUMN` as placeholders. Primary key auto-detection not implemented.
- **Grain config is manual** — grain columns for `fct_` models are entered by the user in the preview step.

---

## 15. Deferred Features

- [ ] Redshift and DuckDB dialects
- [ ] Primary key / entity auto-detection from workbook XML join relationships
- [ ] LOD INCLUDE automatic grain expansion
- [ ] Tableau Server / Cloud API mode — pull workbooks directly instead of file upload
- [ ] Power BI DAX → dbt exporter
- [ ] Desktop app (Electron or Tauri) for air-gapped / security-sensitive environments

---

*Last updated March 2026. Built with Claude Code (Anthropic).*
