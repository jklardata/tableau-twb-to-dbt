// ================================================================
// MULTI-WORKBOOK ANALYSIS
// Cross-workbook duplicate detection + migration effort estimation
// ================================================================

// ----------------------------------------------------------------
// DUPLICATE DETECTION
// ----------------------------------------------------------------

export function detectDuplicates(workbooks) {
  // workbooks: [{name: string, fields: [{caption, formula, datasource, ...}]}]
  const byCaption = new Map();

  for (const wb of workbooks) {
    for (const f of wb.fields) {
      const key = f.caption.toLowerCase().trim();
      if (!byCaption.has(key)) byCaption.set(key, []);
      byCaption.get(key).push({
        workbook: wb.name,
        caption: f.caption,
        formula: f.formula,
        datasource: f.datasource,
      });
    }
  }

  const dupes = [];
  for (const [, entries] of byCaption) {
    const workbookSet = new Set(entries.map((e) => e.workbook));
    if (workbookSet.size < 2) continue;

    const uniqueFormulas = [...new Set(entries.map((e) => e.formula.trim()))];
    dupes.push({
      caption: entries[0].caption,
      type: uniqueFormulas.length === 1 ? "identical" : "diverged",
      entries,
      workbookCount: workbookSet.size,
      formulaVariants: uniqueFormulas.length,
      workbooks: [...workbookSet],
      uniqueFormulas,
    });
  }

  // Diverged first (bigger problem), then by workbook spread
  return dupes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "diverged" ? -1 : 1;
    return b.workbookCount - a.workbookCount;
  });
}

// ----------------------------------------------------------------
// MIGRATION EFFORT ESTIMATION
// ----------------------------------------------------------------

export const EFFORT_CONFIG = {
  low: {
    label: "Low",
    min: 0.25,
    max: 0.5,
    color: "#22c55e",
    bg: "#f0fdf4",
    text: "#166534",
    border: "#86efac",
    desc: "Simple aggregates, basic math, string ops — likely auto-convertible",
  },
  medium: {
    label: "Medium",
    min: 1,
    max: 2,
    color: "#f59e0b",
    bg: "#fffbeb",
    text: "#92400e",
    border: "#fcd34d",
    desc: "Multi-condition logic, date calculations, nested IFs — needs review",
  },
  high: {
    label: "High",
    min: 4,
    max: 8,
    color: "#ef4444",
    bg: "#fef2f2",
    text: "#991b1b",
    border: "#fca5a5",
    desc: "LOD expressions, table calcs, window functions — manual translation required",
  },
};

export function estimateEffort(workbooks) {
  // workbooks: [{name: string, fields: [{caption, complexity_label, formula, ...}]}]
  const tiers = { low: [], medium: [], high: [] };

  for (const wb of workbooks) {
    for (const f of wb.fields) {
      const tier = f.complexity_label || "medium";
      if (tiers[tier]) tiers[tier].push({ ...f, workbook: wb.name });
    }
  }

  let totalMin = 0, totalMax = 0;
  for (const [tier, fields] of Object.entries(tiers)) {
    const cfg = EFFORT_CONFIG[tier];
    if (cfg) {
      totalMin += fields.length * cfg.min;
      totalMax += fields.length * cfg.max;
    }
  }

  // Per-workbook breakdown
  const byWorkbook = {};
  for (const wb of workbooks) {
    const counts = { low: 0, medium: 0, high: 0 };
    for (const f of wb.fields) {
      const tier = f.complexity_label || "medium";
      if (counts[tier] !== undefined) counts[tier]++;
    }
    const wbMin = counts.low * 0.25 + counts.medium * 1 + counts.high * 4;
    const wbMax = counts.low * 0.5 + counts.medium * 2 + counts.high * 8;
    byWorkbook[wb.name] = {
      ...counts,
      total: wb.fields.length,
      minHours: +wbMin.toFixed(1),
      maxHours: +wbMax.toFixed(1),
    };
  }

  return { tiers, totalMin: +totalMin.toFixed(1), totalMax: +totalMax.toFixed(1), byWorkbook };
}

// ----------------------------------------------------------------
// SUMMARY STATS
// ----------------------------------------------------------------

export function summarizePortfolio(workbooks) {
  const totalFields = workbooks.reduce((sum, wb) => sum + wb.fields.length, 0);
  const totalIssues = workbooks.reduce(
    (sum, wb) => sum + wb.fields.reduce((s, f) => s + f.issues.length, 0),
    0
  );
  const totalUnused = workbooks.reduce(
    (sum, wb) => sum + wb.fields.filter((f) => f.unused).length,
    0
  );
  return { totalFields, totalIssues, totalUnused };
}
