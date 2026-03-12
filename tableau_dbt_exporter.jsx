import { useState, useCallback, useRef } from "react";

// ================================================================
// UTILITIES
// ================================================================

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
}

function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, "text/xml");
}

// ================================================================
// PRIVACY SCAN
// ================================================================

function scanTWB(xmlString) {
  const doc = parseXML(xmlString);
  const findings = { staysInBrowser: [], sentToAI: [], flagged: [] };

  // --- STAYS IN BROWSER ---

  // Server / connection URLs
  doc.querySelectorAll("connection").forEach((conn) => {
    const server = conn.getAttribute("server");
    const db = conn.getAttribute("dbname");
    const cls = conn.getAttribute("class");
    if (server && server !== "localhost") {
      findings.staysInBrowser.push({
        type: "Server URL",
        value: server,
        icon: "🌐",
      });
    }
    if (db) {
      findings.staysInBrowser.push({
        type: "Database name",
        value: db,
        icon: "🗄",
      });
    }
  });

  // Tableau Server site paths
  const repoLoc = doc.querySelector("repository-location");
  if (repoLoc) {
    const site = repoLoc.getAttribute("site");
    const path = repoLoc.getAttribute("path");
    if (site) findings.staysInBrowser.push({ type: "Tableau site", value: site, icon: "🏢" });
    if (path) findings.staysInBrowser.push({ type: "Server path", value: path, icon: "📂" });
  }

  // Deduplicate staysInBrowser
  const sbSeen = new Set();
  findings.staysInBrowser = findings.staysInBrowser.filter((f) => {
    const k = f.type + f.value;
    if (sbSeen.has(k)) return false;
    sbSeen.add(k);
    return true;
  });

  // --- FLAGGED: hardcoded values in parameter defaults that look like PII/client names ---
  const paramLiterals = [];
  doc.querySelectorAll("datasource[name='Parameters'] column").forEach((col) => {
    const calc = col.querySelector("calculation");
    if (!calc) return;
    const formula = calc.getAttribute("formula") || "";
    const caption = col.getAttribute("caption") || "";
    // String literals that aren't obvious toggle/config values
    const strMatch = formula.match(/^["'](.+)["']$/);
    if (strMatch) {
      const val = strMatch[1];
      // Flag if it looks like a proper noun / org name (contains space and capital letters)
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

  // --- SENT TO AI ---
  // Count the translatable calc formulas (non-skip, non-untranslatable)
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
// PHASE 1: PARSE TWB XML
// ================================================================

function parseTWB(xmlString) {
  const doc = parseXML(xmlString);

  // Build internal ID map: Calculation_XXXX → caption
  const internalIdMap = {};
  doc.querySelectorAll("column[caption]").forEach((col) => {
    const name = (col.getAttribute("name") || "").replace(/^\[|\]$/g, "");
    const caption = col.getAttribute("caption") || "";
    if (name.startsWith("Calculation_")) internalIdMap[name] = caption;
  });

  // Parse all calculated fields
  const seen = new Set();
  const calcs = [];

  doc.querySelectorAll("column[caption]").forEach((col) => {
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
    });
  });

  return { calcs, internalIdMap };
}

// ================================================================
// PHASE 2: CLASSIFY
// ================================================================

function classify(formula, calcClass) {
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

function resolveInternalRefs(formula, idMap) {
  return formula.replace(/\[?(Calculation_\d+)\]?/g, (_, id) =>
    id in idMap ? slugify(idMap[id]) : `/* unresolved: ${id} */`
  );
}

function annotateParams(formula) {
  return formula.replace(/\[Parameters\]\.\[([^\]]+)\]/g, (_, name) => {
    const friendly = name.replace(/_copy_\d+/g, "").replace(/\(copy\)_\d+/g, "").trim();
    return `/* 🔧 PARAM:${slugify(friendly)} */`;
  });
}

function ruleBasedTranslate(formula, idMap) {
  let sql = formula;
  sql = sql.replace(/\/\/[^\n\r]*/g, ""); // strip comments
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

function findDependencies(formula, idMap) {
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
// PHASE 4: NEEDS CLAUDE? SCORING
// ================================================================

function needsClaude(calc, ruleSql) {
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
// PHASE 5: CLAUDE API TRANSLATION
// ================================================================

async function claudeTranslate(calcsForClaude, dialect = "Snowflake") {
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
  (e.g. "Consider replacing 50-line state mapping with a dbt seed file", "Add NULLIFZERO guard to prevent divide-by-zero")
- confidence: "high" | "medium" | "low"
- what_changed: brief explanation of what you improved over the rule-based attempt

Respond ONLY with a valid JSON array. No markdown fences. No preamble.

CALCULATED FIELDS:
${formatted}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const raw = data.content?.find((b) => b.type === "text")?.text || "[]";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

// ================================================================
// PHASE 6: OUTPUT GENERATION
// ================================================================

function generateDbtModel(calc) {
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

  const reviewItems = [
    "[ ] Replace 'your_source_model' with your actual dbt model ref",
    "[ ] Resolve any 🔧 PARAM placeholders (hardcode, dbt var, or seed)",
    "[ ] Validate output matches Tableau dashboard values",
    ...(calc.aeRecommendations || []).map((r) => `[ ] ${r}`),
  ];

  return `-- ============================================================
-- dbt model: ${calc.slug}
-- Source Tableau calc: ${calc.caption}
-- Complexity: ${calc.complexity}${calc.translatedByClaude ? " | ✨ AI-refined" : ""}
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
    select * from {{ ref('your_source_model') }}  -- TODO: update
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

function generateSchemaYaml(calcs) {
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

function generateReport(calcs) {
  const translatable = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity));
  const untranslatable = calcs.filter((c) => c.complexity === "untranslatable");
  const skipped = calcs.filter((c) => c.complexity === "skip");
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
    `| Skipped (literals / params / bins) | ${skipped.length} |`,
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
    "Rewrite as window functions in a dbt model.",
    "",
    ...untranslatable.map((c) => `- **${c.caption}**: \`${c.formula.slice(0, 120)}\``),
  ];

  return lines.filter((l) => l !== undefined).join("\n");
}

// ================================================================
// SOURCES.YML GENERATOR
// Infers source tables from TWB datasource metadata + formula refs
// ================================================================

function parseSources(xmlString) {
  const doc = parseXML(xmlString);
  const sources = [];

  // Collect formula field refs — real source columns (not params, not calcs)
  const internalIds = new Set();
  doc.querySelectorAll("column[caption]").forEach((col) => {
    const name = (col.getAttribute("name") || "").replace(/^\[|\]$/g, "");
    if (name.startsWith("Calculation_")) internalIds.add(name);
  });

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

  // Build source entries per unique datasource
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

function generateSourcesYaml(sources, xmlString) {
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
    lines.push(`    description: >-`);
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
      src.columns.forEach((col) => {
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
// ZIP GENERATION — JSZip for real browser zip download
// ================================================================

async function loadJSZip() {
  return new Promise((resolve, reject) => {
    if (window.JSZip) { resolve(window.JSZip); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = () => resolve(window.JSZip);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function buildZip(calcs, xmlString) {
  const translatable = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity) && c.finalSql);

  const files = {};
  translatable.forEach((c) => {
    files[`models/${c.slug}.sql`] = generateDbtModel(c);
  });
  files["schema.yml"] = generateSchemaYaml(calcs);
  files["translation_report.md"] = generateReport(calcs);

  // sources.yml
  if (xmlString) {
    const sourcesYaml = generateSourcesYaml([], xmlString);
    if (sourcesYaml) files["sources.yml"] = sourcesYaml;
  }

  return files;
}

async function downloadAllAsZip(files, workbookName) {
  try {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const folder = zip.folder("dbt_export");
    const models = folder.folder("models");

    Object.entries(files).forEach(([path, content]) => {
      if (path.startsWith("models/")) {
        models.file(path.replace("models/", ""), content);
      } else {
        folder.file(path, content);
      }
    });

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (workbookName || "tableau_export").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    a.download = `${safeName}_dbt_export.zip`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("JSZip failed:", err);
    return false;
  }
}

// ================================================================
// UI COMPONENTS
// ================================================================

const BADGE_COLORS = {
  simple: { bg: "#05966918", text: "#34d399", border: "#05966940" },
  moderate: { bg: "#0891b218", text: "#67e8f9", border: "#0891b240" },
  complex: { bg: "#f59e0b18", text: "#fbbf24", border: "#f59e0b40" },
  untranslatable: { bg: "#f8717118", text: "#f87171", border: "#f8717140" },
  skip: { bg: "#ffffff0a", text: "#6b7280", border: "#ffffff18" },
};

function Badge({ type, label }) {
  const colors = BADGE_COLORS[type] || BADGE_COLORS.skip;
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: "4px",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        fontFamily: "monospace",
        whiteSpace: "nowrap",
      }}
    >
      {label || type.toUpperCase()}
    </span>
  );
}

function ProgressBar({ value, max, color = "#0891b2" }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: "#0d2b1e", borderRadius: 4, height: 6, overflow: "hidden" }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

// ================================================================
// MAIN APP
// ================================================================

export default function App() {
  const [stage, setStage] = useState("upload");
  const [calcs, setCalcs] = useState([]);
  const [log, setLog] = useState([]);
  const [outputFiles, setOutputFiles] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [xmlString, setXmlString] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [activeTab, setActiveTab] = useState("report");
  const [progress, setProgress] = useState({ step: "", current: 0, total: 0 });
  const [expandedCalc, setExpandedCalc] = useState(null);
  const [zipping, setZipping] = useState(false);
  const fileRef = useRef();

  const addLog = (msg, type = "info") => setLog((l) => [...l, { msg, type, ts: Date.now() }]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setSelectedFile(file.name);
    setStage("parsing");
    setLog([]);
    addLog(`Parsing ${file.name}...`);

    try {
      let xmlText;
      if (file.name.endsWith(".twbx")) {
        addLog("Detected .twbx — extracting XML...", "info");
        // For demo, treat as XML (in prod, use JSZip to unzip)
        xmlText = await file.text();
      } else {
        xmlText = await file.text();
      }

      const { calcs: parsed, internalIdMap } = parseTWB(xmlText);
      setXmlString(xmlText);
      addLog(`Found ${parsed.length} unique calculated fields`, "success");

      // Classify
      const classified = parsed.map((c) => ({
        ...c,
        complexity: classify(c.formula, c.calcClass),
        dependsOn: findDependencies(c.formula, internalIdMap),
        _idMap: internalIdMap,
      }));

      const counts = { simple: 0, moderate: 0, complex: 0, untranslatable: 0, skip: 0 };
      classified.forEach((c) => counts[c.complexity]++);
      addLog(
        `Classified: ${counts.simple} simple, ${counts.moderate} moderate, ${counts.complex} complex, ${counts.untranslatable} untranslatable, ${counts.skip} skipped`,
        "info"
      );

      // Rule-based translation pass
      const withRuleTranslation = classified.map((c) => {
        if (["skip", "untranslatable"].includes(c.complexity)) return c;
        const ruleSql = ruleBasedTranslate(c.formula, internalIdMap);
        const { needs, reasons } = needsClaude(c, ruleSql);
        return { ...c, ruleSql, needsClaude: needs, claudeReasons: reasons };
      });

      const needsClaudeCount = withRuleTranslation.filter((c) => c.needsClaude).length;
      addLog(`Rule-based translation complete. ${needsClaudeCount} calcs flagged for AI refinement.`, "info");

      // Run privacy scan
      const scan = scanTWB(xmlText);
      setScanResults(scan);

      setCalcs(withRuleTranslation);
      setStage("scan");
    } catch (err) {
      addLog(`Error: ${err.message}`, "error");
      setStage("upload");
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const runTranslation = useCallback(async () => {
    setStage("translating");
    addLog("Starting full translation...");

    const toTranslate = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity));
    const forClaude = toTranslate.filter((c) => c.needsClaude);

    addLog(`Rule-based: ${toTranslate.length - forClaude.length} calcs`, "info");
    addLog(`AI layer: ${forClaude.length} calcs`, "info");

    // Start with rule-based results
    let updatedCalcs = calcs.map((c) => ({
      ...c,
      finalSql: c.ruleSql || null,
      translatedByClaude: false,
      dbtDescription: null,
      aeRecommendations: [],
    }));

    // Claude pass — batch into groups of 8 to keep prompts manageable
    if (forClaude.length > 0) {
      const batchSize = 8;
      const batches = [];
      for (let i = 0; i < forClaude.length; i += batchSize) {
        batches.push(forClaude.slice(i, i + batchSize));
      }

      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        setProgress({ step: "AI refinement", current: bi + 1, total: batches.length });
        addLog(`AI batch ${bi + 1}/${batches.length} (${batch.length} calcs)...`, "info");

        try {
          const results = await claudeTranslate(batch, "Snowflake");
          results.forEach((r) => {
            const origCalc = batch[r.calc_index];
            if (!origCalc) return;
            updatedCalcs = updatedCalcs.map((c) =>
              c.caption === origCalc.caption && c.formula === origCalc.formula
                ? {
                    ...c,
                    finalSql: r.sql_expression || c.ruleSql,
                    translatedByClaude: true,
                    dbtDescription: r.dbt_description,
                    aeRecommendations: r.ae_recommendations || [],
                    claudeConfidence: r.confidence,
                    whatChanged: r.what_changed,
                  }
                : c
            );
          });
          addLog(`Batch ${bi + 1} complete ✓`, "success");
        } catch (err) {
          addLog(`Batch ${bi + 1} failed: ${err.message} — using rule-based fallback`, "warning");
        }
      }
    }

    setCalcs(updatedCalcs);

    // Generate output files
    addLog("Generating output files...", "info");
    const files = await buildZip(updatedCalcs, xmlString);
    if (files["sources.yml"]) addLog("sources.yml generated ✓", "success");
    setOutputFiles(files);

    const translatedCount = updatedCalcs.filter(
      (c) => c.finalSql && !["skip", "untranslatable"].includes(c.complexity)
    ).length;
    addLog(`Done! ${translatedCount} models ready for dbt.`, "success");
    setActiveTab("report");
    setStage("results");
  }, [calcs]);

  const downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── STYLES ──────────────────────────────────────────────────────
  const styles = {
    app: {
      minHeight: "100vh",
      background: "linear-gradient(160deg, #030f0a 0%, #071a12 55%, #071e2a 100%)",
      color: "#e2ede8",
      fontFamily: "'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace",
      padding: "0",
    },
    header: {
      borderBottom: "1px solid #0d2b1e",
      padding: "20px 32px",
      display: "flex",
      alignItems: "center",
      gap: "16px",
      background: "rgba(7,26,18,0.9)",
      backdropFilter: "blur(12px)",
      position: "sticky",
      top: 0,
      zIndex: 100,
    },
    logo: {
      fontSize: "13px",
      fontWeight: 700,
      color: "#f0f0f0",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
    logoAccent: { color: "#34d399" },
    tagline: { fontSize: "11px", color: "#4b5563", marginLeft: "auto" },
    main: { padding: "40px 32px", maxWidth: "1100px", margin: "0 auto" },
    section: { marginBottom: "32px" },
    h2: {
      fontSize: "13px",
      fontWeight: 700,
      color: "#9ca3af",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      marginBottom: "16px",
    },
    dropzone: {
      border: "1.5px dashed #0d4a2e",
      borderRadius: "8px",
      padding: "60px 40px",
      textAlign: "center",
      cursor: "pointer",
      transition: "all 0.2s",
      background: "#0a1f15",
    },
    dropzoneHover: { borderColor: "#34d399", background: "#071e14", boxShadow: "0 0 24px #05966922" },
    dropTitle: { fontSize: "18px", fontWeight: 600, color: "#e0e0e0", marginBottom: "8px" },
    dropSub: { fontSize: "12px", color: "#4b5563" },
    btn: {
      background: "linear-gradient(135deg, #059669, #0891b2)",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      padding: "10px 22px",
      fontSize: "12px",
      fontWeight: 700,
      cursor: "pointer",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      transition: "opacity 0.15s",
      boxShadow: "0 2px 12px #05966933",
    },
    btnSecondary: {
      background: "transparent",
      color: "#34d399",
      border: "1px solid #0d4a2e",
      borderRadius: "6px",
      padding: "8px 16px",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
      letterSpacing: "0.04em",
    },
    card: {
      background: "#0a1f15",
      border: "1px solid #0d2b1e",
      borderRadius: "8px",
      padding: "20px 24px",
      marginBottom: "12px",
    },
    statsRow: { display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" },
    statCard: {
      background: "#0a1f15",
      border: "1px solid #0d2b1e",
      borderRadius: "8px",
      padding: "16px 20px",
      flex: "1",
      minWidth: "120px",
    },
    statNum: { fontSize: "28px", fontWeight: 700, color: "#34d399", lineHeight: 1 },
    statLabel: { fontSize: "10px", color: "#4b5563", marginTop: "4px", letterSpacing: "0.06em", textTransform: "uppercase" },
    calcRow: {
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
      padding: "12px 16px",
      background: "#071a12",
      border: "1px solid #0d2b1e",
      borderRadius: "6px",
      marginBottom: "6px",
      cursor: "pointer",
      transition: "border-color 0.15s",
    },
    calcName: { fontSize: "13px", fontWeight: 600, color: "#d1d5db", flex: 1 },
    calcFormula: { fontSize: "11px", color: "#4b5563", marginTop: "4px", fontFamily: "monospace" },
    log: {
      background: "#040d08",
      border: "1px solid #0d2b1e",
      borderRadius: "6px",
      padding: "16px",
      maxHeight: "200px",
      overflowY: "auto",
      fontSize: "11px",
      fontFamily: "monospace",
    },
    logLine: { marginBottom: "4px", lineHeight: 1.5 },
    tabs: { display: "flex", gap: "0", borderBottom: "1px solid #0d2b1e", marginBottom: "20px" },
    tab: {
      padding: "10px 20px",
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      cursor: "pointer",
      color: "#4b5563",
      borderBottom: "2px solid transparent",
      background: "none",
      border: "none",
      marginBottom: "-1px",
    },
    tabActive: { color: "#34d399", borderBottom: "2px solid #34d399" },
    code: {
      background: "#040d08",
      border: "1px solid #0d2b1e",
      borderRadius: "6px",
      padding: "16px",
      fontSize: "11px",
      fontFamily: "monospace",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      maxHeight: "500px",
      overflowY: "auto",
      color: "#67e8f9",
    },
    fileList: { display: "flex", flexDirection: "column", gap: "8px" },
    fileItem: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 14px",
      background: "#071a12",
      border: "1px solid #0d2b1e",
      borderRadius: "6px",
    },
    fileName: { flex: 1, fontSize: "12px", color: "#9ca3af", fontFamily: "monospace" },
  };

  const logColors = { info: "#6b7280", success: "#34d399", error: "#f87171", warning: "#fbbf24" };

  const translatable = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity));
  const untranslatable = calcs.filter((c) => c.complexity === "untranslatable");
  const skipped = calcs.filter((c) => c.complexity === "skip");
  const claudeCount = calcs.filter((c) => c.needsClaude).length;

  // ── RENDER ──────────────────────────────────────────────────────
  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.logo}>
            tableau<span style={styles.logoAccent}> → </span>dbt
          </div>
          <div style={{ fontSize: "10px", color: "#34d39966", marginTop: "2px" }}>Calculated Field Exporter</div>
        </div>
        {selectedFile && (
          <div style={{ fontSize: "11px", color: "#34d399", background: "#05966912", border: "1px solid #05966930", borderRadius: "4px", padding: "4px 10px" }}>
            {selectedFile}
          </div>
        )}
        <div style={styles.tagline}>Turn Tableau business logic into documented dbt metrics</div>
      </div>

      <div style={styles.main}>
        {/* ── UPLOAD ── */}
        {stage === "upload" && (
          <div>
            <div style={{ marginBottom: "32px" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#f0f0f0", marginBottom: "8px" }}>
                Upload your Tableau workbook
              </div>
              <div style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.6 }}>
                Drop a <span style={{ color: "#34d399" }}>.twb</span> or <span style={{ color: "#34d399" }}>.twbx</span> file.
                We parse the calculated fields, classify complexity, and export production-ready dbt models with Snowflake SQL.
              </div>
            </div>

            <div
              style={styles.dropzone}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>⬆</div>
              <div style={styles.dropTitle}>Drop .twb or .twbx here</div>
              <div style={styles.dropSub}>or click to browse — workbook data stays in your browser</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".twb,.twbx"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />

            <div style={{ display: "flex", gap: "24px", marginTop: "32px" }}>
              {[
                { icon: "🔍", label: "Parses XML", desc: "Extracts all calculated fields from TWB/TWBX" },
                { icon: "🔗", label: "Resolves deps", desc: "Maps internal Calculation_XXXX refs to human names" },
                { icon: "✨", label: "AI-refined", desc: "AI pass on complex calcs — intent, not just syntax" },
                { icon: "📦", label: "dbt-ready output", desc: "SQL models + schema.yml + translation report" },
              ].map((f) => (
                <div key={f.label} style={{ flex: 1, ...styles.card }}>
                  <div style={{ fontSize: "20px", marginBottom: "8px" }}>{f.icon}</div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#d1d5db", marginBottom: "4px" }}>{f.label}</div>
                  <div style={{ fontSize: "11px", color: "#4b5563" }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PARSING ── */}
        {stage === "parsing" && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px", animation: "spin 1s linear infinite" }}>⚙</div>
            <div style={{ fontSize: "16px", color: "#d1d5db", marginBottom: "24px" }}>Parsing workbook...</div>
            <div style={styles.log}>
              {log.map((l, i) => (
                <div key={i} style={{ ...styles.logLine, color: logColors[l.type] || "#6b7280" }}>
                  {l.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SCAN ── */}
        {stage === "scan" && scanResults && (
          <div style={{ position: "relative" }}>
            <div style={{ position: "relative", maxWidth: "600px", margin: "0 auto" }}>
              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ width: "60px", height: "60px", margin: "0 auto 16px", background: "linear-gradient(135deg, #059669, #0891b2)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", boxShadow: "0 8px 28px #05966944" }}>🔍</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#f0fdf4", marginBottom: "6px" }}>Privacy Scan Complete</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  <span style={{ color: "#34d399" }}>{selectedFile}</span> · {scanResults.staysInBrowser.length} local items · {scanResults.translatableCount} formulas to translate
                </div>
              </div>

              {/* Card: Stays in browser */}
              <div style={{ background: "rgba(5,150,105,0.07)", backdropFilter: "blur(12px)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: "12px", padding: "18px 20px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  <div style={{ width: "28px", height: "28px", background: "#05966922", border: "1px solid #05966955", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>🔒</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#ecfdf5" }}>Stays in your browser</div>
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>Connection metadata — never transmitted</div>
                  </div>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#34d399", background: "#05966918", border: "1px solid #05966940", borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>BROWSER ONLY</div>
                </div>
                {scanResults.staysInBrowser.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "#4b5563", fontStyle: "italic" }}>No connection strings or server paths detected</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {scanResults.staysInBrowser.map((f, i) => (
                      <div key={i} style={{ background: "rgba(5,150,105,0.05)", border: "1px solid rgba(5,150,105,0.15)", borderRadius: "6px", padding: "6px 10px" }}>
                        <div style={{ fontSize: "9px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>{f.type}</div>
                        <div style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace" }}>{f.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Card: Flagged */}
              {scanResults.flagged.length > 0 && (
                <div style={{ background: "rgba(245,158,11,0.06)", backdropFilter: "blur(12px)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: "12px", padding: "18px 20px", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ width: "28px", height: "28px", background: "#d9770622", border: "1px solid #d9770655", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>⚠️</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#fcd34d" }}>Possible client names detected</div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>In parameter defaults — classified as skip, not sent to AI</div>
                    </div>
                    <div style={{ fontSize: "9px", fontWeight: 700, color: "#fbbf24", background: "rgba(245,158,11,0.09)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>NOT SENT</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {scanResults.flagged.map((f, i) => (
                      <div key={i} style={{ fontSize: "11px", color: "#fcd34d", fontFamily: "monospace", padding: "6px 10px", background: "rgba(245,158,11,0.06)", borderRadius: "5px", opacity: 0.9 }}>
                        <span style={{ opacity: 0.5 }}>{f.caption}: </span>{f.value.length > 60 ? f.value.slice(0, 57) + "…" : f.value}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Card: Sent to AI */}
              <div style={{ background: "rgba(8,145,178,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(8,145,178,0.22)", borderRadius: "12px", padding: "18px 20px", marginBottom: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", background: "#0891b222", border: "1px solid #0891b255", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>✨</div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#67e8f9" }}>Sent to AI for translation</div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>Formula logic only — no connection data</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "32px", fontWeight: 700, color: "#2dd4bf", lineHeight: 1 }}>{scanResults.translatableCount}</div>
                </div>
                <div style={{ padding: "9px 12px", background: "rgba(8,145,178,0.05)", border: "1px solid rgba(8,145,178,0.12)", borderRadius: "6px", fontSize: "11px", color: "#6b7280", lineHeight: 1.6 }}>
                  The AI receives only formula logic — e.g.{" "}
                  <code style={{ color: "#67e8f9", background: "rgba(8,145,178,0.12)", padding: "1px 5px", borderRadius: "3px" }}>IIF([Survey Q8] &gt; 8, 1, 0)</code>
                  . No table names, server addresses, or credentials included.
                </div>
              </div>

              {/* CTAs */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={{ flex: 1, padding: "14px", background: "linear-gradient(135deg, #059669, #0891b2)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 4px 20px #05966944" }}
                  onClick={() => setStage("preview")}
                >
                  Looks good — continue to preview →
                </button>
                <button
                  style={{ padding: "14px 20px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "#6b7280", fontSize: "13px", cursor: "pointer" }}
                  onClick={() => { setStage("upload"); setCalcs([]); setScanResults(null); setSelectedFile(null); setXmlString(null); setLog([]); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {stage === "preview" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f0" }}>Ready to translate</div>
                <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "4px" }}>Review the field breakdown, then run the full export</div>
              </div>
              <button style={styles.btn} onClick={runTranslation}>
                Run Export →
              </button>
            </div>

            {/* Stats */}
            <div style={styles.statsRow}>
              {[
                { num: translatable.filter((c) => c.complexity === "simple").length, label: "Simple", color: "#34d399" },
                { num: translatable.filter((c) => c.complexity === "moderate").length, label: "Moderate", color: "#67e8f9" },
                { num: translatable.filter((c) => c.complexity === "complex").length, label: "Complex", color: "#fbbf24" },
                { num: claudeCount, label: "AI layer", color: "#2dd4bf" },
                { num: untranslatable.length, label: "Untranslatable", color: "#f87171" },
                { num: skipped.length, label: "Skipped", color: "#4b5563" },
              ].map((s) => (
                <div key={s.label} style={styles.statCard}>
                  <div style={{ ...styles.statNum, color: s.color }}>{s.num}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Calc list */}
            <div style={styles.h2}>Calculated Fields</div>
            {calcs
              .filter((c) => c.complexity !== "skip")
              .map((c, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.calcRow,
                    borderColor: expandedCalc === i ? "#2d3a5c" : "#0d2b1e",
                  }}
                  onClick={() => setExpandedCalc(expandedCalc === i ? null : i)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={styles.calcName}>{c.caption}</span>
                      <Badge type={c.complexity} />
                      {c.needsClaude && <Badge type="complex" label="✨ AI" />}
                      {c.dependsOn?.length > 0 && <Badge type="simple" label={`deps:${c.dependsOn.length}`} />}
                    </div>
                    {expandedCalc === i && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "10px", color: "#4b5563", marginBottom: "4px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Formula</div>
                        <div style={{ ...styles.code, maxHeight: "120px", fontSize: "11px", color: "#9ca3af" }}>
                          {c.formula}
                        </div>
                        {c.claudeReasons?.length > 0 && (
                          <div style={{ marginTop: "8px", fontSize: "11px", color: "#34d399" }}>
                            AI flags: {c.claudeReasons.join(" · ")}
                          </div>
                        )}
                        {c.dependsOn?.length > 0 && (
                          <div style={{ marginTop: "4px", fontSize: "11px", color: "#fbbf24" }}>
                            Depends on: {c.dependsOn.join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* ── TRANSLATING ── */}
        {stage === "translating" && (
          <div style={{ padding: "60px 0" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f0", marginBottom: "8px" }}>
              Translating...
            </div>
            {progress.total > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "6px" }}>
                  {progress.step} — {progress.current}/{progress.total}
                </div>
                <ProgressBar value={progress.current} max={progress.total} />
              </div>
            )}
            <div style={styles.log}>
              {log.map((l, i) => (
                <div key={i} style={{ ...styles.logLine, color: logColors[l.type] || "#6b7280" }}>
                  {l.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {stage === "results" && outputFiles && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f0" }}>
                  Export ready ✓
                </div>
                <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "4px" }}>
                  {Object.keys(outputFiles).length} files generated
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={{ ...styles.btn, background: zipping ? "#0d2b1e" : "linear-gradient(135deg, #059669, #0891b2)", opacity: zipping ? 0.6 : 1 }}
                  disabled={zipping}
                  onClick={async () => {
                    setZipping(true);
                    const ok = await downloadAllAsZip(outputFiles, selectedFile?.replace(/\.(twb|twbx)$/i, ""));
                    if (!ok) alert("Zip failed — use individual file downloads below.");
                    setZipping(false);
                  }}
                >
                  {zipping ? "Zipping..." : "⬇ Download All (.zip)"}
                </button>
                <button
                  style={styles.btnSecondary}
                  onClick={() => {
                    setStage("upload");
                    setCalcs([]);
                    setOutputFiles(null);
                    setSelectedFile(null);
                    setXmlString(null);
                    setScanResults(null);
                    setLog([]);
                  }}
                >
                  New Workbook
                </button>
              </div>
            </div>

            {/* Stats */}
            <div style={styles.statsRow}>
              {[
                { num: calcs.filter((c) => c.finalSql).length, label: "Models generated", color: "#34d399" },
                { num: calcs.filter((c) => c.translatedByClaude).length, label: "AI-refined", color: "#34d399" },
                { num: calcs.filter((c) => c.dependsOn?.length).length, label: "Dep chains resolved", color: "#fbbf24" },
                { num: calcs.filter((c) => c.complexity === "untranslatable").length, label: "Untranslatable", color: "#f87171" },
              ].map((s) => (
                <div key={s.label} style={styles.statCard}>
                  <div style={{ ...styles.statNum, color: s.color }}>{s.num}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
              {["report", "models", "schema", "sources"].map((t) => (
                <button
                  key={t}
                  style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab(t)}
                >
                  {t === "report" ? "Translation Report"
                    : t === "models" ? "SQL Models"
                    : t === "schema" ? "schema.yml"
                    : "sources.yml"}
                </button>
              ))}
            </div>

            {activeTab === "report" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                  <button style={styles.btnSecondary} onClick={() => downloadFile("translation_report.md", outputFiles["translation_report.md"])}>
                    Download .md
                  </button>
                </div>
                <div style={styles.code}>{outputFiles["translation_report.md"]}</div>
              </div>
            )}

            {activeTab === "models" && (
              <div>
                <div style={styles.fileList}>
                  {Object.entries(outputFiles)
                    .filter(([k]) => k.endsWith(".sql"))
                    .map(([filename, content]) => {
                      const calc = calcs.find((c) => `models/${c.slug}.sql` === filename);
                      return (
                        <div key={filename}>
                          <div style={styles.fileItem}>
                            <span style={styles.fileName}>{filename}</span>
                            {calc?.translatedByClaude && <Badge type="complex" label="✨ AI" />}
                            {calc?.complexity && <Badge type={calc.complexity} />}
                            <button style={styles.btnSecondary} onClick={() => downloadFile(filename.split("/")[1], content)}>
                              Download
                            </button>
                          </div>
                          {calc?.translatedByClaude && calc.aeRecommendations?.length > 0 && (
                            <div style={{ padding: "8px 14px", background: "#071a12", borderLeft: "2px solid #059669", marginBottom: "6px", fontSize: "11px", color: "#34d399" }}>
                              AE Notes: {calc.aeRecommendations.join(" · ")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {activeTab === "schema" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                  <button style={styles.btnSecondary} onClick={() => downloadFile("schema.yml", outputFiles["schema.yml"])}>
                    Download schema.yml
                  </button>
                </div>
                <div style={styles.code}>{outputFiles["schema.yml"]}</div>
              </div>
            )}

            {activeTab === "sources" && (
              <div>
                <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#071e2a", border: "1px solid #0891b230", borderRadius: "6px", borderLeft: "3px solid #0891b2" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#67e8f9", marginBottom: "6px" }}>How to use sources.yml</div>
                  <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: 1.7 }}>
                    1. Fill in <code style={{ color: "#2dd4bf" }}>TODO_DATABASE</code>, <code style={{ color: "#2dd4bf" }}>TODO_SCHEMA</code>, and <code style={{ color: "#2dd4bf" }}>TODO_TABLE</code> with your Snowflake values<br/>
                    2. Place this file in your dbt project root alongside <code style={{ color: "#2dd4bf" }}>schema.yml</code><br/>
                    3. Update your SQL models to use <code style={{ color: "#2dd4bf" }}>{"{{ source('datasource_name', 'table_name') }}"}</code> instead of <code style={{ color: "#2dd4bf" }}>{"{{ ref('your_source_model') }}"}</code><br/>
                    4. Run <code style={{ color: "#2dd4bf" }}>dbt source freshness</code> to validate the connection
                  </div>
                </div>
                {outputFiles["sources.yml"] ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                      <button style={styles.btnSecondary} onClick={() => downloadFile("sources.yml", outputFiles["sources.yml"])}>
                        Download sources.yml
                      </button>
                    </div>
                    <div style={styles.code}>{outputFiles["sources.yml"]}</div>
                  </>
                ) : (
                  <div style={{ ...styles.code, color: "#4b5563" }}>
                    sources.yml could not be generated — datasource metadata not found in workbook.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #030f0a; }
        ::-webkit-scrollbar-thumb { background: #0d4a2e; border-radius: 2px; }
      `}</style>
    </div>
  );
}
