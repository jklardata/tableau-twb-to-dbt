import { useState, useCallback, useMemo, useEffect } from "react";
import { extractWorkbook } from "../lib/docsEngine.js";
import posthog from "posthog-js";
import { generateMarkdown, generateAIPrompt } from "../lib/markdownExport.js";

// ================================================================
// DESIGN TOKENS
// ================================================================

const T = {
  bg: "#f8fafc", white: "#fff", text: "#1e293b", muted: "#64748b",
  dim: "#94a3b8", border: "#e2e8f0", borderLight: "#f1f5f9",
  primary: "#0ea5e9", hdr: "#1e293b",
  font: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
};

// ================================================================
// FORMULA BLOCK — syntax highlighting (light theme)
// ================================================================

const FN_SET = new Set([
  "SUM","AVG","COUNT","COUNTD","MIN","MAX","MEDIAN","STDEV","VAR","IF","THEN","ELSE","ELSEIF","END","IIF","CASE","WHEN",
  "NOT","AND","OR","ISNULL","IFNULL","ISDATE","ZN","ATTR","DATETRUNC","DATEPART","DATEDIFF","DATEADD","DATENAME","YEAR",
  "QUARTER","MONTH","WEEK","DAY","TODAY","NOW","MAKEDATE","LEFT","RIGHT","MID","LEN","TRIM","LTRIM","RTRIM","UPPER","LOWER",
  "CONTAINS","STARTSWITH","ENDSWITH","FIND","FINDNTH","REPLACE","REGEXP_MATCH","REGEXP_REPLACE","ROUND","FLOOR","CEILING",
  "ABS","SQRT","POWER","EXP","LOG","LN","SIGN","INT","FLOAT","STR","DATE","DATETIME","WINDOW_SUM","WINDOW_AVG",
  "WINDOW_COUNT","WINDOW_MIN","WINDOW_MAX","RUNNING_SUM","RUNNING_AVG","RUNNING_COUNT","RUNNING_MIN","RUNNING_MAX",
  "LOOKUP","PREVIOUS_VALUE","INDEX","SIZE","FIRST","LAST","RANK","RANK_DENSE","RANK_MODIFIED","RANK_PERCENTILE",
  "RANK_UNIQUE","TOTAL","RAWSQL_INT","RAWSQL_REAL","RAWSQL_STR","TRUE","FALSE","NULL",
]);

function FormulaBlock({ formula }) {
  if (!formula) return null;
  const tokens = [];
  const regex = /("[^"]*")|('[^']*')|(\[[^\]]+\])|([\w]+)/g;
  let last = 0, match;
  while ((match = regex.exec(formula)) !== null) {
    if (match.index > last) tokens.push({ text: formula.slice(last, match.index), type: "plain" });
    if (match[1] || match[2]) tokens.push({ text: match[0], type: "string" });
    else if (match[3]) tokens.push({ text: match[0], type: "field" });
    else tokens.push({ text: match[0], type: FN_SET.has(match[0].toUpperCase()) ? "function" : "plain" });
    last = regex.lastIndex;
  }
  if (last < formula.length) tokens.push({ text: formula.slice(last), type: "plain" });
  const colors = { field: "#0369a1", function: "#7c3aed", string: "#b45309", plain: "#64748b" };
  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "12px 14px", fontSize: "12px", fontFamily: T.mono, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.9, marginTop: "8px" }}>
      {tokens.map((tk, i) => <span key={i} style={{ color: colors[tk.type] }}>{tk.text}</span>)}
    </div>
  );
}

// ================================================================
// SHARED PILL
// ================================================================

function Pill({ color, children }) {
  const map = {
    blue: { bg: "#dbeafe", text: "#1d4ed8" },
    green: { bg: "#dcfce7", text: "#166534" },
    amber: { bg: "#fef3c7", text: "#92400e" },
    purple: { bg: "#ede9fe", text: "#5b21b6" },
    gray: { bg: T.bg, text: T.muted },
  };
  const c = map[color] || map.gray;
  return (
    <span style={{ display: "inline-flex", fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "9999px", background: c.bg, color: c.text, marginRight: "4px", marginBottom: "4px" }}>
      {children}
    </span>
  );
}

// ================================================================
// CALCULATED FIELDS TAB
// ================================================================

function CalculatedFieldsTab({ fields, selectedField, onSelectField, panelMode }) {
  const [search, setSearch] = useState("");
  const [filterDep, setFilterDep] = useState(null);
  const [sort, setSort] = useState("az");

  const filtered = useMemo(() => {
    let f = fields;
    if (filterDep) f = f.filter((cf) => cf.dependencies.includes(filterDep));
    if (search) {
      const q = search.toLowerCase();
      f = f.filter((cf) => cf.caption.toLowerCase().includes(q) || cf.formula.toLowerCase().includes(q));
    }
    if (sort === "az") f = [...f].sort((a, b) => a.caption.localeCompare(b.caption));
    else if (sort === "ds") f = [...f].sort((a, b) => a.datasource.localeCompare(b.datasource));
    else if (sort === "deps") f = [...f].sort((a, b) => b.dependencies.length - a.dependencies.length);
    return f;
  }, [fields, search, filterDep, sort]);

  if (fields.length === 0) return <div style={{ textAlign: "center", padding: "48px", color: T.dim, fontSize: "14px" }}>No calculated fields found in this workbook.</div>;

  const showSplit = panelMode === "split" && !!selectedField;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ flex: 1, minWidth: "200px", padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.text, outline: "none" }}
          placeholder="Search by name or formula…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filterDep && (
          <button style={{ padding: "5px 10px", fontSize: "10px", fontWeight: 600, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", borderRadius: "6px", cursor: "pointer", fontFamily: T.font }} onClick={() => setFilterDep(null)}>
            Filtering: {filterDep} ×
          </button>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.muted, background: T.white }}>
          <option value="az">Sort: A–Z</option>
          <option value="ds">Sort: Datasource</option>
          <option value="deps">Sort: Dependencies</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          {["panel", "split"].map(mode => (
            <button key={mode} onClick={() => { if (panelMode === mode) onSelectField(null, "toggle"); }} style={{ padding: "5px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "11px", cursor: "pointer", fontFamily: T.font, color: T.muted, background: T.white }}>
              {mode === "panel" ? "⊟ Panel" : "⊠ Split"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: "10px", color: T.dim, marginBottom: "12px" }}>{filtered.length} of {fields.length} fields. Click a field to view formula.</div>

      <div style={{ display: "flex", gap: 0, overflow: "hidden" }}>
        <div style={{ flex: showSplit ? "0 0 56%" : "1", overflow: "auto" }}>
          {filtered.map((cf, i) => {
            const isSelected = selectedField?.caption === cf.caption;
            return (
              <div
                key={i}
                onClick={() => onSelectField(isSelected ? null : cf)}
                style={{ background: isSelected ? "#eff6ff" : T.white, border: `1px solid ${isSelected ? "#bae6fd" : T.border}`, borderRadius: "8px", padding: "14px 16px", marginBottom: "6px", cursor: "pointer", transition: "all 0.1s" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: T.text, flex: 1 }}>{cf.caption}</div>
                  <Pill color="blue">{cf.datasource}</Pill>
                  <Pill color="gray">{cf.datatype}</Pill>
                  <Pill color={cf.role === "measure" ? "green" : "gray"}>{cf.role}</Pill>
                </div>
                {cf.description && <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px", lineHeight: 1.5 }}>{cf.description}</div>}
                {cf.dependencies.length > 0 && (
                  <div style={{ marginTop: "6px" }}>
                    <span style={{ fontSize: "9px", color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "6px" }}>Deps:</span>
                    {cf.dependencies.map((dep, di) => (
                      <button key={di} style={{ display: "inline-flex", fontSize: "10px", fontWeight: 600, padding: "1px 7px", borderRadius: "9999px", background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", marginRight: "3px", marginBottom: "2px", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); setFilterDep(dep === filterDep ? null : dep); }}>
                        {dep}
                      </button>
                    ))}
                  </div>
                )}
                {!showSplit && <FormulaBlock formula={cf.formula} />}
              </div>
            );
          })}
        </div>

        {/* Split panel */}
        {showSplit && (
          <div style={{ flex: "0 0 44%", borderLeft: `1px solid ${T.border}`, overflow: "auto", background: T.white, paddingLeft: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: T.muted }}>Formula Detail</span>
              <button onClick={() => onSelectField(null)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "16px" }}>×</button>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: T.text, marginBottom: "4px" }}>{selectedField.caption}</div>
            {selectedField.dependencies.length > 0 && (
              <div style={{ marginBottom: "8px" }}>
                {selectedField.dependencies.map((d, i) => <Pill key={i} color="amber">{d}</Pill>)}
              </div>
            )}
            <FormulaBlock formula={selectedField.formula} />
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// DATA SOURCES TAB
// ================================================================

function DataSourcesTab({ datasources }) {
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");

  if (datasources.length === 0) return <div style={{ textAlign: "center", padding: "48px", color: T.dim, fontSize: "14px" }}>No data sources found.</div>;

  return (
    <div>
      {datasources.map((ds, i) => {
        const isOpen = expanded === i;
        const filteredFields = search
          ? ds.fields.filter((f) => f.caption.toLowerCase().includes(search.toLowerCase()) || f.name.toLowerCase().includes(search.toLowerCase()))
          : ds.fields;
        return (
          <div key={i} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", marginBottom: "6px", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }} onClick={() => setExpanded(isOpen ? null : i)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: T.text, marginBottom: "2px" }}>{ds.caption || ds.name}</div>
                <div style={{ fontSize: "10px", color: T.dim }}>{ds.fields.length} fields</div>
              </div>
              <Pill color="blue">{ds.connection_type}</Pill>
              {ds.connection_dbname && <span style={{ fontSize: "10px", color: T.dim }}>{ds.connection_dbname}</span>}
              <span style={{ color: T.dim, fontSize: "12px" }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: "14px 16px" }}>
                {ds.connection_server && <div style={{ fontSize: "11px", color: T.muted, marginBottom: "10px" }}>Server: {ds.connection_server}</div>}
                <input style={{ width: "100%", padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.text, outline: "none", marginBottom: "10px" }} placeholder="Filter fields…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        {["Field", "Caption", "Type", "Role", "Calculated"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.dim }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFields.map((f, fi) => (
                        <tr key={fi} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                          <td style={{ padding: "7px 10px", color: f.is_calculated ? T.primary : T.muted, fontFamily: T.mono, fontSize: "11px" }}>{f.name}</td>
                          <td style={{ padding: "7px 10px", color: T.text }}>{f.caption}</td>
                          <td style={{ padding: "7px 10px", color: T.muted }}>{f.datatype}</td>
                          <td style={{ padding: "7px 10px", color: T.muted }}>{f.role}</td>
                          <td style={{ padding: "7px 10px" }}>{f.is_calculated ? <span style={{ color: "#166534" }}>Yes</span> : <span style={{ color: T.dim }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ================================================================
// SHEETS TAB
// ================================================================

function SheetsTab({ sheets }) {
  const worksheets = sheets.filter((s) => s.type === "worksheet");
  const dashboards = sheets.filter((s) => s.type === "dashboard");

  if (sheets.length === 0) return <div style={{ textAlign: "center", padding: "48px", color: T.dim, fontSize: "14px" }}>No sheets found.</div>;

  const SheetCard = ({ sheet }) => {
    const maxPills = 8;
    const fields = sheet.fields_used;
    const visible = fields.slice(0, maxPills);
    const extra = fields.length - maxPills;
    return (
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "14px 16px", marginBottom: "6px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: T.text, marginBottom: "6px" }}>{sheet.name}</div>
        {sheet.datasources_used.length > 0 && (
          <div style={{ marginBottom: "4px" }}>
            <span style={{ fontSize: "9px", color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "6px" }}>Sources:</span>
            {sheet.datasources_used.map((d, i) => <Pill key={i} color="blue">{d}</Pill>)}
          </div>
        )}
        {sheet.filters_applied.length > 0 && (
          <div style={{ marginBottom: "4px" }}>
            <span style={{ fontSize: "9px", color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "6px" }}>Filters:</span>
            {sheet.filters_applied.map((f, i) => <Pill key={i} color="amber">{f.replace(/^\[|\]$/g, "")}</Pill>)}
          </div>
        )}
        {fields.length > 0 && (
          <div>
            <span style={{ fontSize: "9px", color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "6px" }}>Fields:</span>
            {visible.map((f, i) => <Pill key={i} color="gray">{f.replace(/^\[|\]$/g, "")}</Pill>)}
            {extra > 0 && <Pill color="gray">+{extra} more</Pill>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {worksheets.length > 0 && (
        <>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "10px", marginTop: "4px" }}>Worksheets ({worksheets.length})</div>
          {worksheets.map((s, i) => <SheetCard key={i} sheet={s} />)}
        </>
      )}
      {dashboards.length > 0 && (
        <>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "10px", marginTop: "16px" }}>Dashboards ({dashboards.length})</div>
          {dashboards.map((s, i) => <SheetCard key={i} sheet={s} />)}
        </>
      )}
    </div>
  );
}

// ================================================================
// PARAMETERS TAB
// ================================================================

function ParametersTab({ parameters }) {
  if (parameters.length === 0) return <div style={{ textAlign: "center", padding: "48px", color: T.dim, fontSize: "14px" }}>No parameters found in this workbook.</div>;

  return (
    <div>
      {parameters.map((p, i) => (
        <div key={i} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "14px 16px", marginBottom: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: T.text, flex: 1 }}>{p.caption || p.name}</div>
            <Pill color="gray">{p.datatype}</Pill>
            <Pill color={p.domain_type === "list" ? "blue" : p.domain_type === "range" ? "amber" : "gray"}>{p.domain_type}</Pill>
          </div>
          <div style={{ fontSize: "11px", color: T.muted, marginBottom: "8px" }}>
            Current value: <span style={{ color: T.primary }}>{p.current_value || "n/a"}</span>
          </div>
          {p.domain_type === "list" && p.allowable_values.length > 0 && (
            <div>
              <span style={{ fontSize: "9px", color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "6px" }}>Values:</span>
              {p.allowable_values.map((v, vi) => (
                <Pill key={vi} color={v === p.current_value ? "blue" : "gray"}>{v}</Pill>
              ))}
            </div>
          )}
          {p.domain_type === "range" && (p.range_min !== null || p.range_max !== null) && (
            <div style={{ fontSize: "11px", color: T.muted }}>
              Range: {p.range_min} to {p.range_max}
              {p.step_size && <span> (step: {p.step_size})</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ================================================================
// FILTERS TAB
// ================================================================

function FiltersTab({ filters }) {
  if (filters.length === 0) return <div style={{ textAlign: "center", padding: "48px", color: T.dim, fontSize: "14px" }}>No filters found in this workbook.</div>;

  const bySheet = {};
  for (const f of filters) {
    if (!bySheet[f.sheet]) bySheet[f.sheet] = [];
    bySheet[f.sheet].push(f);
  }

  return (
    <div>
      {Object.entries(bySheet).map(([sheet, sheetFilters]) => (
        <div key={sheet} style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "10px" }}>{sheet} ({sheetFilters.length})</div>
          {sheetFilters.map((f, i) => (
            <div key={i} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "12px 14px", marginBottom: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: T.text }}>{f.field.replace(/^\[|\]$/g, "")}</div>
                <Pill color="blue">{f.filter_type}</Pill>
                {f.datasource && <span style={{ fontSize: "10px", color: T.dim }}>{f.datasource}</span>}
              </div>
              {f.include_values.length > 0 && (
                <div style={{ fontSize: "11px", color: T.muted }}>Include: {f.include_values.slice(0, 6).join(", ")}{f.include_values.length > 6 ? ` +${f.include_values.length - 6} more` : ""}</div>
              )}
              {f.exclude_values.length > 0 && (
                <div style={{ fontSize: "11px", color: "#991b1b" }}>Exclude: {f.exclude_values.slice(0, 6).join(", ")}</div>
              )}
              {f.min_value !== null && (
                <div style={{ fontSize: "11px", color: T.muted }}>Range: {f.min_value} to {f.max_value}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ================================================================
// EMAIL CAPTURE
// ================================================================

function DocsEmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    try {
      await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "docs" }),
      });
      posthog.capture("email_captured", { source: "docs" });
      setStatus("done");
    } catch {
      setStatus("done");
    }
  };

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "40px 32px", textAlign: "center", marginTop: "64px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.primary, marginBottom: "10px" }}>Stay in the loop</div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>New tools, guides, and Tableau tips.</div>
      <div style={{ fontSize: "14px", color: T.muted, marginBottom: "24px" }}>No spam. Unsubscribe anytime.</div>
      {status === "done" ? (
        <div style={{ fontSize: "14px", color: "#166534" }}>You're on the list.</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
          <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: "6px", color: T.text, fontSize: "13px", fontFamily: T.font, width: "260px", outline: "none" }} />
          <button type="submit" disabled={status === "loading"} style={{ padding: "10px 20px", background: T.hdr, color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: T.font }}>
            {status === "loading" ? "..." : "Notify Me"}
          </button>
        </form>
      )}
    </div>
  );
}

// ================================================================
// MAIN PAGE
// ================================================================

const TAB_KEYS = ["calculated_fields", "data_sources", "sheets", "parameters", "filters"];
const TAB_LABELS = { calculated_fields: "Calc Fields", data_sources: "Data Sources", sheets: "Sheets", parameters: "Parameters", filters: "Filters" };

export default function DocsPage() {
  useEffect(() => {
    document.title = "Tableau Docs Generator: Auto-Generate Workbook Documentation";
    posthog.capture("page_viewed", { page: "docs" });
  }, []);

  const [file, setFile] = useState(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("twb_pending_docs");
    if (!raw) return;
    sessionStorage.removeItem("twb_pending_docs");
    const { name, data } = JSON.parse(raw);
    fetch(data).then(r => r.blob()).then(blob => setFile(new File([blob], name)));
  }, []);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState("calculated_fields");
  const [copyStatus, setCopyStatus] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [panelMode, setPanelMode] = useState("panel");

  const currentPath = window.location.pathname;

  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedField(null);
    try {
      const r = await extractWorkbook(file);
      setResult(r);
      posthog.capture("docs_extracted", {
        workbook: file.name,
        calculated_fields: r.calculated_fields?.length ?? 0,
        datasources: r.datasources?.length ?? 0,
        sheets: r.sheets?.length ?? 0,
      });
    } catch (err) {
      setError(err.message || "Something went wrong");
      posthog.capture("docs_error", { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = () => {
    const name = result.meta.workbook_name.replace(/\.[^.]+$/, "");
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `tableau-docs-${name}.json`; a.click();
    URL.revokeObjectURL(url);
    posthog.capture("docs_exported", { format: "json" });
  };

  const downloadMarkdown = () => {
    const name = result.meta.workbook_name.replace(/\.[^.]+$/, "");
    const md = generateMarkdown(result);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `tableau-docs-${name}.md`; a.click();
    URL.revokeObjectURL(url);
    posthog.capture("docs_exported", { format: "markdown" });
  };

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(generateMarkdown(result));
    setCopyStatus("md");
    setTimeout(() => setCopyStatus(null), 2000);
    posthog.capture("docs_exported", { format: "markdown_copy" });
  };

  const copyForAI = async () => {
    await navigator.clipboard.writeText(generateAIPrompt(result));
    setCopyStatus("ai");
    setTimeout(() => setCopyStatus(null), 2000);
    posthog.capture("docs_exported", { format: "ai_prompt" });
  };

  const tabCounts = result ? {
    calculated_fields: result.calculated_fields.length,
    data_sources: result.datasources.length,
    sheets: result.sheets.length,
    parameters: result.parameters.length,
    filters: result.filters.length,
  } : {};

  const platform = result ? (result.meta.source_platform === "win" ? "Windows" : result.meta.source_platform === "mac" ? "macOS" : result.meta.source_platform) : "";

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0]; if (f) { setFile(f); setResult(null); }
  }, []);

  const showPanel = panelMode === "panel" && !!selectedField && activeTab === "calculated_fields";

  const btnStyle = (active) => ({
    padding: "8px 14px", background: active ? "#f0f9ff" : T.white, color: active ? T.primary : T.muted,
    border: `1px solid ${active ? "#bae6fd" : T.border}`, borderRadius: "6px", fontSize: "12px",
    fontWeight: 600, cursor: "pointer", fontFamily: T.font,
  });

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ background: T.hdr, padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#fff" }}>Tableau<span style={{ color: T.primary }}>to</span>Dbt</span>
        </a>
        <nav style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {[["Convert", "/"], ["Diff", "/diff"], ["Docs", "/docs"], ["Audit", "/audit"]].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: "12px", color: label === "Docs" ? "#fff" : "rgba(255,255,255,0.55)", padding: "5px 12px", borderRadius: "6px", textDecoration: "none", fontWeight: label === "Docs" ? 600 : 400, background: label === "Docs" ? "rgba(255,255,255,0.1)" : "none" }}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* Upload Bar */}
      <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
        <div
          style={{ border: `1.5px dashed ${file ? "#22c55e" : drag ? T.primary : T.border}`, borderRadius: "8px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", cursor: file ? "default" : "pointer", background: file ? "#f0fdf4" : drag ? "#f0f9ff" : T.bg, flex: 1, maxWidth: "320px", transition: "all 0.15s" }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => !file && document.getElementById("docs-upload").click()}
        >
          <input id="docs-upload" type="file" accept=".twb,.twbx" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); setResult(null); } }} />
          <span style={{ fontSize: "16px", color: file ? "#22c55e" : T.dim }}>{file ? "✓" : "↑"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {file ? (
              <>
                <div style={{ fontSize: "12px", fontFamily: T.mono, color: T.primary, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                <div style={{ fontSize: "10px", color: T.dim }}>{(file.size / 1024).toFixed(1)} KB</div>
              </>
            ) : <div style={{ fontSize: "12px", color: T.muted }}>Drop .twb or .twbx</div>}
          </div>
          {file && <button style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "16px", padding: "0 2px" }} onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}>×</button>}
        </div>

        <button
          style={{ padding: "10px 20px", background: file && !loading ? T.hdr : T.border, color: file && !loading ? "#fff" : T.dim, border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: file && !loading ? "pointer" : "not-allowed", fontFamily: T.font, whiteSpace: "nowrap" }}
          onClick={handleExtract}
          disabled={!file || loading}
        >
          {loading ? "Extracting…" : "Generate Docs →"}
        </button>

        {result && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginLeft: "auto" }}>
            <button style={btnStyle(false)} onClick={downloadJSON}>↓ JSON</button>
            <button style={btnStyle(false)} onClick={downloadMarkdown}>↓ Markdown</button>
            <button style={btnStyle(copyStatus === "md")} onClick={copyMarkdown}>{copyStatus === "md" ? "✓ Copied!" : "⎘ Copy MD"}</button>
            <button style={{ ...btnStyle(copyStatus === "ai"), color: "#7c3aed", borderColor: copyStatus === "ai" ? "#c4b5fd" : T.border, background: copyStatus === "ai" ? "#f5f3ff" : T.white }} onClick={copyForAI}>{copyStatus === "ai" ? "✓ Copied!" : "✦ Copy for AI"}</button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fca5a5", fontSize: "13px", color: "#991b1b" }}>{error}</div>
      )}

      {/* Results */}
      {result && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Stat Strip */}
          <div style={{ display: "flex", gap: 0, background: T.white, borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflowX: "auto" }}>
            {[
              [result.meta.calculated_field_count, "Calc Fields"],
              [result.meta.datasource_count, "Data Sources"],
              [result.meta.sheet_count, "Sheets"],
              [result.meta.parameter_count, "Parameters"],
              [result.filters.length, "Filters"],
            ].map(([num, label], i) => (
              <div key={label} style={{ padding: "12px 20px", borderRight: i < 4 ? `1px solid ${T.border}` : "none", flexShrink: 0 }}>
                <div style={{ fontSize: "24px", fontWeight: 800, color: T.primary, lineHeight: 1 }}>{num}</div>
                <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginTop: "2px" }}>{label}</div>
              </div>
            ))}
            <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", marginLeft: "auto" }}>
              <span style={{ fontSize: "11px", color: T.dim }}>{result.meta.workbook_name} · Tableau {result.meta.source_build} · {platform}</span>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 0, overflowX: "auto", padding: "0 24px" }}>
              {TAB_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => { setActiveTab(key); setSelectedField(null); }}
                  style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: "none", border: "none", borderBottom: activeTab === key ? `2px solid ${T.primary}` : "2px solid transparent", color: activeTab === key ? T.primary : T.muted, marginBottom: "-1px", whiteSpace: "nowrap", fontFamily: T.font }}
                >
                  {TAB_LABELS[key]}
                  {tabCounts[key] > 0 && (
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "8px", marginLeft: "5px", background: activeTab === key ? "#dbeafe" : T.bg, color: activeTab === key ? T.primary : T.dim }}>
                      {tabCounts[key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
            {activeTab === "calculated_fields" && (
              <CalculatedFieldsTab
                fields={result.calculated_fields}
                selectedField={selectedField}
                onSelectField={(field) => setSelectedField(field)}
                panelMode={panelMode}
              />
            )}
            {activeTab === "data_sources" && <DataSourcesTab datasources={result.datasources} />}
            {activeTab === "sheets" && <SheetsTab sheets={result.sheets} />}
            {activeTab === "parameters" && <ParametersTab parameters={result.parameters} />}
            {activeTab === "filters" && <FiltersTab filters={result.filters} />}
          </div>

          {/* Bottom panel (panel mode, calc fields tab) */}
          {showPanel && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "320px", background: T.white, borderTop: `2px solid ${T.border}`, boxShadow: "0 -4px 24px rgba(0,0,0,0.1)", zIndex: 200, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: T.text }}>{selectedField.caption}</span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {selectedField.dependencies.length > 0 && selectedField.dependencies.map((d, i) => <Pill key={i} color="amber">{d}</Pill>)}
                  <button onClick={() => setSelectedField(null)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "18px" }}>×</button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
                <FormulaBlock formula={selectedField.formula} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Marketing (no results) */}
      {!result && (
        <main style={{ flex: 1, padding: "40px 24px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, color: T.text, marginBottom: "12px", letterSpacing: "-0.02em" }}>Tableau Workbook Docs</h1>
            <p style={{ fontSize: "16px", color: T.muted, maxWidth: "520px", margin: "0 auto", lineHeight: 1.7 }}>
              Upload any .twb or .twbx file. Get full documentation of every field, formula, data source, and filter, instantly.
            </p>
            <p style={{ fontSize: "12px", color: T.primary, marginTop: "12px" }}>
              Used by data teams onboarding new analysts and organizations preparing for Tableau-to-dbt migrations.
            </p>
          </div>

          <div style={{ fontSize: "10px", fontWeight: 700, color: T.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "16px" }}>What You Get</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: "48px" }}>
            {[
              ["🧮", "Calculated Fields", "Every formula extracted with full syntax, datatype, role, and a dependency list."],
              ["🗄", "Data Sources", "Connection type, server, database, and a complete field inventory for every datasource."],
              ["📊", "Sheets & Dashboards", "Which data sources, filters, and fields each sheet uses."],
              ["🎛", "Parameters", "Current values, allowed values or ranges, and domain types for every parameter."],
              ["🔍", "Filters", "Every filter across every sheet with include/exclude values."],
              ["✦", "AI-Ready Export", "One-click copy of a structured prompt. Paste into Claude or ChatGPT."],
              ["📝", "Notion / Confluence", "Markdown export pastes directly into Notion pages or Confluence."],
              ["🔒", "Fully Private", "Your workbook never leaves your browser. All parsing happens locally."],
            ].map(([icon, title, body]) => (
              <div key={title} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "18px" }}>
                <div style={{ fontSize: "20px", marginBottom: "8px" }}>{icon}</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: T.text, marginBottom: "4px" }}>{title}</div>
                <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.6 }}>{body}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: "10px", fontWeight: 700, color: T.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "16px" }}>How It Works</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "48px" }}>
            {[
              ["01", "Upload your workbook", "Drop any .twb or .twbx file. Your workbook never leaves your browser."],
              ["02", "Browse the extracted docs", "Five tabs: Calc Fields, Data Sources, Sheets, Parameters, and Filters, each with search."],
              ["03", "Export in any format", "Download JSON, Markdown, or copy a structured AI prompt for Claude or ChatGPT."],
            ].map(([num, title, body]) => (
              <div key={num} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
                <div style={{ fontSize: "28px", fontWeight: 800, color: T.border, marginBottom: "8px" }}>{num}</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "6px" }}>{title}</div>
                <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7 }}>{body}</div>
              </div>
            ))}
          </div>

          <DocsEmailCapture />
        </main>
      )}

      {/* Footer */}
      <footer>
        <div style={{ background: T.hdr, padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.primary, marginBottom: "10px" }}>Need hands-on help?</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>We do this for clients too.</div>
          <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", maxWidth: "480px", margin: "0 auto 20px", lineHeight: 1.7 }}>
            Klardata helps data teams migrate Tableau workbooks to dbt, build semantic layers, and modernize their analytics stack.
          </div>
          <a href="https://www.klardata.com" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "12px 28px", background: T.primary, color: "#fff", borderRadius: "6px", fontSize: "13px", fontWeight: 700, textDecoration: "none", letterSpacing: "0.06em" }}>
            Learn More at klardata.com →
          </a>
        </div>
        <div style={{ padding: "14px 32px", display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", background: T.white, borderTop: `1px solid ${T.border}` }}>
          {[["Convert", "/"], ["Diff", "/diff"], ["Docs", "/docs"], ["Audit", "/audit"], ["Privacy", "/privacy"], ["Terms", "/terms"]].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: "11px", color: T.muted, textDecoration: "none" }}>{label}</a>
          ))}
          <span style={{ marginLeft: "auto", fontSize: "10px", color: T.border }}>Not affiliated with Salesforce or Tableau.</span>
        </div>
      </footer>
    </div>
  );
}
