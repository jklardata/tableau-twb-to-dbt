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

export function ruleBasedTranslate(formula, idMap) {
  let sql = formula;
  sql = sql.replace(/\/\/[^\n\r]*/g, "");
  sql = sql.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  sql = resolveInternalRefs(sql, idMap);
  sql = annotateParams(sql);
  sql = sql.replace(/\[([^\]]+)\]/g, (_, f) => slugify(f));
  sql = sql.replace(/\bDateTRUNC\b/gi, "DATE_TRUNC");
  sql = sql.replace(/\bDATETRUNC\b/gi, "DATE_TRUNC");
  sql = sql.replace(/\bTODAY\(\)/gi, "CURRENT_DATE");
  sql = sql.replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP");
  sql = sql.replace(/\bCOUNTD\(/gi, "COUNT(DISTINCT ");
  sql = sql.replace(/\bIIF\(/gi, "IFF(");
  sql = sql.replace(/\bLEN\(/gi, "LENGTH(");
  sql = sql.replace(/\bISNULL\(([^)]+)\)/gi, "($1 IS NULL)");
  sql = sql.replace(/"([^"]*)"/g, "'$1'");
  sql = sql.replace(/#(\d{4}-\d{2}-\d{2})#/g, "'$1'::DATE");
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
// PHASE 4: NEEDS CLAUDE?
// ================================================================

export function needsClaude(calc, ruleSql) {
  const reasons = [];
  if (/\/\//.test(calc.formula)) reasons.push("Has commented-out logic");
  if (/unresolved:/.test(ruleSql)) reasons.push("Unresolved internal refs");
  if (calc.formula.length > 300) reasons.push("Complex multi-step formula");
  if (/queue_duration\s*\/\s*queue_duration/i.test(ruleSql)) reasons.push("Self-division pattern (count trick)");
  if (calc.complexity === "complex") reasons.push("LOD expression");
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
// PHASE 6: OUTPUT GENERATION
// ================================================================

export function generateDbtModel(calc) {
  const sql = calc.finalSql || calc.ruleSql || "-- Translation failed";
  const depNote = calc.dependsOn?.length
    ? `-- Dependencies: ${calc.dependsOn.join(", ")}\n    `
    : "";

  const cteBlock = (calc.dependsOn || [])
    .filter((d) => d)
    .map(
      (dep) =>
        `${dep} as (\n    -- Inlined dependency\n    select * from {{ ref('${dep}') }}\n)`
    )
    .join(",\n\n");

  const sourceRef = calc.datasourceSlug
    ? `{{ source('${calc.datasourceSlug}', 'TODO_TABLE') }}  -- TODO: replace TODO_TABLE with your actual table`
    : `{{ source('TODO_SOURCE', 'TODO_TABLE') }}             -- TODO: fill in source and table names`;

  const reviewItems = [
    `[ ] In sources.yml: fill in database, schema, and table name for '${calc.datasourceSlug || "TODO_SOURCE"}'`,
    "[ ] Resolve any 🔧 PARAM placeholders (hardcode, dbt var, or seed)",
    "[ ] Validate output matches Tableau dashboard values",
    ...(calc.aeRecommendations || []).map((r) => `[ ] ${r}`),
  ];

  return `-- ============================================================
-- dbt model: ${calc.slug}
-- Source Tableau calc: ${calc.caption}
-- Tableau datasource: ${calc.datasourceCaption || "unknown"}
-- Complexity: ${calc.complexity}
-- Generated: ${new Date().toISOString().slice(0, 10)}
-- ============================================================
-- Original Tableau formula:
${calc.formula
  .replace(/\r\n/g, "\n")
  .split("\n")
  .map((l) => `-- ${l}`)
  .join("\n")
  .slice(0, 600)}
-- ============================================================
-- ⚠️  REVIEW CHECKLIST:
${reviewItems.map((r) => `-- ${r}`).join("\n")}
-- ============================================================

{{ config(materialized='view') }}

with source as (
    select * from ${sourceRef}
),
${cteBlock ? "\n" + cteBlock + ",\n" : ""}
final as (
    select
        ${depNote}${sql} as ${calc.slug}
    from source
)

select * from final
`;
}

export function generateSchemaYaml(calcs) {
  const models = calcs
    .filter((c) => c.finalSql && !["skip", "untranslatable"].includes(c.complexity))
    .map((c) => ({
      name: c.slug,
      description: c.dbtDescription || `Migrated from Tableau: ${c.caption}`,
      columns: [
        {
          name: c.slug,
          description: `Original Tableau formula: ${c.formula.slice(0, 100)}`,
          ...(c.role === "measure" ? { tests: ["not_null"] } : {}),
        },
      ],
    }));

  const lines = ["version: 2", "", "models:"];
  models.forEach((m) => {
    lines.push(`  - name: ${m.name}`);
    lines.push(`    description: "${m.description.replace(/"/g, "'")}"`);
    lines.push(`    columns:`);
    m.columns.forEach((col) => {
      lines.push(`      - name: ${col.name}`);
      lines.push(`        description: "${col.description.replace(/"/g, "'")}"`);
      if (col.tests) lines.push(`        tests:\n          - not_null`);
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

export function generateReport(calcs) {
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
      `**Snowflake SQL:**\n\`\`\`sql\n${c.finalSql || "-- failed"}\n\`\`\``,
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
        `**Suggested Snowflake rewrite:**`,
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

export function generateSourcesYaml(_, xmlString) {
  const parsed = parseSources(xmlString);
  if (!parsed.length) return null;

  const lines = [
    "# ============================================================",
    "# sources.yml — generated by Tableau → dbt Exporter",
    "# ============================================================",
    "# SETUP REQUIRED:",
    "# 1. Replace TODO_DATABASE with your Snowflake database name",
    "# 2. Replace TODO_SCHEMA with your Snowflake schema name",
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

export function generateSetupMd(calcs, workbookName) {
  const translatable = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity) && c.finalSql);
  const untranslatable = calcs.filter((c) => c.complexity === "untranslatable");

  // Collect unique datasources from calcs
  const datasourceMap = {};
  translatable.forEach((c) => {
    if (c.datasourceSlug && !datasourceMap[c.datasourceSlug]) {
      datasourceMap[c.datasourceSlug] = c.datasourceCaption || c.datasourceSlug;
    }
  });
  const datasources = Object.entries(datasourceMap);

  const lines = [
    `# dbt Export Setup Guide`,
    `**Workbook:** ${workbookName || "Tableau export"}`,
    `**Generated:** ${new Date().toLocaleDateString()}`,
    `**Models:** ${translatable.length} SQL files ready to drop into dbt`,
    "",
    "---",
    "",
    "## Step 1 — Copy files into your dbt project",
    "",
    "```",
    "your-dbt-project/",
    "├── models/",
    translatable.slice(0, 5).map((c) => `│   ├── ${c.slug}.sql`).join("\n"),
    translatable.length > 5 ? `│   └── ... (${translatable.length - 5} more)` : "",
    "├── sources.yml      ← add to your project root",
    "├── schema.yml       ← add to your project root",
    "└── dbt_project.yml  ← use as a starting point or merge into existing",
    "```",
    "",
    "---",
    "",
    "## Step 2 — Fill in sources.yml",
    "",
    `${datasources.length} datasource(s) were detected in this workbook:`,
    "",
    ...datasources.map(([slug, caption]) => [
      `### \`${slug}\` _(${caption})_`,
      "",
      "Open `sources.yml` and replace the placeholders for this source:",
      "",
      "```yaml",
      `  - name: ${slug}`,
      `    database: YOUR_DATABASE   # e.g. PROD_DB`,
      `    schema: YOUR_SCHEMA       # e.g. ANALYTICS`,
      `    tables:`,
      `      - name: YOUR_TABLE      # the actual Snowflake table name`,
      "```",
      "",
    ].join("\n")),
    "---",
    "",
    "## Step 3 — Update source() refs in SQL models",
    "",
    "Each model references its source like this:",
    "",
    "```sql",
    `select * from {{ source('${datasources[0]?.[0] || "your_source"}', 'TODO_TABLE') }}`,
    "```",
    "",
    "Replace `TODO_TABLE` with the actual table name you set in sources.yml.",
    "The source name (`" + (datasources[0]?.[0] || "your_source") + "`) is already filled in for you.",
    "",
    "---",
    "",
    "## Step 4 — Run dbt",
    "",
    "```bash",
    "dbt deps",
    "dbt source freshness   # verify source connections",
    "dbt run                # build all models",
    "dbt test               # run schema tests",
    "```",
    "",
    "---",
    "",
  ];

  if (untranslatable.length > 0) {
    lines.push("## Untranslatable fields (manual rewrite required)");
    lines.push("");
    lines.push("These use Tableau table calculations (INDEX, WINDOW, RANK) with no direct SQL equivalent.");
    lines.push("Rewrite as window functions in a separate dbt model.");
    lines.push("");
    untranslatable.forEach((c) => {
      lines.push(`- **${c.caption}**: \`${c.formula.slice(0, 100)}\``);
    });
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("_Generated by [Tableau → dbt Exporter](https://tableau-twb-to-dbt.vercel.app)_");

  return lines.join("\n");
}

// ================================================================
// dbt_project.yml scaffold
// ================================================================

export function generateDbtProjectYml(calcs, workbookName) {
  const projectName = slugify(workbookName || "tableau_export");

  // Collect unique datasources
  const datasources = [...new Set(
    calcs
      .filter((c) => c.datasourceSlug)
      .map((c) => c.datasourceSlug)
  )];

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
    "    +materialized: view",
    "    +schema: dbt_tableau_export",
    "",
    "# Sources are defined in sources.yml",
    "# Detected datasources from this workbook:",
    ...datasources.map((ds) => `#   - ${ds}`),
  ];

  return lines.join("\n");
}
