import JSZip from "jszip";

// ================================================================
// XML PARSING
// ================================================================

function parseTWBXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");

  // Calculated fields (from all datasources except Parameters)
  const calcFields = {};
  doc.querySelectorAll("datasource").forEach((ds) => {
    const dsName = ds.getAttribute("name") || "";
    if (dsName === "Parameters") return;
    ds.querySelectorAll("column").forEach((col) => {
      const calc = col.querySelector("calculation");
      if (!calc) return;
      const formula = calc.getAttribute("formula");
      if (!formula) return;
      const caption = col.getAttribute("caption") || col.getAttribute("name") || "";
      const name = caption.replace(/^\[|\]$/g, "").trim();
      if (!name) return;
      calcFields[name] = {
        name,
        formula,
        datatype: col.getAttribute("datatype") || "",
        role: col.getAttribute("role") || "",
      };
    });
  });

  // Parameters datasource
  const params = {};
  doc.querySelectorAll("datasource[name='Parameters'] column").forEach((col) => {
    const caption = col.getAttribute("caption") || col.getAttribute("name") || "";
    const name = caption.replace(/^\[|\]$/g, "").trim();
    if (!name) return;
    const calc = col.querySelector("calculation");
    params[name] = {
      name,
      datatype: col.getAttribute("datatype") || "",
      value: calc ? calc.getAttribute("value") || calc.getAttribute("formula") || "" : "",
      domainType: col.getAttribute("param-domain-type") || "",
    };
  });

  // Data sources
  const dataSources = {};
  doc.querySelectorAll("datasource").forEach((ds) => {
    const name = ds.getAttribute("name") || "";
    if (name === "Parameters") return;
    const caption = ds.getAttribute("caption") || name;
    const conn = ds.querySelector("connection");
    const connType = conn ? conn.getAttribute("class") || "" : "";
    dataSources[name] = { name, caption, connType };
  });

  // Sheets and dashboards
  const sheets = {};
  doc.querySelectorAll("worksheet").forEach((ws) => {
    const name = ws.getAttribute("name") || "";
    if (name) sheets[name] = { name, type: "worksheet" };
  });
  doc.querySelectorAll("dashboard").forEach((db) => {
    const name = db.getAttribute("name") || "";
    if (name) sheets[name] = { name, type: "dashboard" };
  });

  // Filters
  const filters = {};
  doc.querySelectorAll("filter").forEach((f) => {
    const cls = f.getAttribute("class") || "";
    const col = f.getAttribute("column") || "";
    const type = f.getAttribute("type") || "";
    const key = `${col}::${cls}::${type}`;
    filters[key] = { class: cls, column: col, type };
  });

  return { calcFields, params, dataSources, sheets, filters };
}

async function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".twbx")) {
    const zip = await JSZip.loadAsync(file);
    const twbEntry = Object.values(zip.files).find(
      (f) => f.name.endsWith(".twb") && !f.dir
    );
    if (!twbEntry) throw new Error("No .twb found inside the .twbx archive");
    const xml = await twbEntry.async("string");
    return parseTWBXML(xml);
  } else if (name.endsWith(".twb")) {
    const xml = await file.text();
    return parseTWBXML(xml);
  } else {
    throw new Error("Only .twb and .twbx files are supported");
  }
}

// ================================================================
// DIFFING
// ================================================================

function diffMaps(before, after) {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const added = [];
  const removed = [];
  const modified = [];

  for (const key of allKeys) {
    if (!(key in before)) {
      added.push(after[key]);
    } else if (!(key in after)) {
      removed.push(before[key]);
    } else {
      const b = before[key];
      const a = after[key];
      const fieldsBefore = {};
      const fieldsAfter = {};
      let changed = false;
      for (const field of Object.keys(b)) {
        if (b[field] !== a[field]) {
          fieldsBefore[field] = b[field];
          fieldsAfter[field] = a[field];
          changed = true;
        }
      }
      if (changed) {
        modified.push({ name: key, before: b, after: a });
      }
    }
  }

  return { added, removed, modified };
}

// ================================================================
// FORMULA TOKEN DIFF
// ================================================================

export function tokenizeFormula(formula) {
  // Captures: [field references], function/identifier names, numbers, strings, single chars
  return (
    formula.match(/\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*|[0-9]+\.?[0-9]*|"[^"]*"|'[^']*'|\S/g) || []
  );
}

export function diffFormula(before, after) {
  const bTokens = tokenizeFormula(before);
  const aTokens = tokenizeFormula(after);
  const bSet = new Set(bTokens);
  const aSet = new Set(aTokens);

  return {
    before: bTokens.map((t) => ({ token: t, changed: !aSet.has(t) })),
    after: aTokens.map((t) => ({ token: t, changed: !bSet.has(t) })),
  };
}

// ================================================================
// MAIN EXPORT
// ================================================================

export async function diffWorkbooks(file1, file2) {
  const [wb1, wb2] = await Promise.all([parseFile(file1), parseFile(file2)]);

  const calcDiff = diffMaps(wb1.calcFields, wb2.calcFields);
  const paramDiff = diffMaps(wb1.params, wb2.params);
  const dsDiff = diffMaps(wb1.dataSources, wb2.dataSources);
  const sheetDiff = diffMaps(wb1.sheets, wb2.sheets);
  const filterDiff = diffMaps(wb1.filters, wb2.filters);

  const count = (d) => d.added.length + d.removed.length + d.modified.length;
  const totalChanges = count(calcDiff) + count(paramDiff) + count(dsDiff) + count(sheetDiff) + count(filterDiff);

  return {
    summary: {
      total_changes: totalChanges,
      has_changes: totalChanges > 0,
      categories: {
        calculated_fields: { added: calcDiff.added.length, removed: calcDiff.removed.length, modified: calcDiff.modified.length },
        parameters: { added: paramDiff.added.length, removed: paramDiff.removed.length, modified: paramDiff.modified.length },
        data_sources: { added: dsDiff.added.length, removed: dsDiff.removed.length, modified: dsDiff.modified.length },
        sheets: { added: sheetDiff.added.length, removed: sheetDiff.removed.length, modified: sheetDiff.modified.length },
        filters: { added: filterDiff.added.length, removed: filterDiff.removed.length, modified: filterDiff.modified.length },
      },
    },
    calculated_fields: calcDiff,
    parameters: paramDiff,
    data_sources: dsDiff,
    sheets: sheetDiff,
    filters: filterDiff,
    meta: {
      file1_name: file1.name,
      file2_name: file2.name,
      processed_at: new Date().toISOString(),
    },
  };
}
