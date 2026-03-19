import JSZip from "jszip";

// ================================================================
// FILE LOADING
// ================================================================

async function loadXML(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".twbx")) {
    const zip = await JSZip.loadAsync(file);
    const twbEntry = Object.values(zip.files).find((f) => f.name.endsWith(".twb") && !f.dir);
    if (!twbEntry) throw new Error("No .twb found inside the .twbx archive");
    return await twbEntry.async("string");
  } else if (name.endsWith(".twb")) {
    return await file.text();
  } else {
    throw new Error("Only .twb and .twbx files are supported");
  }
}

// ================================================================
// NORMALIZATION
// ================================================================

function normalize(name) {
  return (name || "").replace(/^\[|\]$/g, "").toLowerCase().trim();
}

function extractDeps(formula) {
  const matches = formula.match(/\[([^\]]+)\]/g) || [];
  const deps = new Set();
  for (const m of matches) {
    const n = m.slice(1, -1).trim();
    if (n && n !== "Parameters" && !n.startsWith("Parameters")) deps.add(normalize(n));
  }
  return [...deps];
}

// ================================================================
// EXTRACTION
// ================================================================

function extractCalcFields(doc) {
  const seen = new Set();
  const fields = [];
  doc.querySelectorAll("datasource").forEach((ds) => {
    const dsName = ds.getAttribute("name") || "";
    if (dsName === "Parameters") return;
    const dsCaption = ds.getAttribute("caption") || dsName;
    ds.querySelectorAll("column").forEach((col) => {
      const calc = col.querySelector("calculation");
      if (!calc) return;
      const formula = calc.getAttribute("formula");
      if (!formula) return;
      const name = col.getAttribute("name") || "";
      const caption = col.getAttribute("caption") || name.replace(/^\[|\]$/g, "");
      const key = `${name}||${formula.slice(0, 80)}`;
      if (seen.has(key)) return;
      seen.add(key);
      fields.push({ name, caption, formula, datatype: col.getAttribute("datatype") || "string", role: col.getAttribute("role") || "measure", datasource: dsCaption });
    });
  });
  return fields;
}

function extractSheetRefs(doc) {
  const refs = new Set();
  doc.querySelectorAll("worksheet filter").forEach((f) => {
    const col = f.getAttribute("column");
    if (col) refs.add(normalize(col));
  });
  doc.querySelectorAll("datasource-dependencies column").forEach((col) => {
    const n = col.getAttribute("name");
    if (n) refs.add(normalize(n));
  });
  doc.querySelectorAll("rows, cols").forEach((el) => {
    (el.textContent.match(/\[([^\]]+)\]/g) || []).forEach((m) => refs.add(normalize(m)));
  });
  return refs;
}

// ================================================================
// CHECKS
// ================================================================

function calcNestingDepth(formula) {
  let depth = 0, max = 0;
  for (const ch of formula) {
    if (ch === "(") { depth++; if (depth > max) max = depth; }
    else if (ch === ")") depth--;
  }
  return max;
}

const PERF_RULES = [
  {
    id: "nested_lod",
    severity: "error",
    test: (f) => /\{[^}]*\{FIXED/i.test(f) || (f.match(/\{FIXED/gi) || []).length > 1,
    message: "Nested LOD expressions cause query fan-out. Extract the inner LOD to a separate field.",
  },
  {
    id: "window_non_additive",
    severity: "warning",
    test: (f) => /WINDOW_(SUM|AVG|COUNT)\s*\([^)]*\b(COUNTD|AVG)\b/i.test(f),
    message: "WINDOW functions wrapping non-additive measures (COUNTD, AVG) may return incorrect results.",
  },
  {
    id: "long_if_chain",
    severity: "warning",
    test: (f) => (f.match(/\bELSEIF\b/gi) || []).length >= 4,
    message: "Long IF/ELSEIF chains hurt performance. Consider a CASE statement or lookup table.",
  },
  {
    id: "division_no_null_protection",
    severity: "warning",
    test: (f) => /\//.test(f) && !/\bZN\s*\(|\bNULLIF\s*\(/i.test(f),
    message: "Division without ZN() or NULLIF() protection will produce Null when the denominator is zero.",
  },
  {
    id: "hardcoded_datetrunc",
    severity: "info",
    test: (f) => /\bDATETRUNC\s*\(\s*['"][^'"]+['"]/i.test(f),
    message: "Hardcoded DATETRUNC granularity makes this field inflexible. Consider driving it with a parameter.",
  },
  {
    id: "total_complex",
    severity: "warning",
    test: (f) => /\bTOTAL\s*\([^)]*\b(SUM|AVG|COUNT|MAX|MIN)\b/i.test(f),
    message: "TOTAL() wrapping complex expressions can cause unexpected scope behavior.",
  },
];

function detectCircular(fields) {
  const adj = {};
  const nameMap = {};
  for (const f of fields) {
    const key = normalize(f.name || f.caption);
    adj[key] = extractDeps(f.formula);
    nameMap[key] = f.caption;
  }
  const inCycle = new Set();
  const cycleMessages = {};
  for (const start of Object.keys(adj)) {
    const stack = [[start, [start]]];
    while (stack.length > 0) {
      const [node, path] = stack.pop();
      for (const dep of adj[node] || []) {
        const idx = path.indexOf(dep);
        if (idx !== -1) {
          const loop = path.slice(idx);
          for (const c of loop) {
            inCycle.add(c);
            if (!cycleMessages[c]) {
              cycleMessages[c] = [...loop, loop[0]].map((k) => nameMap[k] || k).join(" -> ");
            }
          }
        } else if (adj[dep] && path.length < 20) {
          stack.push([dep, [...path, dep]]);
        }
      }
    }
  }
  return { inCycle, cycleMessages };
}

function countFunctions(formula) {
  return new Set((formula.match(/\b[A-Z_][A-Z0-9_]+\s*\(/g) || []).map((f) => f.replace(/\s*\($/, ""))).size;
}

function calcComplexity(formula, nestingDepth, depCount, issueCount) {
  let score = 0;
  if (formula.length > 500) score += 20;
  else if (formula.length > 200) score += 10;
  else if (formula.length > 100) score += 5;
  score += Math.min(nestingDepth * 3, 25);
  score += Math.min(depCount * 2, 20);
  score += Math.min(countFunctions(formula) * 2, 20);
  score += Math.min(issueCount * 5, 15);
  score = Math.min(100, score);
  const label = score <= 25 ? "simple" : score <= 50 ? "moderate" : score <= 75 ? "complex" : "critical";
  return { score, label };
}

// ================================================================
// MAIN EXPORT
// ================================================================

export async function auditWorkbook(file) {
  const xmlString = await loadXML(file);
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Could not parse workbook XML");

  const rawFields = extractCalcFields(doc);
  const sheetRefs = extractSheetRefs(doc);

  // All names referenced in other formulas
  const formulaRefs = new Set();
  for (const f of rawFields) {
    for (const dep of extractDeps(f.formula)) formulaRefs.add(dep);
  }

  const { inCycle, cycleMessages } = detectCircular(rawFields);

  const auditedFields = rawFields.map((f) => {
    const normName = normalize(f.name);
    const normCaption = normalize(f.caption);
    const deps = extractDeps(f.formula);
    const nestingDepth = calcNestingDepth(f.formula);
    const issues = [];

    // Unused
    const isUsed = sheetRefs.has(normName) || sheetRefs.has(normCaption) || formulaRefs.has(normName) || formulaRefs.has(normCaption);
    if (!isUsed) {
      issues.push({ type: "unused", severity: "warning", rule: "unused_field", message: "This field is defined but not referenced in any sheet or formula." });
    }

    // Nesting
    if (nestingDepth >= 7) {
      issues.push({ type: "nesting", severity: "error", rule: "excessive_nesting", message: `Formula has excessive nesting (depth ${nestingDepth}). Consider breaking into intermediate fields.` });
    } else if (nestingDepth >= 4) {
      issues.push({ type: "nesting", severity: "warning", rule: "deep_nesting", message: `Formula has deep nesting (depth ${nestingDepth}) which reduces readability.` });
    }

    // Performance
    for (const rule of PERF_RULES) {
      if (rule.test(f.formula)) {
        issues.push({ type: "performance", severity: rule.severity, rule: rule.id, message: rule.message });
      }
    }

    // Circular
    const isCircular = inCycle.has(normName) || inCycle.has(normCaption);
    if (isCircular) {
      const path = cycleMessages[normName] || cycleMessages[normCaption] || "cycle detected";
      issues.push({ type: "circular", severity: "error", rule: "circular_dependency", message: `Circular dependency detected: ${path}. This will cause Tableau errors.` });
    }

    const { score, label } = calcComplexity(f.formula, nestingDepth, deps.length, issues.length);

    return { name: f.name, caption: f.caption, datasource: f.datasource, formula: f.formula, complexity_score: score, complexity_label: label, nesting_depth: nestingDepth, dependency_count: deps.length, dependencies: deps, unused: !isUsed, circular: isCircular, issues };
  });

  const errorCount = auditedFields.reduce((s, f) => s + f.issues.filter((i) => i.severity === "error").length, 0);
  const warningCount = auditedFields.reduce((s, f) => s + f.issues.filter((i) => i.severity === "warning").length, 0);
  const infoCount = auditedFields.reduce((s, f) => s + f.issues.filter((i) => i.severity === "info").length, 0);
  const healthScore = Math.max(0, Math.min(100, 100 - errorCount * 10 - warningCount * 3 - infoCount));

  return {
    meta: {
      workbook_name: file.name,
      audited_at: new Date().toISOString(),
      total_calculated_fields: auditedFields.length,
      total_issues: errorCount + warningCount + infoCount,
      issue_breakdown: { error: errorCount, warning: warningCount, info: infoCount },
      health_score: healthScore,
    },
    summary: {
      unused_fields: auditedFields.filter((f) => f.unused).length,
      circular_dependencies: auditedFields.filter((f) => f.circular).length,
      performance_issues: auditedFields.reduce((s, f) => s + f.issues.filter((i) => i.type === "performance").length, 0),
      high_complexity_fields: auditedFields.filter((f) => ["complex", "critical"].includes(f.complexity_label)).length,
      fields_needing_attention: auditedFields.filter((f) => f.issues.length > 0).length,
    },
    fields: auditedFields,
  };
}
