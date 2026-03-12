// ================================================================
// UTILITIES
// ================================================================

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
}

export function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, "text/xml");
}

// Returns true if the SQL expression contains an aggregate function
export function isAggregate(sql = "") {
  return /\b(SUM|COUNT|AVG|MIN|MAX|MEDIAN|LISTAGG|ARRAY_AGG|STDDEV|VARIANCE|APPROX_COUNT_DISTINCT)\s*\(/i.test(sql);
}

// Tries to extract a simple aggregation like SUM(col) or COUNT(DISTINCT col)
// Returns { fn, col } or null for complex derived expressions
function extractSimpleAgg(sql = "") {
  const s = sql.trim();
  const m = s.match(/^(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*(?:DISTINCT\s+)?([a-z0-9_]+)\s*\)$/i);
  if (m) return { fn: m[1].toUpperCase(), col: m[2] };
  if (/^COUNT\s*\(\s*\*\s*\)$/i.test(s)) return { fn: "COUNT", col: "*" };
  return null;
}

// ================================================================
// PRIVACY SCAN
// ================================================================

export function scanTWB(xmlString) {
  const doc = parseXML(xmlString);
  const findings = { staysInBrowser: [], sentToAI: [], flagged: [] };

  doc.querySelectorAll("connection").forEach((conn) => {
    const server = conn.getAttribute("server");
    const db = conn.getAttribute("dbname");
    if (server && server !== "localhost") {
      findings.staysInBrowser.push({ type: "Server URL", value: server, icon: "🌐" });
    }
    if (db) {
      findings.staysInBrowser.push({ type: "Database name", value: db, icon: "🗄" });
    }
  });

  const repoLoc = doc.querySelector("repository-location");
  if (repoLoc) {
    const site = repoLoc.getAttribute("site");
    const path = repoLoc.getAttribute("path");
    if (site) findings.staysInBrowser.push({ type: "Tableau site", value: site, icon: "🏢" });
    if (path) findings.staysInBrowser.push({ type: "Server path", value: path, icon: "📂" });
  }

  const sbSeen = new Set();
  findings.staysInBrowser = findings.staysInBrowser.filter((f) => {
    const k = f.type + f.value;
    if (sbSeen.has(k)) return false;
    sbSeen.add(k);
    return true;
  });

  const paramLiterals = [];
  doc.querySelectorAll("datasource[name='Parameters'] column").forEach((col) => {
    const calc = col.querySelector("calculation");
    if (!calc) return;
    const formula = calc.getAttribute("formula") || "";
    const caption = col.getAttribute("caption") || "";
    const strMatch = formula.match(/^["'](.+)["']$/);
    if (strMatch) {
      const val = strMatch[1];
      if (val.length > 8 && /[A-Z]/.test(val) && /\s/.test(val) && val !== "Client Report" && val !== "Labor First" && val !== "Retiree First") {
        paramLiterals.push({ caption, value: val });
      }
    }
  });

  if (paramLiterals.length > 0) {
    findings.flagged = paramLiterals.map((p) => ({
      type: "Hardcoded parameter value",
      caption: p.caption,
      value: p.value.length > 60 ? p.value.slice(0, 57) + "..." : p.value,
      icon: "⚠️",
      note: "Looks like a client/org name in a parameter default — NOT sent to AI",
    }));
  }

  const seen = new Set();
  let translatableCount = 0;
  let totalUnique = 0;

  doc.querySelectorAll("column[caption]").forEach((col) => {
    const calc = col.querySelector("calculation");
    if (!calc) return;
    const caption = col.getAttribute("caption") || "";
    const formula = calc.getAttribute("formula") || "";
    const key = `${caption}||${formula.slice(0, 100)}`;
    if (seen.has(key)) return;
    seen.add(key);
    totalUnique++;
    const cls = calc.getAttribute("class") || "tableau";
    const complexity = classify(formula, cls);
    if (!["skip", "untranslatable"].includes(complexity)) translatableCount++;
  });

  findings.sentToAI = [
    {
      type: "Calculated field formulas",
      count: translatableCount,
      note: "Business logic expressions only — no connection data, no server paths, no raw data values",
      icon: "✨",
      safe: true,
    },
  ];

  findings.totalUnique = totalUnique;
  findings.translatableCount = translatableCount;

  return findings;
}

// ================================================================
// PHASE 1: PARSE
// ================================================================

export function parseTWB(xmlString) {
  const doc = parseXML(xmlString);

  const internalIdMap = {};
  doc.querySelectorAll("column[caption]").forEach((col) => {
    const name = (col.getAttribute("name") || "").replace(/^\[|\]$/g, "");
    const caption = col.getAttribute("caption") || "";
    if (name.startsWith("Calculation_")) internalIdMap[name] = caption;
  });

  const seen = new Set();
  const calcs = [];

  // Iterate by datasource so we can track which source each calc belongs to
  doc.querySelectorAll("datasource").forEach((ds) => {
    const dsName = ds.getAttribute("name") || "";
    const dsCaption = ds.getAttribute("caption") || dsName;
    if (dsName === "Parameters") return;
    const dsSlug = slugify(dsCaption || dsName);

    ds.querySelectorAll("column[caption]").forEach((col) => {
      const calcEl = col.querySelector("calculation");
      if (!calcEl) return;
      const caption = col.getAttribute("caption") || "";
      const formula = calcEl.getAttribute("formula") || "";
      const key = `${caption}||${formula.slice(0, 100)}`;
      if (seen.has(key)) return;
      seen.add(key);

      calcs.push({
        caption,
        internalName: (col.getAttribute("name") || "").replace(/^\[|\]$/g, ""),
        formula,
        datatype: col.getAttribute("datatype") || "string",
        role: col.getAttribute("role") || "measure",
        calcClass: calcEl.getAttribute("class") || "tableau",
        slug: slugify(caption),
        datasourceSlug: dsSlug,
        datasourceCaption: dsCaption,
      });
    });
  });

  return { calcs, internalIdMap };
}

// ================================================================
// PHASE 2: CLASSIFY
// ================================================================

export function classify(formula, calcClass) {
  if (calcClass === "bin") return "skip";
  const f = formula.toUpperCase().trim();
  if (!formula.trim()) return "skip";
  if (/^["'].*["']$/.test(formula.trim())) return "skip";
  if (/^#\d{4}-\d{2}-\d{2}#$/.test(formula.trim())) return "skip";
  if (/^(true|false|\d+\.?\d*)$/i.test(formula.trim())) return "skip";
  if (/^\[Parameters\]\./.test(formula.trim())) return "skip";
  if (["INDEX()", "SIZE()", "FIRST()", "LAST()", "WINDOW_", "RUNNING_", "RANK(", "RANK_"].some((fn) => f.includes(fn)))
    return "untranslatable";
  if (["{FIXED", "{INCLUDE", "{EXCLUDE"].some((fn) => f.includes(fn))) return "complex";
  if (["DATETRUNC", "DATEDIFF", "DATEADD", "DATEPART", "CASE ", "IIF(", "ISNULL", "COUNTD(", "IF "].some((fn) => f.includes(fn)))
    return "moderate";
  return "simple";
}

// ================================================================
// PHASE 3: RULE-BASED TRANSLATION
// ================================================================

export function resolveInternalRefs(formula, idMap) {
  return formula.replace(/\[?(Calculation_\d+)\]?/g, (_, id) =>
    id in idMap ? slugify(idMap[id]) : `/* unresolved: ${id} */`
  );
}

export function annotateParams(formula) {
  return formula.replace(/\[Parameters\]\.\[([^\]]+)\]/g, (_, name) => {
    const friendly = name.replace(/_copy_\d+/g, "").replace(/\(copy\)_\d+/g, "").trim();
    return `/* 🔧 PARAM:${slugify(friendly)} */`;
  });
}

export function ruleBasedTranslate(formula, idMap, dialect = "Snowflake") {
  let sql = formula;
  sql = sql.replace(/\/\/[^\n\r]*/g, "");
  sql = sql.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  sql = resolveInternalRefs(sql, idMap);
  sql = annotateParams(sql);
  sql = sql.replace(/\[([^\]]+)\]/g, (_, f) => slugify(f));
  sql = sql.replace(/\bCOUNTD\(/gi, "COUNT(DISTINCT ");
  sql = sql.replace(/\bLEN\(/gi, "LENGTH(");
  sql = sql.replace(/\bISNULL\(([^)]+)\)/gi, "($1 IS NULL)");
  sql = sql.replace(/"([^"]*)"/g, "'$1'");

  if (dialect === "BigQuery") {
    sql = sql.replace(/\bTODAY\(\)/gi, "CURRENT_DATE()");
    sql = sql.replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP()");
    sql = sql.replace(/#(\d{4}-\d{2}-\d{2})#/g, "DATE('$1')");
    sql = sql.replace(/\bIIF\(/gi, "IF(");
    // DATE_TRUNC: Tableau DATETRUNC('month', field) → BigQuery DATE_TRUNC(field, MONTH)
    sql = sql.replace(/\bDATETRUNC\b/gi, "DATE_TRUNC");
    sql = sql.replace(/DATE_TRUNC\s*\(\s*'([^']+)'\s*,\s*([^)]+?)\s*\)/gi, (_, unit, col) =>
      `DATE_TRUNC(${col.trim()}, ${unit.toUpperCase()})`
    );
  } else {
    // Snowflake (default)
    sql = sql.replace(/\bTODAY\(\)/gi, "CURRENT_DATE");
    sql = sql.replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP");
    sql = sql.replace(/#(\d{4}-\d{2}-\d{2})#/g, "'$1'::DATE");
    sql = sql.replace(/\bIIF\(/gi, "IFF(");
    sql = sql.replace(/\bDATETRUNC\b/gi, "DATE_TRUNC");
  }

  sql = sql.replace(/\n\s*\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  return sql;
}

export function findDependencies(formula, idMap) {
  const deps = [];
  const matches = formula.matchAll(/Calculation_\d+/g);
  for (const m of matches) {
    if (idMap[m[0]]) {
      const depSlug = slugify(idMap[m[0]]);
      if (!deps.includes(depSlug)) deps.push(depSlug);
    }
  }
  return deps;
}

// ================================================================
// LOD EXPRESSION PARSER & TRANSLATOR
// ================================================================

export function parseLOD(formula) {
  const match = formula.match(
    /\{\s*(FIXED|INCLUDE|EXCLUDE)\s*((?:\[[^\]]*\](?:\s*,\s*)?)*)\s*:\s*([\s\S]+?)\s*\}/i
  );
  if (!match) return null;
  const type = match[1].toUpperCase();
  const dimsPart = match[2].trim();
  const exprPart = match[3].trim();
  const dims = dimsPart
    ? dimsPart.split(",").map((d) => d.trim().replace(/^\[|\]$/g, "")).filter(Boolean)
    : [];
  return { type, dims, exprPart };
}

export function translateLOD(formula, idMap = {}, dialect = "Snowflake") {
  const lod = parseLOD(formula);
  if (!lod) return null;

  const { type, dims, exprPart } = lod;
  const dimsSlug = dims.map((d) => slugify(resolveInternalRefs(d, idMap)));
  const innerSql = ruleBasedTranslate(exprPart, idMap, dialect);

  if (type === "FIXED") {
    if (dimsSlug.length === 0) {
      // Table-scoped FIXED — simple scalar aggregate, no CTE needed
      return {
        sql: innerSql,
        cteTemplate: null,
        note: "Table-scoped FIXED LOD (no dimensions) — scalar aggregate over entire table",
      };
    }
    const cteName = `lod_${dimsSlug.join("_")}`;
    const dimList = dimsSlug.join(", ");
    const groupByNums = dimsSlug.map((_, i) => i + 1).join(", ");
    const cteLines = [
      `-- FIXED LOD: aggregated at [${dims.join(", ")}] grain`,
      `${cteName} as (`,
      `    select`,
      `        ${dimList},`,
      `        ${innerSql} as lod_value`,
      `    from {{ ref('stg_TODO') }}`,
      `    group by ${groupByNums}`,
      `)`,
    ].join("\n");
    return {
      sql: `${cteName}.lod_value  -- FIXED LOD: LEFT JOIN ${cteName} ON t.${dimsSlug[0]} = ${cteName}.${dimsSlug[0]}`,
      cteTemplate: cteLines,
      note: `FIXED LOD aggregated at [${dims.join(", ")}] grain`,
    };
  }

  if (type === "INCLUDE") {
    const dimList = dimsSlug.join(", ");
    return {
      sql: `${innerSql}  -- INCLUDE LOD: add ${dimList} to GROUP BY`,
      cteTemplate: null,
      note: `INCLUDE LOD — add [${dims.join(", ")}] to fct_ GROUP BY`,
    };
  }

  if (type === "EXCLUDE") {
    const cteName = `lod_excl_${dimsSlug.join("_") || "coarse"}`;
    const cteLines = [
      `-- EXCLUDE LOD: aggregate WITHOUT [${dims.join(", ")}]`,
      `${cteName} as (`,
      `    select`,
      `        /* TODO: remaining grain columns */,`,
      `        ${innerSql} as lod_value`,
      `    from {{ ref('stg_TODO') }}`,
      `    group by 1  -- exclude [${dims.join(", ")}] from grain`,
      `)`,
    ].join("\n");
    return {
      sql: `${cteName}.lod_value  -- EXCLUDE LOD: coarser grain, wire CTE + join`,
      cteTemplate: cteLines,
      note: `EXCLUDE LOD — aggregates without [${dims.join(", ")}]. Wire ${cteName} CTE.`,
    };
  }

  return null;
}

// ================================================================
// PHASE 4: NEEDS CLAUDE?
// ================================================================

export function needsClaude(calc, ruleSql) {
  const reasons = [];
  if (/\/\//.test(calc.formula)) reasons.push("Has commented-out logic");
  if (/unresolved:/.test(ruleSql)) reasons.push("Unresolved internal refs");
  if (calc.formula.length > 300) reasons.push("Complex multi-step formula");
  if (/queue_duration\s*\/\s*queue_duration/i.test(ruleSql)) reasons.push("Self-division pattern (count trick)");
  if (calc.complexity === "complex" && !calc.lodNote) reasons.push("LOD expression — needs manual CTE wiring");
  if ((ruleSql.match(/🔧 PARAM/g) || []).length > 2) reasons.push("Heavy parameter dependency");
  return { needs: reasons.length > 0, reasons };
}

// ================================================================
// PHASE 5: CLAUDE API TRANSLATION (via proxy)
// ================================================================

export async function claudeTranslate(calcsForClaude, dialect = "Snowflake") {
  const formatted = calcsForClaude
    .map(
      (c, i) =>
        `CALC_${i}:
Name: ${c.caption}
Original Tableau formula:
${c.formula}
Rule-based attempt:
${c.ruleSql}
Complexity: ${c.complexity}
Needs-Claude reasons: ${c.claudeReasons.join(", ")}`
    )
    .join("\n\n---\n\n");

  const prompt = `You are a senior analytics engineer converting Tableau calculated fields to ${dialect} SQL for use in dbt models.

For each CALC below you are given:
1. The original Tableau formula
2. A rule-based translation attempt (may have issues)
3. Reasons why this calc needs human-level interpretation

Return a JSON array. Each object:
- calc_index: integer
- calc_type: "aggregate" | "row_level"
  - "aggregate" = expression contains SUM/COUNT/AVG/MIN/MAX or similar — must be in a GROUP BY model
  - "row_level" = expression operates on individual rows — safe in a non-aggregated model
- suggested_grain: for aggregates, the natural grain this metric implies (e.g. "per order_id", "per customer per month") — null for row_level
- sql_expression: refined ${dialect} SQL expression (expression only, no SELECT/FROM)
  - Fix any issues in the rule-based attempt
  - Replace self-division tricks (x/x) with literal 1
  - Correct weekday numbering differences between Tableau and ${dialect}
  - Resolve commented-out logic by inferring intent from context
  - Keep 🔧 PARAM placeholders as-is
  - Use clean, readable SQL
- dbt_description: one clear sentence describing what this metric/dimension does
- ae_recommendations: array of 1-3 specific actionable suggestions for the analytics engineer
- confidence: "high" | "medium" | "low"
- what_changed: brief explanation of what you improved over the rule-based attempt

Respond ONLY with a valid JSON array. No markdown fences. No preamble.

CALCULATED FIELDS:
${formatted}`;

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Translate API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.results;
}

// ================================================================
// PHASE 6: OUTPUT GENERATION — consolidated semantic layer structure
// ================================================================

// Group translatable calcs by datasource.
// Splits into aggregates (SUM/COUNT/etc — need GROUP BY) and rowLevel (safe without GROUP BY).
// NOTE: We use SQL-based detection rather than Tableau's role attribute,
// which is unreliable and often wrong.
export function groupByDatasource(calcs) {
  const map = {};
  calcs
    .filter((c) => !["skip", "untranslatable"].includes(c.complexity) && c.finalSql)
    .forEach((c) => {
      const key = c.datasourceSlug || "unknown";
      if (!map[key]) {
        map[key] = {
          slug: key,
          caption: c.datasourceCaption || key,
          aggregates: [],
          rowLevel: [],
        };
      }
      // Use calc_type from AI pass if available; otherwise detect from SQL
      const isAgg = c.calcType === "aggregate" || (c.calcType !== "row_level" && isAggregate(c.finalSql));
      if (isAgg) map[key].aggregates.push(c);
      else map[key].rowLevel.push(c);
    });
  return Object.values(map);
}

// Extract raw (non-calc) field refs from formulas for a set of calcs
function extractRawRefs(calcs) {
  const refs = new Set();
  calcs.forEach((c) => {
    const matches = c.formula.matchAll(/\[([^\]]+)\]/g);
    for (const m of matches) {
      const ref = m[1];
      if (
        !ref.startsWith("Calculation_") &&
        !ref.startsWith("Parameters") &&
        !ref.includes("copy)_") &&
        ref.length < 60
      ) {
        refs.add(slugify(ref));
      }
    }
  });
  return [...refs].slice(0, 30);
}

// staging/stg_{slug}.sql
export function generateStagingModel(ds, calcs, dialect = "Snowflake") {
  const rawRefs = extractRawRefs(calcs);
  const colList = rawRefs.length
    ? rawRefs.map((r) => `        ${r},`).join("\n")
    : "        *  -- TODO: replace with explicit column list";

  const tableNote = dialect === "BigQuery"
    ? "-- [ ] Replace TODO_TABLE with your BigQuery table name (project.dataset.table)"
    : "-- [ ] Replace TODO_TABLE with your actual Snowflake table name";

  return `{{ config(materialized='view') }}

-- ============================================================
-- Staging model: stg_${ds.slug}
-- Source: ${ds.caption}
-- Dialect: ${dialect}
-- Generated: ${new Date().toISOString().slice(0, 10)}
-- ============================================================
-- ⚠️  REVIEW CHECKLIST:
${tableNote}
-- [ ] Replace * with explicit column list
-- [ ] Add type casting for dates, booleans, and IDs
-- [ ] Add renamed/cleaned column aliases where needed
-- ============================================================

with source as (
    select * from {{ source('${ds.slug}', 'TODO_TABLE') }}
),

final as (
    select
        -- TODO: add your primary key first, e.g.:
        -- id,

        -- Columns referenced by calculated fields:
${colList}

        -- Add any other columns needed downstream
    from source
)

select * from final
`;
}

// marts/fct_{slug}.sql — aggregate calcs only, requires grain to generate valid SQL
export function generateFctModel(ds, aggregates, grain, dialect = "Snowflake") {
  const grainCols = grain?.cols?.trim();
  const grainComment = grain?.note?.trim();

  // Collect LOD CTEs from aggregate calcs, replacing stg_TODO placeholder
  const lodCteClauses = aggregates
    .filter((c) => c.lodCte)
    .map((c) => c.lodCte.replace(/stg_TODO/g, `stg_${ds.slug}`));

  const columnLines = aggregates.map((c) => {
    const sql = c.finalSql || c.ruleSql || "-- translation failed";
    const aiNote = c.translatedByClaude ? " -- AI-refined" : "";
    const grainHint = c.suggestedGrain ? ` -- suggested grain: ${c.suggestedGrain}` : "";
    const lodHint = c.lodNote ? ` -- ${c.lodNote}` : "";
    return `        -- ${c.caption}\n        ${sql} as ${c.slug},${aiNote}${grainHint}${lodHint}`;
  });

  const paramCalcs = aggregates.filter((c) => c.finalSql?.includes("🔧 PARAM"));

  const grainPlaceholder = dialect === "BigQuery"
    ? `        -- TODO: add grain columns, e.g. DATE_TRUNC(order_date, MONTH), region`
    : `        -- TODO: add grain columns, e.g. date_trunc('month', order_date), region`;

  const grainLines = grainCols
    ? grainCols.split(",").map((g) => `        ${g.trim()},`).join("\n")
    : grainPlaceholder;

  const groupByNums = grainCols
    ? Array.from({ length: grainCols.split(",").length }, (_, i) => i + 1).join(", ")
    : "/* column numbers */";

  const withClauses = [
    `stg as (\n    select * from {{ ref('stg_${ds.slug}') }}\n)`,
    ...lodCteClauses,
  ].join(",\n\n");

  return `{{ config(materialized='table') }}

-- ============================================================
-- Model: fct_${ds.slug}
-- Source: ${ds.caption}
-- Type: Aggregate fact model — ${aggregates.length} metrics
-- Dialect: ${dialect}
-- Grain: ${grainComment || grainCols || "NOT SET — add grain columns before running"}
-- Generated: ${new Date().toISOString().slice(0, 10)}
-- ============================================================
-- ⚠️  REVIEW CHECKLIST:
-- [ ] Confirm grain columns match your intended aggregation level
-- [ ] Remove trailing comma from the last metric column
${paramCalcs.map((c) => `-- [ ] Resolve 🔧 PARAM in: ${c.slug}`).join("\n")}
${lodCteClauses.length ? `-- [ ] Review ${lodCteClauses.length} LOD CTE(s) above — update stg references as needed` : ""}
-- [ ] Validate each metric against your Tableau dashboard
-- ============================================================

with ${withClauses},

final as (
    select
        -- Grain / grouping columns:
${grainLines}

        -- Aggregated metrics:
${columnLines.join("\n\n")}

    from stg
    group by ${groupByNums}
)

select * from final
`;
}

// marts/dim_{slug}.sql — row-level expressions only, no GROUP BY needed
export function generateDimModel(ds, rowLevel, dialect = "Snowflake") {
  // Collect any LOD CTEs (rare in dim_ but possible for INCLUDE LODs)
  const lodCteClauses = rowLevel
    .filter((c) => c.lodCte)
    .map((c) => c.lodCte.replace(/stg_TODO/g, `stg_${ds.slug}`));

  const columnLines = rowLevel.map((c) => {
    const sql = c.finalSql || c.ruleSql || "-- translation failed";
    const aiNote = c.translatedByClaude ? " -- AI-refined" : "";
    const lodHint = c.lodNote ? ` -- ${c.lodNote}` : "";
    return `        -- ${c.caption}\n        ${sql} as ${c.slug},${aiNote}${lodHint}`;
  });

  const paramCalcs = rowLevel.filter((c) => c.finalSql?.includes("🔧 PARAM"));

  const withClauses = [
    `stg as (\n    select * from {{ ref('stg_${ds.slug}') }}\n)`,
    ...lodCteClauses,
  ].join(",\n\n");

  return `{{ config(materialized='view') }}

-- ============================================================
-- Model: dim_${ds.slug}
-- Source: ${ds.caption}
-- Type: Row-level dimension model — ${rowLevel.length} expressions
-- Dialect: ${dialect}
-- No aggregation — safe to join to any grain
-- Generated: ${new Date().toISOString().slice(0, 10)}
-- ============================================================
-- ⚠️  REVIEW CHECKLIST:
-- [ ] Add your primary/join key column before the expressions
-- [ ] Remove trailing comma from the last column
${paramCalcs.map((c) => `-- [ ] Resolve 🔧 PARAM in: ${c.slug}`).join("\n")}
-- [ ] Validate expressions match Tableau calculated field output
-- ============================================================

with ${withClauses},

final as (
    select
        -- TODO: add your primary key / join key here, e.g.:
        -- id,

        -- Row-level expressions:
${columnLines.join("\n\n")}

    from stg
)

select * from final
`;
}

export function generateSchemaYaml(datasources) {
  const lines = ["version: 2", "", "models:"];

  datasources.forEach((ds) => {
    // Staging model
    lines.push(`  - name: stg_${ds.slug}`);
    lines.push(`    description: "Staging layer for Tableau datasource: ${ds.caption}. Provides a clean, typed view over the raw source for downstream models."`);
    lines.push(`    columns:`);
    lines.push(`      - name: TODO_ID_COLUMN  # replace with your actual primary key`);
    lines.push(`        description: "Primary key"`);
    lines.push(`        tests:`);
    lines.push(`          - not_null`);
    lines.push(`          - unique`);
    lines.push("");

    // Fact model — aggregates
    if (ds.aggregates?.length > 0) {
      lines.push(`  - name: fct_${ds.slug}`);
      lines.push(`    description: "Aggregate fact model for ${ds.caption}. Contains ${ds.aggregates.length} metrics. Grain must be set before use — see SETUP.md."`);
      lines.push(`    columns:`);
      ds.aggregates.forEach((c) => {
        const desc = c.dbtDescription || `Aggregated metric migrated from Tableau: ${c.caption}`;
        lines.push(`      - name: ${c.slug}`);
        lines.push(`        description: "${desc.replace(/"/g, "'")}"`);
        lines.push(`        tests:`);
        lines.push(`          - not_null`);
      });
      lines.push("");
    }

    // Dimension model — row-level
    if (ds.rowLevel?.length > 0) {
      lines.push(`  - name: dim_${ds.slug}`);
      lines.push(`    description: "Row-level dimension model for ${ds.caption}. Contains ${ds.rowLevel.length} expressions — no aggregation, safe to join to any grain."`);
      lines.push(`    columns:`);
      ds.rowLevel.forEach((c) => {
        const desc = c.dbtDescription || `Row-level expression migrated from Tableau: ${c.caption}`;
        lines.push(`      - name: ${c.slug}`);
        lines.push(`        description: "${desc.replace(/"/g, "'")}"`);
      });
      lines.push("");
    }
  });

  return lines.join("\n");
}

export function generateMetricsYml(datasources) {
  // Separate simple aggs (SUM(col)) from derived (SUM(a)/COUNT(b)) for proper MetricFlow output
  const lines = [
    "# ============================================================",
    "# metrics.yml — dbt MetricFlow semantic layer starter",
    "# Compatible with dbt >= 1.6 (dbt Core or dbt Cloud)",
    "# Docs: https://docs.getdbt.com/docs/build/metrics-overview",
    "# ============================================================",
    "# STATUS: Starter template — requires manual review before dbt sl validate",
    "#",
    "# Simple aggregations (SUM/COUNT/AVG of a single column) are generated",
    "# as proper semantic model measures.",
    "# Derived expressions (e.g. SUM(a) / COUNT(b)) are generated as",
    "# derived metrics — update type_params.expr to reference base measure names.",
    "# ============================================================",
    "",
    "version: 2",
    "",
    "semantic_models:",
  ];

  const allDerivedMetrics = [];

  datasources.forEach((ds) => {
    if (!ds.aggregates?.length) return;

    // Separate simple vs derived
    const simpleMeasures = [];
    const derivedCalcs = [];
    ds.aggregates.forEach((c) => {
      const simple = extractSimpleAgg(c.finalSql);
      if (simple) simpleMeasures.push({ calc: c, simple });
      else derivedCalcs.push(c);
    });

    lines.push(`  - name: ${ds.slug}_semantic`);
    lines.push(`    description: "Semantic model for ${ds.caption} — migrated from Tableau. Set primary entity before use."`);
    lines.push(`    model: ref('fct_${ds.slug}')`);
    lines.push(`    entities:`);
    lines.push(`      - name: TODO_primary_entity`);
    lines.push(`        type: primary`);
    lines.push(`        expr: TODO_ID_COLUMN  # replace with your grain/primary key column`);
    lines.push(`    measures:`);

    if (simpleMeasures.length === 0) {
      lines.push(`      # No simple aggregations detected — add measures manually`);
      lines.push(`      # Format: { name, agg: sum|count|average|min|max|count_distinct, expr: column_name }`);
    }
    simpleMeasures.forEach(({ calc: c, simple }) => {
      const agg = simple.fn === "COUNT" ? (c.finalSql.toUpperCase().includes("DISTINCT") ? "count_distinct" : "count")
        : simple.fn === "AVG" ? "average"
        : simple.fn.toLowerCase();
      lines.push(`      - name: ${c.slug}`);
      lines.push(`        description: "${(c.dbtDescription || c.caption).replace(/"/g, "'")}"`);
      lines.push(`        agg: ${agg}`);
      lines.push(`        expr: ${simple.col}`);
    });

    // Derived calcs reference the fct_ model column directly
    if (derivedCalcs.length > 0) {
      lines.push(`    # Derived expressions — referenced as metrics below, not semantic model measures`);
    }

    lines.push(`    dimensions:`);
    if (ds.rowLevel?.length > 0) {
      ds.rowLevel.slice(0, 10).forEach((c) => {
        lines.push(`      - name: ${c.slug}`);
        lines.push(`        type: categorical`);
        lines.push(`        description: "${(c.dbtDescription || c.caption).replace(/"/g, "'")}"`);
        lines.push(`        expr: ${c.slug}  # references dim_${ds.slug}`);
      });
    } else {
      lines.push(`      # TODO: add dimension columns from dim_${ds.slug} or your staging model`);
      lines.push(`      # Example: { name: region, type: categorical, expr: region }`);
    }
    lines.push("");

    // Collect derived metrics for the metrics section
    derivedCalcs.forEach((c) => allDerivedMetrics.push({ ds, c }));

    // Simple metrics
    simpleMeasures.forEach(({ calc: c }) => {
      lines.push(`  # simple metric — generated from SUM/COUNT/AVG of a single column`);
    });
  });

  lines.push("metrics:");
  datasources.forEach((ds) => {
    if (!ds.aggregates?.length) return;

    ds.aggregates.forEach((c) => {
      const simple = extractSimpleAgg(c.finalSql);
      if (simple) {
        lines.push(`  - name: ${c.slug}`);
        lines.push(`    label: "${c.caption}"`);
        lines.push(`    description: "${(c.dbtDescription || c.caption).replace(/"/g, "'")}"`);
        lines.push(`    type: simple`);
        lines.push(`    type_params:`);
        lines.push(`      measure: ${c.slug}`);
      } else {
        // Derived metric — engineer needs to decompose into base measures
        lines.push(`  - name: ${c.slug}`);
        lines.push(`    label: "${c.caption}"`);
        lines.push(`    description: "${(c.dbtDescription || c.caption).replace(/"/g, "'")}"`);
        lines.push(`    type: derived`);
        lines.push(`    type_params:`);
        lines.push(`      expr: "TODO_EXPR"  # decompose: ${c.finalSql.slice(0, 80)}`);
        lines.push(`      metrics:`);
        lines.push(`        # TODO: list base measures this metric depends on`);
        lines.push(`        # - name: base_measure_1`);
        lines.push(`        # - name: base_measure_2`);
      }
      lines.push("");
    });
  });

  return lines.join("\n");
}

// ================================================================
// WINDOW FUNCTION HINT GENERATOR
// ================================================================

function suggestWindowRewrite(formula, caption) {
  const f = formula.toUpperCase();
  const slug = slugify(caption);

  // Extract the inner expression from common wrappers like RUNNING_SUM(SUM([Field]))
  const innerMatch = formula.match(/\w+\((.+)\)/s);
  const inner = innerMatch
    ? innerMatch[1].replace(/\[([^\]]+)\]/g, (_, n) => slugify(n))
    : slug;

  if (/RUNNING_SUM/.test(f)) {
    return {
      reason: "RUNNING_SUM is a cumulative aggregation over ordered rows — requires a window frame.",
      sql: `SUM(${inner}) OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n  ROWS UNBOUNDED PRECEDING\n) AS ${slug}`,
      notes: "Add PARTITION BY if the running total resets per group (e.g. per customer or per month).",
    };
  }
  if (/RUNNING_AVG/.test(f)) {
    return {
      reason: "RUNNING_AVG is a cumulative average — requires a window frame.",
      sql: `AVG(${inner}) OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n  ROWS UNBOUNDED PRECEDING\n) AS ${slug}`,
      notes: "Add PARTITION BY if the average resets per group.",
    };
  }
  if (/RUNNING_COUNT/.test(f)) {
    return {
      reason: "RUNNING_COUNT is a cumulative count — requires a window frame.",
      sql: `COUNT(${inner}) OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n  ROWS UNBOUNDED PRECEDING\n) AS ${slug}`,
      notes: null,
    };
  }
  if (/RUNNING_MAX/.test(f)) {
    return {
      reason: "RUNNING_MAX tracks the maximum value seen so far — requires a window frame.",
      sql: `MAX(${inner}) OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n  ROWS UNBOUNDED PRECEDING\n) AS ${slug}`,
      notes: null,
    };
  }
  if (/RUNNING_MIN/.test(f)) {
    return {
      reason: "RUNNING_MIN tracks the minimum value seen so far — requires a window frame.",
      sql: `MIN(${inner}) OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n  ROWS UNBOUNDED PRECEDING\n) AS ${slug}`,
      notes: null,
    };
  }
  if (/WINDOW_SUM/.test(f)) {
    return {
      reason: "WINDOW_SUM aggregates across a sliding window of rows defined by Tableau's view partition.",
      sql: `SUM(${inner}) OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n  ROWS BETWEEN /* N PRECEDING */ AND /* N FOLLOWING */\n) AS ${slug}`,
      notes: "Replace ROWS BETWEEN bounds with your desired window size, or use UNBOUNDED PRECEDING / CURRENT ROW for a cumulative variant.",
    };
  }
  if (/WINDOW_AVG/.test(f)) {
    return {
      reason: "WINDOW_AVG aggregates an average across a sliding window.",
      sql: `AVG(${inner}) OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n  ROWS BETWEEN /* N PRECEDING */ AND /* N FOLLOWING */\n) AS ${slug}`,
      notes: null,
    };
  }
  if (/RANK_DENSE/.test(f) || /RANK\b.*DENSE/.test(f)) {
    return {
      reason: "RANK_DENSE assigns consecutive ranks with no gaps for ties.",
      sql: `DENSE_RANK() OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY ${inner} DESC  -- change to ASC if ranking lowest-first\n) AS ${slug}`,
      notes: "Use DENSE_RANK() for no gaps, RANK() if you want gaps after ties.",
    };
  }
  if (/RANK_PERCENTILE/.test(f)) {
    return {
      reason: "RANK_PERCENTILE returns the percentile rank of a value within a partition.",
      sql: `PERCENT_RANK() OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY ${inner}\n) AS ${slug}`,
      notes: "PERCENT_RANK returns 0.0–1.0. Multiply by 100 for a 0–100 scale.",
    };
  }
  if (/\bRANK\(/.test(f) || /\bRANK_/.test(f)) {
    return {
      reason: "RANK is a table calculation that assigns a rank based on sort order within Tableau's view partition.",
      sql: `RANK() OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY ${inner} DESC  -- change to ASC if ranking lowest-first\n) AS ${slug}`,
      notes: "RANK() leaves gaps after ties (1, 1, 3). Use DENSE_RANK() to avoid gaps (1, 1, 2).",
    };
  }
  if (/INDEX\(\)/.test(f)) {
    return {
      reason: "INDEX() returns the row number within Tableau's current partition — equivalent to ROW_NUMBER().",
      sql: `ROW_NUMBER() OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n) AS ${slug}`,
      notes: "Tableau INDEX() starts at 1. ROW_NUMBER() also starts at 1, so no offset needed.",
    };
  }
  if (/FIRST\(\)/.test(f)) {
    return {
      reason: "FIRST() returns the offset of the current row from the first row in the partition.",
      sql: `-- FIRST() is typically used for conditional logic based on row position.\n-- Use ROW_NUMBER() and check if it equals 1:\nCASE WHEN ROW_NUMBER() OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */\n) = 1 THEN /* first row logic */ END AS ${slug}`,
      notes: "Review how FIRST() was used in this calculation — it often drives conditional visibility or running totals.",
    };
  }
  if (/LAST\(\)/.test(f)) {
    return {
      reason: "LAST() returns the offset from the current row to the last row in the partition.",
      sql: `-- LAST() is typically used to identify the final row in a partition.\n-- Use ROW_NUMBER() + COUNT() to find the last row:\nCASE WHEN ROW_NUMBER() OVER (\n  PARTITION BY /* your partition column(s) */\n  ORDER BY /* your order column */ DESC\n) = 1 THEN /* last row logic */ END AS ${slug}`,
      notes: "Consider using QUALIFY ROW_NUMBER() OVER (...) = 1 in Snowflake for cleaner last-row filtering.",
    };
  }
  if (/SIZE\(\)/.test(f)) {
    return {
      reason: "SIZE() returns the number of rows in the current partition.",
      sql: `COUNT(*) OVER (\n  PARTITION BY /* your partition column(s) */\n) AS ${slug}`,
      notes: "This gives the total partition size for every row. Useful for calculating percentages within a group.",
    };
  }

  // Generic fallback
  return {
    reason: "This is a Tableau table calculation that operates on the result set after aggregation.",
    sql: `-- Manual rewrite required for: ${caption}\n-- Original formula: ${formula.slice(0, 120)}\n-- TODO: implement as a window function`,
    notes: "Review the Tableau formula and map the partition/sort fields to PARTITION BY / ORDER BY clauses.",
  };
}

export function generateReport(calcs, dialect = "Snowflake") {
  const translatable = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity));
  const untranslatable = calcs.filter((c) => c.complexity === "untranslatable");
  const claudeRefined = calcs.filter((c) => c.translatedByClaude);
  const withDeps = calcs.filter((c) => c.dependsOn?.length);

  const lines = [
    "# Tableau → dbt Translation Report",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "## Summary",
    "| Category | Count |",
    "|---|---|",
    `| Total unique calculated fields | ${calcs.length} |`,
    `| Translated — simple | ${calcs.filter((c) => c.complexity === "simple").length} |`,
    `| Translated — moderate | ${calcs.filter((c) => c.complexity === "moderate").length} |`,
    `| Translated — complex (LOD) | ${calcs.filter((c) => c.complexity === "complex").length} |`,
    `| ✨ AI-refined | ${claudeRefined.length} |`,
    `| Has inter-calc dependencies | ${withDeps.length} |`,
    `| Untranslatable (table calcs) | ${untranslatable.length} |`,
    `| Skipped (literals / params / bins) | ${calcs.filter((c) => c.complexity === "skip").length} |`,
    "",
    "## Dependency Chains",
    ...withDeps.map((c) => `- **${c.caption}** (\`${c.slug}\`) → depends on: ${c.dependsOn.map((d) => `\`${d}\``).join(", ")}`),
    "",
    "## Parameter Decisions Required",
    "Fields below contain `🔧 PARAM` placeholders — decide: hardcode, dbt var, or seed file.",
    "",
    ...translatable
      .filter((c) => c.finalSql?.includes("🔧 PARAM"))
      .map((c) => `- **${c.caption}** (\`${c.slug}\`)`),
    "",
    "## Translated Fields",
    "",
    ...translatable.flatMap((c) => [
      `### \`${c.slug}\` — ${c.complexity.toUpperCase()}${c.translatedByClaude ? " ✨" : ""}`,
      `**Original:** ${c.caption}`,
      `**Tableau:**\n\`\`\`\n${c.formula.slice(0, 300)}\n\`\`\``,
      `**${dialect} SQL:**\n\`\`\`sql\n${c.finalSql || "-- failed"}\n\`\`\``,
      c.lodNote ? `**LOD:** ${c.lodNote}` : "",
      c.lodCte ? `**LOD CTE template:**\n\`\`\`sql\n${c.lodCte}\n\`\`\`` : "",
      c.dbtDescription ? `**Description:** ${c.dbtDescription}` : "",
      c.aeRecommendations?.length ? `**AE Notes:**\n${c.aeRecommendations.map((r) => `- ${r}`).join("\n")}` : "",
      c.dependsOn?.length ? `**Depends on:** ${c.dependsOn.join(", ")}` : "",
      "",
    ]),
    "## Untranslatable Fields",
    "These use Tableau table calculations (INDEX, WINDOW, RANK) with no direct SQL equivalent.",
    "Rewrite as window functions in a dbt model. Suggested rewrites are provided per field below.",
    "",
    ...untranslatable.flatMap((c) => {
      const hint = suggestWindowRewrite(c.formula, c.caption);
      return [
        `### ${c.caption}`,
        `**Tableau formula:**`,
        `\`\`\``,
        c.formula.slice(0, 300),
        `\`\`\``,
        `**Why untranslatable:** ${hint.reason}`,
        `**Suggested ${dialect} rewrite:**`,
        `\`\`\`sql`,
        hint.sql,
        `\`\`\``,
        hint.notes ? `**Notes:** ${hint.notes}` : "",
        "",
      ].filter(Boolean);
    }),
  ];

  return lines.filter((l) => l !== undefined).join("\n");
}

// ================================================================
// SOURCES.YML
// ================================================================

export function parseSources(xmlString) {
  const doc = parseXML(xmlString);
  const sources = [];

  const rawRefs = new Set();
  doc.querySelectorAll("calculation").forEach((calc) => {
    const formula = calc.getAttribute("formula") || "";
    const matches = formula.matchAll(/\[([^\]]+)\]/g);
    for (const m of matches) {
      const ref = m[1];
      if (
        !ref.startsWith("Calculation_") &&
        !ref.startsWith("Parameters") &&
        !ref.includes("copy)_") &&
        !ref.startsWith("Parameter ") &&
        !ref.startsWith("p.") &&
        ref.length < 60
      ) {
        rawRefs.add(ref);
      }
    }
  });

  const seenDs = new Set();
  doc.querySelectorAll("datasource[caption]").forEach((ds) => {
    const caption = ds.getAttribute("caption") || "";
    const name = ds.getAttribute("name") || "";
    if (name === "Parameters" || seenDs.has(caption)) return;
    seenDs.add(caption);

    const conn = ds.querySelector("connection");
    const connClass = conn?.getAttribute("class") || "";
    const dbname = conn?.getAttribute("dbname") || "";
    const server = conn?.getAttribute("server") || "";
    const friendlyName = conn?.getAttribute("server-ds-friendly-name") || caption;
    const isPublished = connClass === "sqlproxy";

    sources.push({
      caption,
      sourceSlug: slugify(caption),
      dbname,
      server,
      friendlyName,
      isPublished,
      connClass,
      columns: Array.from(rawRefs),
    });
  });

  return sources;
}

export function generateSourcesYaml(_, xmlString, dialect = "Snowflake") {
  const parsed = parseSources(xmlString);
  if (!parsed.length) return null;

  const dbNote = dialect === "BigQuery"
    ? "# 1. Replace TODO_DATABASE with your GCP project ID"
    : "# 1. Replace TODO_DATABASE with your Snowflake database name";
  const schemaNote = dialect === "BigQuery"
    ? "# 2. Replace TODO_SCHEMA with your BigQuery dataset name"
    : "# 2. Replace TODO_SCHEMA with your Snowflake schema name";

  const lines = [
    "# ============================================================",
    `# sources.yml — generated by Tableau → dbt Exporter (${dialect})`,
    "# ============================================================",
    "# SETUP REQUIRED:",
    dbNote,
    schemaNote,
    "# 3. Replace TODO_TABLE with your actual table name(s)",
    "# 4. Run: dbt source freshness  (to validate connection)",
    "# ============================================================",
    "",
    "version: 2",
    "",
    "sources:",
  ];

  parsed.forEach((src) => {
    lines.push(`  - name: ${src.sourceSlug}`);
    lines.push(`    description: >`);
    lines.push(`      Source data from Tableau datasource: "${src.caption}"`);
    if (src.isPublished) {
      lines.push(`      Originally a Tableau Server published datasource (${src.friendlyName}).`);
      lines.push(`      Map to your Snowflake equivalent below.`);
    }
    lines.push(`    database: TODO_DATABASE  # e.g. PROD_DB`);
    lines.push(`    schema: TODO_SCHEMA      # e.g. SALESFORCE or PUBLIC`);
    lines.push(`    loaded_at_field: TODO_TIMESTAMP_COLUMN  # for freshness checks`);
    lines.push(`    freshness:`);
    lines.push(`      warn_after: {count: 24, period: hour}`);
    lines.push(`      error_after: {count: 48, period: hour}`);
    lines.push(`    tables:`);
    lines.push(`      - name: TODO_TABLE  # replace with your actual table name`);
    lines.push(`        description: "Primary source table for ${src.caption} metrics"`);

    if (src.columns.length > 0) {
      lines.push(`        columns:`);
      src.columns.slice(0, 30).forEach((col) => {
        const colSlug = slugify(col);
        lines.push(`          - name: ${colSlug}`);
        lines.push(`            description: "${col}"  # original Tableau field name`);
      });
    }
    lines.push("");
  });

  return lines.join("\n");
}

// ================================================================
// SETUP.md — workbook-specific setup instructions
// ================================================================

export function generateSetupMd(calcs, workbookName, dialect = "Snowflake") {
  const datasources = groupByDatasource(calcs);
  const untranslatable = calcs.filter((c) => c.complexity === "untranslatable");
  const totalCalcs = datasources.reduce((n, ds) => n + (ds.aggregates?.length || 0) + (ds.rowLevel?.length || 0), 0);

  const fileTree = datasources.flatMap((ds) => [
    `│   ├── staging/`,
    `│   │   └── stg_${ds.slug}.sql`,
    `│   └── marts/`,
    ...(ds.aggregates?.length ? [`│       ├── fct_${ds.slug}.sql   ← ${ds.aggregates.length} aggregate metrics`] : []),
    ...(ds.rowLevel?.length ? [`│       └── dim_${ds.slug}.sql   ← ${ds.rowLevel.length} row-level expressions`] : []),
  ]);

  const lines = [
    `# dbt Export Setup Guide`,
    `**Workbook:** ${workbookName || "Tableau export"}`,
    `**Generated:** ${new Date().toLocaleDateString()}`,
    `**Structure:** ${datasources.length} datasource(s) → staging + marts layers · ${totalCalcs} calculated fields`,
    "",
    "---",
    "",
    "## Output structure",
    "",
    "```",
    "your-dbt-project/",
    "├── models/",
    ...fileTree,
    "├── metrics.yml      ← MetricFlow semantic layer (dbt >= 1.6)",
    "├── schema.yml       ← model documentation and tests",
    "├── sources.yml      ← source definitions",
    "└── dbt_project.yml  ← project scaffold",
    "```",
    "",
    "---",
    "",
    "## Step 1 — Fill in sources.yml",
    "",
    `${datasources.length} datasource(s) detected:`,
    "",
    ...datasources.map((ds) => [
      `### \`${ds.slug}\` _(${ds.caption})_`,
      "",
      "```yaml",
      `  - name: ${ds.slug}`,
      `    database: YOUR_DATABASE   # e.g. PROD_DB`,
      `    schema: YOUR_SCHEMA       # e.g. ANALYTICS`,
      `    tables:`,
      `      - name: YOUR_TABLE`,
      "```",
      "",
    ].join("\n")),
    "---",
    "",
    "## Step 2 — Update TODO_TABLE in staging models",
    "",
    "Each staging model references:",
    "```sql",
    `select * from {{ source('${datasources[0]?.slug || "your_source"}', 'TODO_TABLE') }}`,
    "```",
    `Replace \`TODO_TABLE\` with the actual ${dialect} table name you set in sources.yml.`,
    "",
    "---",
    "",
    "## Step 3 — Confirm grain in fct_ models",
    "",
    "Each `fct_` model contains only aggregate metrics (SUM/COUNT/AVG expressions).",
    "The grain columns you provided during export are already in the SELECT and GROUP BY.",
    "If you left grain blank, open the file and fill in the grain columns before running.",
    "",
    "```sql",
    "final as (",
    "    select",
    "        date_trunc('month', order_date) as order_month,  -- grain",
    "        region,                                           -- grain",
    "        SUM(revenue) as total_revenue,",
    "        COUNT(DISTINCT user_id) as unique_users",
    "    from stg",
    "    group by 1, 2",
    ")",
    "```",
    "",
    "The `dim_` model contains row-level expressions — no GROUP BY needed.",
    "Add your primary/join key to make it joinable to fct_ models.",
    "",
    "---",
    "",
    "## Step 4 — Run dbt",
    "",
    "```bash",
    "dbt source freshness   # verify source connections",
    "dbt run --select staging  # build staging layer first",
    "dbt run --select marts    # then build mart models",
    "dbt test                  # run schema tests",
    "```",
    "",
    "---",
    "",
    "## Step 5 — Wire up MetricFlow (optional, dbt >= 1.6)",
    "",
    "`metrics.yml` contains a semantic model and metric definitions for all measure fields.",
    "Update `TODO_ENTITY` and `TODO_ID_COLUMN` with your primary key, then run:",
    "```bash",
    "dbt sl validate   # validate semantic layer",
    "```",
    "",
    "---",
    "",
  ];

  if (untranslatable.length > 0) {
    lines.push("## Fields requiring manual rewrite");
    lines.push("");
    lines.push("These use Tableau table calculations with no direct SQL equivalent.");
    lines.push("See `translation_report.md` for suggested window function rewrites.");
    lines.push("");
    untranslatable.forEach((c) => {
      lines.push(`- **${c.caption}**: \`${c.formula.slice(0, 100)}\``);
    });
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("_Generated by [Tableau → dbt Exporter](https://tableau-twb-to-dbt.vercel.app)_");

  return lines.join("\n");
}

// ================================================================
// dbt_project.yml scaffold
// ================================================================

export function generateDbtProjectYml(calcs, workbookName) {
  const projectName = slugify(workbookName || "tableau_export");
  const datasources = groupByDatasource(calcs);

  const lines = [
    `name: '${projectName}'`,
    `version: '1.0.0'`,
    `config-version: 2`,
    "",
    "# Update 'profile' to match your profiles.yml entry",
    `profile: 'default'`,
    "",
    "model-paths: [\"models\"]",
    "analysis-paths: [\"analyses\"]",
    "test-paths: [\"tests\"]",
    "seed-paths: [\"seeds\"]",
    "macro-paths: [\"macros\"]",
    "snapshot-paths: [\"snapshots\"]",
    "",
    "target-path: \"target\"",
    "clean-targets:",
    "  - \"target\"",
    "  - \"dbt_packages\"",
    "",
    "models:",
    `  ${projectName}:`,
    "    staging:",
    "      +materialized: view",
    "      +schema: staging",
    "    marts:",
    "      +materialized: table",
    "      +schema: marts",
    "",
    "# Datasources detected from this workbook:",
    ...datasources.map((ds) => `#   - ${ds.slug}: ${ds.aggregates?.length || 0} aggregate metrics (fct_), ${ds.rowLevel?.length || 0} row-level expressions (dim_)`),
  ];

  return lines.join("\n");
}
