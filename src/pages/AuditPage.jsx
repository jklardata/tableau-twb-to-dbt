import { useState, useCallback, useMemo, useEffect } from "react";
import { auditWorkbook } from "../lib/auditEngine.js";
import posthog from "posthog-js";
import { readPendingFile } from "../lib/pendingFile.js";

// ================================================================
// DESIGN TOKENS
// ================================================================

const T = {
  bg: "#f8fafc", white: "#fff", text: "#1e293b", muted: "#64748b",
  dim: "#94a3b8", border: "#e2e8f0", borderLight: "#f1f5f9",
  primary: "#0ea5e9", hdr: "#1e293b",
  font: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  error: "#ef4444", warning: "#f59e0b", info: "#3b82f6", clean: "#22c55e",
};

// ================================================================
// FORMULA BLOCK — light syntax highlighting
// ================================================================

const FN_SET = new Set([
  "SUM","AVG","COUNT","COUNTD","MIN","MAX","MEDIAN","IF","THEN","ELSE","ELSEIF","END","IIF","CASE","WHEN",
  "NOT","AND","OR","ISNULL","IFNULL","ZN","ATTR","DATETRUNC","DATEPART","DATEDIFF","DATEADD","YEAR","MONTH","DAY",
  "TODAY","NOW","LEFT","RIGHT","MID","LEN","TRIM","UPPER","LOWER","CONTAINS","STARTSWITH","ENDSWITH","FIND","REPLACE",
  "ROUND","FLOOR","CEILING","ABS","SQRT","INT","FLOAT","STR","DATE","WINDOW_SUM","WINDOW_AVG","WINDOW_COUNT",
  "RUNNING_SUM","RUNNING_AVG","RUNNING_COUNT","LOOKUP","INDEX","SIZE","RANK","TOTAL","FIXED","INCLUDE","EXCLUDE",
  "TRUE","FALSE","NULL",
]);

function FormulaBlock({ formula }) {
  if (!formula) return null;
  const tokens = [];
  const regex = /("[^"]*")|('[^']*')|(\[[^\]]+\])|([\w]+)/g;
  let last = 0, m;
  while ((m = regex.exec(formula)) !== null) {
    if (m.index > last) tokens.push({ text: formula.slice(last, m.index), type: "plain" });
    if (m[1] || m[2]) tokens.push({ text: m[0], type: "string" });
    else if (m[3]) tokens.push({ text: m[0], type: "field" });
    else tokens.push({ text: m[0], type: FN_SET.has(m[0].toUpperCase()) ? "fn" : "plain" });
    last = regex.lastIndex;
  }
  if (last < formula.length) tokens.push({ text: formula.slice(last), type: "plain" });
  const colors = { field: "#0369a1", fn: "#7c3aed", string: "#b45309", plain: T.muted };
  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "12px 14px", fontSize: "11px", fontFamily: T.mono, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.9 }}>
      {tokens.map((t, i) => <span key={i} style={{ color: colors[t.type] }}>{t.text}</span>)}
    </div>
  );
}

// ================================================================
// HEALTH GAUGE (SVG)
// ================================================================

function HealthGauge({ score }) {
  const r = 52, cx = 68, cy = 68;
  const circ = 2 * Math.PI * r;
  const arc = (score / 100) * circ;
  const color = score >= 80 ? T.clean : score >= 60 ? T.warning : score >= 40 ? "#f97316" : T.error;
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Needs Attention" : score >= 40 ? "At Risk" : "Critical";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <svg width="136" height="136" style={{ overflow: "visible" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="28" fontWeight="800" fontFamily="'Inter', system-ui, sans-serif">{score}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill={T.dim} fontSize="9" fontFamily="'Inter', system-ui, sans-serif" letterSpacing="1">/100</text>
      </svg>
      <span style={{ fontSize: "11px", fontWeight: 700, color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

// ================================================================
// SEVERITY COLOR HELPERS
// ================================================================

function sevColor(s) {
  return s === "error" ? T.error : s === "warning" ? T.warning : s === "info" ? T.info : T.clean;
}
function sevBg(s) {
  return s === "error" ? "#fef2f2" : s === "warning" ? "#fffbeb" : s === "info" ? "#eff6ff" : "#f0fdf4";
}
function complexColor(label) {
  return label === "simple" ? T.clean : label === "moderate" ? T.info : label === "complex" ? T.warning : T.error;
}

// ================================================================
// FIELD DETAIL PANEL
// ================================================================

function FieldDetail({ field }) {
  if (!field) return null;
  const maxSev = field.issues.find(i => i.severity === "error") ? "error"
    : field.issues.find(i => i.severity === "warning") ? "warning"
    : field.issues.length > 0 ? "info" : "clean";

  return (
    <div style={{ padding: "16px 20px", fontFamily: T.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: T.text }}>{field.caption}</span>
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: sevBg(maxSev), color: sevColor(maxSev), textTransform: "uppercase" }}>
          {maxSev === "clean" ? "Clean" : maxSev}
        </span>
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: sevBg(field.complexity_label === "simple" ? "clean" : field.complexity_label === "critical" ? "error" : field.complexity_label === "complex" ? "warning" : "info"), color: complexColor(field.complexity_label), textTransform: "uppercase" }}>
          {field.complexity_label}
        </span>
      </div>

      {field.issues.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          {field.issues.map((issue, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 12px", background: sevBg(issue.severity), border: `1px solid ${sevColor(issue.severity)}40`, borderLeft: `3px solid ${sevColor(issue.severity)}`, borderRadius: "4px", marginBottom: "4px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: sevColor(issue.severity), textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{issue.severity}</span>
              <span style={{ fontSize: "12px", color: T.muted, lineHeight: 1.6 }}>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      <FormulaBlock formula={field.formula} />

      {field.dependencies.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: "8px" }}>Deps:</span>
          {field.dependencies.map((d, i) => (
            <span key={i} style={{ display: "inline-flex", fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "9999px", background: "#dcfce7", color: "#166534", marginRight: "4px", marginBottom: "4px" }}>{d}</span>
          ))}
        </div>
      )}

      <div style={{ marginTop: "10px", display: "flex", gap: "16px", fontSize: "11px", color: T.dim }}>
        {field.datasource && <span>Source: {field.datasource}</span>}
        <span>Nesting: {field.nesting_depth}</span>
        <span>Complexity: {field.complexity_score}</span>
        {field.unused && <span style={{ color: T.warning }}>⚠ Unused</span>}
      </div>
    </div>
  );
}

// ================================================================
// AUDIT TABLE
// ================================================================

function AuditTable({ fields, result, selectedField, onSelectField, panelMode }) {
  const [severityFilter, setSeverityFilter] = useState("all");
  const [complexityFilter, setComplexityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("issues");

  const filtered = useMemo(() => {
    let f = fields;
    if (severityFilter === "errors") f = f.filter((x) => x.issues.some((i) => i.severity === "error"));
    else if (severityFilter === "warnings") f = f.filter((x) => x.issues.some((i) => i.severity === "warning"));
    else if (severityFilter === "clean") f = f.filter((x) => x.issues.length === 0);
    if (complexityFilter !== "all") f = f.filter((x) => x.complexity_label === complexityFilter);
    if (search) f = f.filter((x) => x.caption.toLowerCase().includes(search.toLowerCase()));
    if (sort === "issues") f = [...f].sort((a, b) => b.issues.length - a.issues.length || b.complexity_score - a.complexity_score);
    else if (sort === "complexity") f = [...f].sort((a, b) => b.complexity_score - a.complexity_score);
    else if (sort === "name") f = [...f].sort((a, b) => a.caption.localeCompare(b.caption));
    else if (sort === "nesting") f = [...f].sort((a, b) => b.nesting_depth - a.nesting_depth);
    return f;
  }, [fields, severityFilter, complexityFilter, search, sort]);

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `audit-${result.meta.workbook_name.replace(/\.[^.]+$/, "")}.json`; a.click();
    URL.revokeObjectURL(url);
    posthog.capture("audit_exported", { health_score: result.meta.health_score });
  };

  const showSplit = panelMode === "split" && !!selectedField;

  const selBtnStyle = (active) => ({
    padding: "5px 12px", fontSize: "11px", fontWeight: 600, fontFamily: T.font, cursor: "pointer",
    borderRadius: "6px", border: `1px solid ${active ? "#bae6fd" : T.border}`,
    background: active ? "#f0f9ff" : T.white, color: active ? T.primary : T.muted,
  });

  return (
    <div>
      {/* Filter Bar */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
        <input
          style={{ flex: 1, minWidth: "180px", padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.text, outline: "none" }}
          placeholder="🔍 Search fields…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: "flex", gap: "4px" }}>
          {[["all", "All"], ["errors", "Errors"], ["warnings", "Warnings"], ["clean", "Clean"]].map(([val, lbl]) => (
            <button key={val} onClick={() => setSeverityFilter(val)} style={selBtnStyle(severityFilter === val)}>{lbl}</button>
          ))}
        </div>
        <select value={complexityFilter} onChange={(e) => setComplexityFilter(e.target.value)} style={{ padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.muted, background: T.white }}>
          {[["all", "All Complexity"], ["simple", "Simple"], ["moderate", "Moderate"], ["complex", "Complex"], ["critical", "Critical"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.muted, background: T.white }}>
          {[["issues", "Sort: Issues"], ["complexity", "Sort: Complexity"], ["name", "Sort: Name"], ["nesting", "Sort: Nesting"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
          {["panel", "split"].map(mode => (
            <button key={mode} onClick={() => { if (panelMode !== mode) onSelectField(selectedField, mode); }} style={selBtnStyle(panelMode === mode)}>
              {mode === "panel" ? "⊟ Panel" : "⊠ Split"}
            </button>
          ))}
          <button onClick={downloadJSON} style={{ padding: "5px 12px", background: T.white, color: T.muted, border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: T.font }}>
            ↓ JSON
          </button>
        </div>
      </div>

      <div style={{ fontSize: "11px", color: T.dim, marginBottom: "8px" }}>{filtered.length} of {fields.length} fields. Click a row to view detail.</div>

      {/* Table + split */}
      <div style={{ display: "flex", gap: 0, overflow: "hidden" }}>
        <div style={{ flex: showSplit ? "0 0 60%" : "1", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                {["Field Name", "Datasource", "Complexity", "Issues", "Nesting", "Used"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.dim, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((field, i) => {
                const maxSev = field.issues.find(ii => ii.severity === "error") ? "error"
                  : field.issues.find(ii => ii.severity === "warning") ? "warning"
                  : field.issues.length > 0 ? "info" : "clean";
                const isSelected = selectedField?.caption === field.caption;
                return (
                  <tr
                    key={i}
                    onClick={() => onSelectField(isSelected ? null : field)}
                    style={{ cursor: "pointer", borderBottom: `1px solid ${T.borderLight}`, borderLeft: `3px solid ${sevColor(maxSev)}`, background: isSelected ? "#eff6ff" : "transparent", transition: "background 0.1s" }}
                  >
                    <td style={{ padding: "10px 14px", fontSize: "13px", color: T.text, fontWeight: 500 }}>{field.caption}</td>
                    <td style={{ padding: "10px 14px", fontSize: "11px", color: T.dim }}>{field.datasource}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: complexColor(field.complexity_label), background: sevBg(field.complexity_label === "simple" ? "clean" : field.complexity_label === "critical" ? "error" : field.complexity_label === "complex" ? "warning" : "info"), padding: "2px 8px", borderRadius: "4px", textTransform: "uppercase" }}>
                        {field.complexity_label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: "13px" }}>
                      {field.issues.length > 0 ? (
                        <span style={{ color: maxSev === "error" ? T.error : T.warning, fontWeight: 700 }}>{field.issues.length}</span>
                      ) : <span style={{ color: T.clean }}>✓</span>}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: "13px", color: field.nesting_depth >= 7 ? T.error : field.nesting_depth >= 4 ? T.warning : T.muted }}>{field.nesting_depth}</td>
                    <td style={{ padding: "10px 14px", fontSize: "13px" }}>
                      {field.unused ? <span style={{ color: T.warning }}>⚠</span> : <span style={{ color: T.clean }}>✓</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: "48px", color: T.dim, fontSize: "14px" }}>No fields match your filters.</div>}
        </div>

        {/* Split panel */}
        {showSplit && (
          <div style={{ flex: "0 0 40%", borderLeft: `1px solid ${T.border}`, overflow: "auto", background: T.white }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: T.muted }}>Field Detail</span>
              <button onClick={() => onSelectField(null)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "16px" }}>×</button>
            </div>
            <FieldDetail field={selectedField} />
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// EMAIL CAPTURE
// ================================================================

function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setStatus("loading");
    try {
      await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "audit" }),
      });
      posthog.capture("email_captured", { source: "audit" });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "40px 32px", textAlign: "center", marginTop: "64px" }}>
      <div style={{ fontSize: "22px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>Get notified when new audit checks ship</div>
      <div style={{ fontSize: "14px", color: T.muted, marginBottom: "24px", lineHeight: 1.6 }}>We are adding new rules regularly. Drop your email and we will let you know.</div>
      {status === "done" ? (
        <div style={{ fontSize: "16px", color: "#166534", fontWeight: 600 }}>You are on the list. ✓</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ flex: 1, minWidth: "220px", maxWidth: "300px", padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "13px", color: T.text, fontFamily: T.font, outline: "none" }} />
          <button type="submit" disabled={status === "loading"}
            style={{ background: T.hdr, color: "#fff", border: "none", borderRadius: "6px", padding: "10px 24px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: T.font, opacity: status === "loading" ? 0.7 : 1 }}>
            {status === "loading" ? "..." : "Notify Me"}
          </button>
        </form>
      )}
      {status === "error" && <div style={{ fontSize: "12px", color: T.error, marginTop: "8px" }}>Something went wrong. Try again.</div>}
      <div style={{ fontSize: "12px", color: T.dim, marginTop: "12px" }}>No spam. Unsubscribe any time.</div>
    </div>
  );
}

// ================================================================
// MOCK FIELDS for See It In Action
// ================================================================

const MOCK_FIELDS = [
  { name: "YTD Revenue", after: null },
  { name: "Profit Ratio", after: { severity: "warning", label: "Division risk" } },
  { name: "Customer Segment LOD", after: { severity: "error", label: "Nested LOD" } },
  { name: "Rolling 30d Avg", after: { severity: "warning", label: "Nesting depth 5" } },
  { name: "Region Filter", after: { severity: "warning", label: "Unused field" } },
  { name: "Unused Metric 1", after: { severity: "warning", label: "Unused field" } },
];

function SeeItInAction() {
  return (
    <div style={{ padding: "48px 24px", maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, color: T.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "20px" }}>See It In Action</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px", opacity: 0.6 }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "14px" }}>Before</div>
          {MOCK_FIELDS.map((f) => (
            <div key={f.name} style={{ padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: "4px", marginBottom: "4px", fontSize: "13px", color: T.muted }}>{f.name}</div>
          ))}
        </div>
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "14px" }}>After Audit</div>
          {MOCK_FIELDS.map((f) => (
            <div key={f.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`, borderLeft: `3px solid ${f.after ? sevColor(f.after.severity) : T.clean}`, borderRadius: "4px", marginBottom: "4px", fontSize: "13px", color: T.text }}>
              <span>{f.name}</span>
              {f.after ? (
                <span style={{ fontSize: "10px", fontWeight: 700, color: sevColor(f.after.severity), background: `${sevColor(f.after.severity)}18`, padding: "2px 8px", borderRadius: "4px", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {f.after.severity}: {f.after.label}
                </span>
              ) : <span style={{ fontSize: "10px", fontWeight: 700, color: T.clean }}>Clean</span>}
            </div>
          ))}
          <div style={{ marginTop: "12px", padding: "12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "24px", fontWeight: 800, color: T.warning }}>61</div>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: T.warning, textTransform: "uppercase", letterSpacing: "0.06em" }}>Needs Attention</div>
              <div style={{ fontSize: "10px", color: T.dim }}>Health Score / 100</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// MAIN PAGE
// ================================================================

export default function AuditPage() {
  useEffect(() => {
    document.title = "Tableau Calculated Field Auditor: Find Unused, Complex & Broken Fields";
    posthog.capture("page_viewed", { page: "audit" });
    if (window.location.pathname !== "/audit") window.history.replaceState(null, "", "/audit");
  }, []);

  const [file, setFile] = useState(null);

  useEffect(() => {
    readPendingFile("twb_pending_audit").then(async (pending) => {
      if (!pending) return;
      const f = pending.file;
      setFile(f);
      setLoading(true);
      setError(null);
      setResult(null);
      setSelectedField(null);
      try {
        const r = await auditWorkbook(f);
        setResult(r);
        posthog.capture("audit_completed", {
          workbook: f.name,
          health_score: r.meta.health_score,
          total_fields: r.meta.total_calculated_fields,
          errors: r.meta.issue_breakdown.error,
          warnings: r.meta.issue_breakdown.warning,
          unused_fields: r.summary.unused_fields,
          circular_deps: r.summary.circular_dependencies,
        });
        setTimeout(() => document.getElementById("audit-results")?.scrollIntoView({ behavior: "smooth" }), 100);
      } catch (err) {
        setError(err.message || "Something went wrong");
        posthog.capture("audit_error", { error: err.message });
      } finally {
        setLoading(false);
      }
    });
  }, []);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [panelMode, setPanelMode] = useState("panel");

  const currentPath = window.location.pathname;

  const handleAudit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedField(null);
    try {
      const r = await auditWorkbook(file);
      setResult(r);
      posthog.capture("audit_completed", {
        workbook: file.name,
        health_score: r.meta.health_score,
        total_fields: r.meta.total_calculated_fields,
        errors: r.meta.issue_breakdown.error,
        warnings: r.meta.issue_breakdown.warning,
        unused_fields: r.summary.unused_fields,
        circular_deps: r.summary.circular_dependencies,
      });
      setTimeout(() => document.getElementById("audit-results")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err.message || "Something went wrong");
      posthog.capture("audit_error", { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0]; if (f) { setFile(f); setResult(null); }
  }, []);

  const { meta, summary, fields } = result || {};

  const handleSelectField = (field, modeOverride) => {
    if (modeOverride) setPanelMode(modeOverride);
    setSelectedField(field);
  };

  const showPanel = panelMode === "panel" && !!selectedField && !!result;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ background: T.hdr, padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#fff" }}>Tableau<span style={{ color: T.primary }}>to</span>Dbt</span>
        </a>
        <nav style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {[["Convert", "/"], ["Diff", "/diff"], ["Docs", "/docs"], ["Audit", "/audit"]].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: "12px", color: label === "Audit" ? "#fff" : "rgba(255,255,255,0.55)", padding: "5px 12px", borderRadius: "6px", textDecoration: "none", fontWeight: label === "Audit" ? 600 : 400, background: label === "Audit" ? "rgba(255,255,255,0.1)" : "none" }}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* Upload Bar */}
      <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
        <div
          style={{ border: `1.5px dashed ${file ? "#22c55e" : drag ? T.primary : T.border}`, borderRadius: "8px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", cursor: file ? "default" : "pointer", background: file ? "#f0fdf4" : drag ? "#f0f9ff" : T.bg, flex: 1, maxWidth: "340px", transition: "all 0.15s" }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => !file && document.getElementById("audit-upload").click()}
        >
          <input id="audit-upload" type="file" accept=".twb,.twbx" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); setResult(null); } }} />
          <span style={{ fontSize: "16px", color: file ? "#22c55e" : T.dim }}>{file ? "✓" : "↑"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {file ? (
              <>
                <div style={{ fontSize: "12px", fontFamily: T.mono, color: T.primary, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                <div style={{ fontSize: "10px", color: T.dim }}>{(file.size / 1024).toFixed(1)} KB · .twb and .twbx supported</div>
              </>
            ) : <div style={{ fontSize: "12px", color: T.muted }}>Drop .twb or .twbx. Processed in your browser.</div>}
          </div>
          {file && <button style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "16px", padding: "0 2px" }} onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}>×</button>}
        </div>

        <button
          style={{ padding: "10px 22px", background: file && !loading ? T.hdr : T.border, color: file && !loading ? "#fff" : T.dim, border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: file && !loading ? "pointer" : "not-allowed", fontFamily: T.font, whiteSpace: "nowrap" }}
          onClick={handleAudit}
          disabled={!file || loading}
        >
          {loading ? "Auditing…" : "Run Audit →"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fca5a5", fontSize: "13px", color: "#991b1b" }}>{error}</div>
      )}

      {/* Results */}
      {result && (
        <div id="audit-results" style={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Health Strip */}
          <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "16px 24px", display: "flex", alignItems: "center", gap: "24px", flexShrink: 0, flexWrap: "wrap" }}>
            <HealthGauge score={meta.health_score} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: T.text, marginBottom: "6px" }}>{meta.workbook_name}</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                {meta.issue_breakdown.error > 0 && <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 10px", borderRadius: "9999px", background: "#fef2f2", color: T.error }}>{meta.issue_breakdown.error} Errors</span>}
                {meta.issue_breakdown.warning > 0 && <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 10px", borderRadius: "9999px", background: "#fffbeb", color: T.warning }}>{meta.issue_breakdown.warning} Warnings</span>}
                {meta.issue_breakdown.info > 0 && <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 10px", borderRadius: "9999px", background: "#eff6ff", color: T.info }}>{meta.issue_breakdown.info} Info</span>}
                {meta.total_issues === 0 && <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 10px", borderRadius: "9999px", background: "#f0fdf4", color: T.clean }}>All Clear</span>}
              </div>
              <div style={{ fontSize: "11px", color: T.dim }}>Audited {new Date(meta.audited_at).toLocaleString()} · {meta.total_calculated_fields} calculated fields</div>
            </div>
            {/* Summary mini-cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, auto)", gap: "8px" }}>
              {[
                [summary.unused_fields, "Unused", T.warning],
                [summary.performance_issues, "Perf Issues", T.warning],
                [summary.circular_dependencies, "Circular Deps", T.error],
                [summary.high_complexity_fields, "High Complexity", "#f97316"],
                [summary.fields_needing_attention, "Need Attention", T.warning],
              ].map(([num, label, color]) => (
                <div key={label} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "10px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: num > 0 ? color : T.clean, lineHeight: 1 }}>{num}</div>
                  <div style={{ fontSize: "9px", color: T.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "2px", whiteSpace: "nowrap" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, padding: "16px 24px", overflow: "auto" }}>
            {fields.length > 0 ? (
              <AuditTable
                fields={fields}
                result={result}
                selectedField={selectedField}
                onSelectField={handleSelectField}
                panelMode={panelMode}
              />
            ) : (
              <div style={{ textAlign: "center", padding: "48px", color: T.dim, fontSize: "15px" }}>No calculated fields found in this workbook.</div>
            )}
          </div>

          {/* Bottom panel */}
          {showPanel && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "360px", background: T.white, borderTop: `2px solid ${T.border}`, boxShadow: "0 -4px 24px rgba(0,0,0,0.1)", zIndex: 200, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: T.muted }}>Field Detail</span>
                <button onClick={() => setSelectedField(null)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "18px" }}>×</button>
              </div>
              <div style={{ flex: 1, overflow: "auto" }}>
                <FieldDetail field={selectedField} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Marketing (no results) */}
      {!result && (
        <main style={{ flex: 1 }}>
          {/* Hero */}
          <div style={{ padding: "64px 24px 48px", textAlign: "center", borderBottom: `1px solid ${T.border}` }}>
            <h1 style={{ fontSize: "clamp(28px, 6vw, 48px)", fontWeight: 800, color: T.text, marginBottom: "14px", letterSpacing: "-0.02em" }}>
              Audit Your Tableau<br /><span style={{ color: T.primary }}>Calculated Fields</span>
            </h1>
            <p style={{ fontSize: "16px", color: T.muted, maxWidth: "560px", margin: "0 auto 24px", lineHeight: 1.7 }}>
              Find unused fields, performance anti-patterns, circular dependencies, and complexity issues before they become production problems.
            </p>
            <div style={{ display: "flex", gap: "32px", justifyContent: "center", flexWrap: "wrap" }}>
              {[["7", "audit checks"], ["5", "issue categories"], ["instant", "results"]].map(([num, label]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: T.primary }}>{num}</div>
                  <div style={{ fontSize: "11px", color: T.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "2px" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <SeeItInAction />

          <div style={{ padding: "0 24px 48px", maxWidth: "1000px", margin: "0 auto" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: T.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "16px" }}>What You Get</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px", marginBottom: "48px" }}>
              {[
                ["👻", "Unused Fields", "warning", "Fields defined but never referenced in any sheet, dashboard, or formula."],
                ["⚡", "Performance Issues", "error", "Nested LODs, unprotected division, WINDOW functions, and long IF/ELSEIF chains."],
                ["🔄", "Circular Dependencies", "error", "Fields that reference each other in a loop. The auditor maps your full dependency graph."],
                ["📐", "Deep Nesting", "warning", "Formulas with parenthesis nesting beyond depth 4 become impossible to debug."],
                ["📊", "Complexity Score", "info", "Every field gets a 0–100 score. Filter by Simple, Moderate, Complex, or Critical."],
              ].map(([icon, title, sev, body]) => (
                <div key={title} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
                  <div style={{ fontSize: "22px", marginBottom: "10px" }}>{icon}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: T.text }}>{title}</div>
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", color: sevColor(sev), background: sevBg(sev), textTransform: "uppercase" }}>{sev}</span>
                  </div>
                  <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7 }}>{body}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: "10px", fontWeight: 700, color: T.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "16px" }}>How It Works</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "48px" }}>
              {[
                ["01", "Upload your workbook", "Drop any .twb or .twbx file. We parse the workbook XML directly in your browser. Nothing is stored on our servers."],
                ["02", "Seven checks run instantly", "We scan every calculated field for unused references, performance anti-patterns, circular dependencies, deep nesting, and complexity."],
                ["03", "Prioritize and fix", "Errors first, then warnings. Every issue includes a plain-English explanation. Export the full report for your team."],
              ].map(([num, title, body]) => (
                <div key={num} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: T.border, marginBottom: "8px" }}>{num}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "6px" }}>{title}</div>
                  <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7 }}>{body}</div>
                </div>
              ))}
            </div>

            <EmailCapture />
          </div>
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
