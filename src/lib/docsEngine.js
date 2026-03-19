import JSZip from "jszip";

// ================================================================
// XML UTILITIES
// ================================================================

function text(el, selector) {
  if (!el) return null;
  const found = el.querySelector(selector);
  return found ? found.textContent.trim() || null : null;
}

function attr(el, name, fallback = null) {
  if (!el) return fallback;
  return el.getAttribute(name) || fallback;
}

function extractDependencies(formula) {
  if (!formula) return [];
  const matches = formula.match(/\[([^\]]+)\]/g) || [];
  const deps = new Set();
  for (const m of matches) {
    const name = m.slice(1, -1).trim();
    // Skip parameter refs like [Parameters].[Param Name]
    if (name !== "Parameters" && !name.startsWith("Parameters")) {
      deps.add(name);
    }
  }
  return [...deps];
}

function getDescription(col) {
  const run = col.querySelector("desc formatted-text run, desc run");
  return run ? run.textContent.trim() || null : null;
}

// ================================================================
// FILE LOADING
// ================================================================

async function loadXML(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".twbx")) {
    const zip = await JSZip.loadAsync(file);
    const twbEntry = Object.values(zip.files).find(
      (f) => f.name.endsWith(".twb") && !f.dir
    );
    if (!twbEntry) throw new Error("No .twb found inside the .twbx archive");
    return await twbEntry.async("string");
  } else if (name.endsWith(".twb")) {
    return await file.text();
  } else {
    throw new Error("Only .twb and .twbx files are supported");
  }
}

// ================================================================
// EXTRACTION
// ================================================================

function extractMeta(doc, file) {
  const root = doc.querySelector("workbook") || doc.documentElement;
  const worksheets = doc.querySelectorAll("worksheet");
  const dashboards = doc.querySelectorAll("dashboard");
  const datasources = [...doc.querySelectorAll("datasource")].filter(
    (ds) => attr(ds, "name") !== "Parameters"
  );
  const calcFields = [...doc.querySelectorAll("datasource:not([name='Parameters']) column")].filter(
    (col) => col.querySelector("calculation")
  );
  const params = [...doc.querySelectorAll("datasource[name='Parameters'] column")];

  return {
    workbook_name: file.name,
    source_build: attr(root, "source-build", "Unknown"),
    source_platform: attr(root, "source-platform", "Unknown"),
    extracted_at: new Date().toISOString(),
    sheet_count: worksheets.length + dashboards.length,
    datasource_count: datasources.length,
    calculated_field_count: calcFields.length,
    parameter_count: params.length,
  };
}

function extractDatasources(doc) {
  const results = [];
  doc.querySelectorAll("datasource").forEach((ds) => {
    const name = attr(ds, "name", "");
    if (name === "Parameters") return;
    const caption = attr(ds, "caption", name);
    const conn = ds.querySelector("connection");
    const fields = [];

    ds.querySelectorAll("column").forEach((col) => {
      const colName = attr(col, "name", "");
      if (!colName) return;
      const calc = col.querySelector("calculation");
      const formula = calc ? attr(calc, "formula") : null;
      fields.push({
        name: colName,
        caption: attr(col, "caption", colName.replace(/^\[|\]$/g, "")),
        datatype: attr(col, "datatype", "string"),
        role: attr(col, "role", "dimension"),
        type: attr(col, "type", "nominal"),
        is_calculated: !!formula,
        formula,
        description: getDescription(col),
        hidden: attr(col, "hidden") === "true",
      });
    });

    results.push({
      name,
      caption,
      connection_type: conn ? attr(conn, "class", "unknown") : "unknown",
      connection_server: conn ? attr(conn, "server") : null,
      connection_dbname: conn ? attr(conn, "dbname") : null,
      fields,
    });
  });
  return results;
}

function extractCalculatedFields(doc) {
  const seen = new Set();
  const results = [];

  doc.querySelectorAll("datasource").forEach((ds) => {
    const dsName = attr(ds, "name", "");
    if (dsName === "Parameters") return;
    const dsCaption = attr(ds, "caption", dsName);

    ds.querySelectorAll("column").forEach((col) => {
      const calc = col.querySelector("calculation");
      if (!calc) return;
      const formula = attr(calc, "formula");
      if (!formula) return;

      const name = attr(col, "name", "");
      const caption = attr(col, "caption", name.replace(/^\[|\]$/g, ""));
      const key = `${name}||${formula.slice(0, 80)}`;
      if (seen.has(key)) return;
      seen.add(key);

      results.push({
        name,
        caption,
        formula,
        datatype: attr(col, "datatype", "string"),
        role: attr(col, "role", "measure"),
        datasource: dsCaption,
        description: getDescription(col),
        dependencies: extractDependencies(formula),
      });
    });
  });

  return results;
}

function extractSheets(doc) {
  const results = [];

  const processSheet = (el, type) => {
    const name = attr(el, "name", "");
    if (!name) return;

    const datasourcesUsed = [];
    el.querySelectorAll("datasources datasource, datasource-dependencies").forEach((d) => {
      const n = attr(d, "name") || attr(d, "datasource");
      if (n && n !== "Parameters" && !datasourcesUsed.includes(n)) {
        datasourcesUsed.push(n);
      }
    });

    const filtersApplied = [];
    el.querySelectorAll("filter").forEach((f) => {
      const col = attr(f, "column");
      if (col && !filtersApplied.includes(col)) filtersApplied.push(col);
    });

    const fieldsUsed = [];
    el.querySelectorAll("datasource-dependencies column").forEach((col) => {
      const n = attr(col, "name");
      if (n && !fieldsUsed.includes(n)) fieldsUsed.push(n);
    });

    results.push({ name, type, datasources_used: datasourcesUsed, filters_applied: filtersApplied, fields_used: fieldsUsed });
  };

  doc.querySelectorAll("worksheet").forEach((ws) => processSheet(ws, "worksheet"));
  doc.querySelectorAll("dashboard").forEach((db) => processSheet(db, "dashboard"));

  return results;
}

function extractParameters(doc) {
  const results = [];

  doc.querySelectorAll("datasource[name='Parameters'] column").forEach((col) => {
    const name = attr(col, "name", "");
    const caption = attr(col, "caption", name.replace(/^\[|\]$/g, ""));
    const domainType = attr(col, "param-domain-type", "all");
    const calc = col.querySelector("calculation");
    const currentValue = calc ? attr(calc, "value") || attr(calc, "formula") || "" : "";

    const allowableValues = [];
    col.querySelectorAll("members member").forEach((m) => {
      const v = attr(m, "value");
      if (v) allowableValues.push(v);
    });
    col.querySelectorAll("alias").forEach((a) => {
      const v = attr(a, "value");
      if (v && !allowableValues.includes(v)) allowableValues.push(v);
    });

    const range = col.querySelector("range");
    results.push({
      name,
      caption,
      datatype: attr(col, "datatype", "string"),
      current_value: currentValue,
      domain_type: domainType,
      allowable_values: allowableValues,
      range_min: range ? attr(range, "min") : null,
      range_max: range ? attr(range, "max") : null,
      step_size: range ? attr(range, "granularity") : null,
    });
  });

  return results;
}

function extractFilters(doc) {
  const results = [];

  doc.querySelectorAll("worksheet").forEach((ws) => {
    const sheetName = attr(ws, "name", "");
    ws.querySelectorAll("filter").forEach((f) => {
      const field = attr(f, "column", "");
      const filterType = attr(f, "class", "categorical");
      const datasource = attr(f, "datasource", "");

      const includeValues = [];
      const excludeValues = [];
      f.querySelectorAll("groupfilter member").forEach((m) => {
        const v = attr(m, "value");
        if (v) includeValues.push(v);
      });
      f.querySelectorAll("selection member").forEach((m) => {
        const v = attr(m, "value");
        if (v) includeValues.push(v);
      });

      const range = f.querySelector("min, max");
      results.push({
        sheet: sheetName,
        datasource,
        field,
        filter_type: filterType,
        include_values: includeValues,
        exclude_values: excludeValues,
        min_value: f.querySelector("min") ? f.querySelector("min").textContent.trim() || null : null,
        max_value: f.querySelector("max") ? f.querySelector("max").textContent.trim() || null : null,
      });
    });
  });

  return results;
}

// ================================================================
// MAIN EXPORT
// ================================================================

export async function extractWorkbook(file) {
  const xmlString = await loadXML(file);
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Could not parse workbook XML");

  return {
    meta: extractMeta(doc, file),
    datasources: extractDatasources(doc),
    calculated_fields: extractCalculatedFields(doc),
    sheets: extractSheets(doc),
    parameters: extractParameters(doc),
    filters: extractFilters(doc),
  };
}
