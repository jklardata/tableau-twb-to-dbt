import { useState, useCallback, useEffect, useMemo } from "react";
import { diffWorkbooks, diffFormula } from "../lib/diffEngine.js";
import posthog from "posthog-js";

// ================================================================
// DESIGN TOKENS
// ================================================================

const T = {
  bg: "#f8fafc", white: "#fff", text: "#1e293b", muted: "#64748b",
  dim: "#94a3b8", border: "#e2e8f0", borderLight: "#f1f5f9",
  primary: "#0ea5e9", hdr: "#1e293b",
  font: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
  add: { bg: "#dcfce7", text: "#166534", bar: "#22c55e", row: "#f0fdf4" },
  rem: { bg: "#fee2e2", text: "#991b1b", bar: "#ef4444", row: "#fef2f2" },
  mod: { bg: "#fef9c3", text: "#854d0e", bar: "#f59e0b", row: "#fffbeb" },
};

const CATEGORY_LABELS = {
  calculated_fields: "Calc Fields",
  parameters: "Parameters",
  data_sources: "Data Sources",
  sheets: "Sheets",
  filters: "Filters",
};

// ================================================================
// FLATTEN RESULT
// ================================================================

function flattenResult(result) {
  const rows = [];
  let id = 0;
  for (const [catKey, label] of Object.entries(CATEGORY_LABELS)) {
    const d = result[catKey];
    if (!d) continue;
    for (const item of d.added)
      rows.push({ id: id++, name: item.name || item.column || "—", cat: label, catKey, type: "added", before: null, after: item });
    for (const item of d.removed)
      rows.push({ id: id++, name: item.name || item.column || "—", cat: label, catKey, type: "removed", before: item, after: null });
    for (const item of d.modified)
      rows.push({ id: id++, name: item.name, cat: label, catKey, type: "modified", before: item.before, after: item.after });
  }
  return rows;
}

function rowSummary(obj) {
  if (!obj) return "—";
  if (obj.formula) return obj.formula;
  return Object.entries(obj).filter(([k]) => k !== "name").map(([k, v]) => `${k}: ${v}`).join(" · ");
}

// ================================================================
// FORMULA DIFF (light theme)
// ================================================================

function FormulaDiff({ before, after }) {
  const diff = diffFormula(before ?? "", after ?? "");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <div>
        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#991b1b", marginBottom: "4px" }}>Before</div>
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", padding: "10px 12px", fontSize: "11px", fontFamily: T.mono, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {diff.before.map((t, i) => (
            <span key={i} style={{ background: t.changed ? "rgba(254,202,202,0.9)" : "transparent", color: t.changed ? "#991b1b" : T.muted, borderRadius: "2px" }}>{t.token} </span>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#166534", marginBottom: "4px" }}>After</div>
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", padding: "10px 12px", fontSize: "11px", fontFamily: T.mono, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {diff.after.map((t, i) => (
            <span key={i} style={{ background: t.changed ? "rgba(187,247,208,0.9)" : "transparent", color: t.changed ? "#166534" : T.muted, borderRadius: "2px" }}>{t.token} </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// ROW DETAIL PANEL
// ================================================================

function RowDetail({ row }) {
  if (!row) return null;
  const typeC = row.type === "added" ? T.add : row.type === "removed" ? T.rem : T.mod;
  const isCalcModified = row.type === "modified" && row.catKey === "calculated_fields" && row.before?.formula !== row.after?.formula;

  return (
    <div style={{ padding: "20px", fontFamily: T.font }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: T.text }}>{row.name}</span>
        <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", background: T.bg, color: T.muted }}>{row.cat}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px", background: typeC.bg, color: typeC.text }}>
          {row.type === "added" ? "+ Added" : row.type === "removed" ? "− Removed" : "~ Modified"}
        </span>
      </div>

      {isCalcModified ? (
        <FormulaDiff before={row.before.formula} after={row.after.formula} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {[["Before", row.before, "#991b1b", "#fef2f2", "#fca5a5"], ["After", row.after, "#166534", "#f0fdf4", "#86efac"]].map(([label, data, labelColor, bg, brd]) => (
            <div key={label}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: labelColor, marginBottom: "4px" }}>{label}</div>
              <div style={{ background: bg, border: `1px solid ${brd}`, borderRadius: "6px", padding: "10px 12px", fontSize: "12px", fontFamily: T.mono, lineHeight: 1.8 }}>
                {data ? (
                  Object.entries(data).filter(([k]) => k !== "name").map(([k, v]) => (
                    <div key={k}><span style={{ color: T.dim }}>{k}: </span><span style={{ color: T.text }}>{String(v)}</span></div>
                  ))
                ) : <span style={{ color: T.dim }}>—</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isCalcModified && row.catKey === "calculated_fields" && (row.before?.formula || row.after?.formula) && (
        <div style={{ marginTop: "12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "8px 12px", fontSize: "11px", fontFamily: T.mono, color: T.muted, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {row.before?.formula || row.after?.formula}
        </div>
      )}
    </div>
  );
}

// ================================================================
// EMAIL CAPTURE
// ================================================================

function EmailCapture() {
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
        body: JSON.stringify({ email: email.trim(), source: "diff" }),
      });
      posthog.capture("email_captured", { source: "diff" });
      setStatus("done");
    } catch {
      setStatus("done");
    }
  };

  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "40px 32px", textAlign: "center", marginTop: "64px" }}>
      <div style={{ fontSize: "22px", fontWeight: 700, color: T.text, marginBottom: "8px" }}>Stay in the loop</div>
      <div style={{ fontSize: "14px", color: T.muted, marginBottom: "24px" }}>Get notified when we add new Tableau tools. No spam.</div>
      {status === "done" ? (
        <div style={{ color: "#166534", fontSize: "14px" }}>You're on the list.</div>
      ) : (
        <form style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }} onSubmit={handleSubmit}>
          <input style={{ padding: "10px 14px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "13px", fontFamily: T.font, width: "260px", outline: "none", color: T.text }} type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button style={{ padding: "10px 20px", background: T.hdr, color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: T.font }} type="submit" disabled={status === "loading"}>
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

export default function DiffPage() {
  useEffect(() => {
    document.title = "Tableau Workbook Diff: Compare Two Tableau Workbooks Side by Side";
    posthog.capture("page_viewed", { page: "diff" });
  }, []);

  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);

  useEffect(() => {
    function restoreFile(key, setter) {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key);
      const { name, data } = JSON.parse(raw);
      fetch(data).then(r => r.blob()).then(blob => setter(new File([blob], name)));
    }
    restoreFile("twb_pending_diff1", setFile1);
    restoreFile("twb_pending_diff2", setFile2);
  }, []);
  const [drag1, setDrag1] = useState(false);
  const [drag2, setDrag2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [catFilter, setCatFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [panelMode, setPanelMode] = useState("panel");

  const canCompare = file1 && file2 && !loading;
  const currentPath = window.location.pathname;

  const handleCompare = async () => {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedRow(null);
    try {
      const r = await diffWorkbooks(file1, file2);
      setResult(r);
      posthog.capture("diff_compared", {
        total_changes: r.summary.total_changes,
        has_changes: r.summary.has_changes,
        file1: file1.name,
        file2: file2.name,
      });
    } catch (err) {
      setError(err.message || "Something went wrong");
      posthog.capture("diff_error", { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tableau-diff-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    posthog.capture("diff_exported", { total_changes: result.summary.total_changes });
  };

  const allRows = useMemo(() => result ? flattenResult(result) : [], [result]);
  const added = allRows.filter(r => r.type === "added").length;
  const removed = allRows.filter(r => r.type === "removed").length;
  const modified = allRows.filter(r => r.type === "modified").length;

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (catFilter) rows = rows.filter(r => r.cat === catFilter);
    if (typeFilter) rows = rows.filter(r => r.type === typeFilter);
    if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
    return rows;
  }, [allRows, catFilter, typeFilter, search]);

  const handleDrop1 = useCallback((e) => {
    e.preventDefault(); setDrag1(false);
    const f = e.dataTransfer.files[0]; if (f) { setFile1(f); setResult(null); }
  }, []);
  const handleDrop2 = useCallback((e) => {
    e.preventDefault(); setDrag2(false);
    const f = e.dataTransfer.files[0]; if (f) { setFile2(f); setResult(null); }
  }, []);

  const showResults = !!result;
  const showSplit = panelMode === "split" && !!selectedRow;
  const showPanel = panelMode === "panel" && !!selectedRow;

  const dzStyle = (file, drag) => ({
    border: `1.5px dashed ${file ? "#22c55e" : drag ? T.primary : T.border}`,
    borderRadius: "8px", padding: "10px 16px", display: "flex", alignItems: "center",
    gap: "10px", cursor: file ? "default" : "pointer",
    background: file ? "#f0fdf4" : drag ? "#f0f9ff" : T.bg,
    flex: 1, maxWidth: "280px", transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ background: T.hdr, padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#fff" }}>Tableau<span style={{ color: T.primary }}>to</span>Dbt</span>
        </a>
        <nav style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {[["Convert", "/app"], ["Diff", "/app/diff"], ["Docs", "/app/docs"], ["Audit", "/app/audit"]].map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: "12px", color: currentPath === href ? "#fff" : "rgba(255,255,255,0.55)", padding: "5px 12px", borderRadius: "6px", textDecoration: "none", fontWeight: currentPath === href ? 600 : 400, background: currentPath === href ? "rgba(255,255,255,0.1)" : "none" }}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* Upload Bar */}
      <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, flexWrap: "wrap" }}>
        {/* Before */}
        <div style={dzStyle(file1, drag1)}
          onDragOver={(e) => { e.preventDefault(); setDrag1(true); }}
          onDragLeave={() => setDrag1(false)}
          onDrop={handleDrop1}
          onClick={() => !file1 && document.getElementById("dz1").click()}
        >
          <input id="dz1" type="file" accept=".twb,.twbx" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) { setFile1(e.target.files[0]); setResult(null); } }} />
          <span style={{ fontSize: "16px", color: file1 ? "#22c55e" : T.dim }}>{file1 ? "✓" : "↑"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim }}>Before</div>
            {file1 ? (
              <>
                <div style={{ fontSize: "12px", fontFamily: T.mono, color: T.primary, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file1.name}</div>
                <div style={{ fontSize: "10px", color: T.dim }}>{(file1.size / 1024).toFixed(1)} KB</div>
              </>
            ) : <div style={{ fontSize: "12px", color: T.muted }}>Drop .twb or .twbx</div>}
          </div>
          {file1 && <button style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "16px", padding: "0 2px" }} onClick={(e) => { e.stopPropagation(); setFile1(null); setResult(null); }}>×</button>}
        </div>

        <span style={{ fontSize: "18px", color: T.border, fontWeight: 700 }}>→</span>

        {/* After */}
        <div style={dzStyle(file2, drag2)}
          onDragOver={(e) => { e.preventDefault(); setDrag2(true); }}
          onDragLeave={() => setDrag2(false)}
          onDrop={handleDrop2}
          onClick={() => !file2 && document.getElementById("dz2").click()}
        >
          <input id="dz2" type="file" accept=".twb,.twbx" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) { setFile2(e.target.files[0]); setResult(null); } }} />
          <span style={{ fontSize: "16px", color: file2 ? "#22c55e" : T.dim }}>{file2 ? "✓" : "↑"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim }}>After</div>
            {file2 ? (
              <>
                <div style={{ fontSize: "12px", fontFamily: T.mono, color: T.primary, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file2.name}</div>
                <div style={{ fontSize: "10px", color: T.dim }}>{(file2.size / 1024).toFixed(1)} KB</div>
              </>
            ) : <div style={{ fontSize: "12px", color: T.muted }}>Drop .twb or .twbx</div>}
          </div>
          {file2 && <button style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "16px", padding: "0 2px" }} onClick={(e) => { e.stopPropagation(); setFile2(null); setResult(null); }}>×</button>}
        </div>

        <button
          style={{ padding: "10px 22px", background: canCompare ? T.hdr : T.border, color: canCompare ? "#fff" : T.dim, border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: canCompare ? "pointer" : "not-allowed", fontFamily: T.font, marginLeft: "auto", whiteSpace: "nowrap" }}
          onClick={handleCompare}
          disabled={!canCompare}
        >
          {loading ? "Analyzing…" : "Compare →"}
        </button>

        {result && (
          <button style={{ padding: "10px 14px", background: T.white, color: T.text, border: `1px solid ${T.border}`, borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: T.font }} onClick={handleExport}>
            ↓ JSON
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fca5a5", fontSize: "13px", color: "#991b1b" }}>{error}</div>
      )}

      {/* Results */}
      {showResults && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* KPI Strip */}
          {result.summary.has_changes && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: T.white, borderBottom: `2px solid ${T.border}`, flexShrink: 0 }}>
              {[
                [allRows.length, "Total Changes", T.text, T.border],
                [added, "Added", "#166534", "#22c55e"],
                [removed, "Removed", "#991b1b", "#ef4444"],
                [modified, "Modified", "#854d0e", "#f59e0b"],
              ].map(([num, label, color, accent], i) => (
                <div key={label} style={{ padding: "16px 24px", borderRight: i < 3 ? `1px solid ${T.border}` : "none", position: "relative" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color, lineHeight: 1 }}>
                    {label === "Added" ? `+${num}` : label === "Removed" ? `−${num}` : label === "Modified" ? `~${num}` : num}
                  </div>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "3px", background: accent }} />
                </div>
              ))}
            </div>
          )}

          {!result.summary.has_changes && (
            <div style={{ padding: "40px", textAlign: "center", color: "#166534", background: T.white, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: "24px", marginBottom: "8px" }}>✓</div>
              <div style={{ fontWeight: 700 }}>No differences found</div>
              <div style={{ fontSize: "12px", color: T.muted, marginTop: "4px" }}>{result.meta.file1_name} and {result.meta.file2_name} are identical.</div>
            </div>
          )}

          {result.summary.has_changes && (
            <>
              {/* Toolbar */}
              <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: T.text }}>Results</span>
                <select style={{ padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.text, background: T.white }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                  <option value="">All Categories</option>
                  {Object.values(CATEGORY_LABELS).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select style={{ padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.text, background: T.white }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">All Changes</option>
                  <option value="added">Added</option>
                  <option value="removed">Removed</option>
                  <option value="modified">Modified</option>
                </select>
                <input style={{ padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: "6px", fontSize: "12px", fontFamily: T.font, color: T.text, width: "200px", outline: "none" }} placeholder="🔍 Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                  {["panel", "split"].map(mode => (
                    <button key={mode} onClick={() => setPanelMode(mode)} style={{ padding: "5px 12px", border: `1px solid ${panelMode === mode ? "#bae6fd" : T.border}`, borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: T.font, color: panelMode === mode ? T.primary : T.muted, background: panelMode === mode ? "#f0f9ff" : T.white }}>
                      {mode === "panel" ? "⊟ Panel" : "⊠ Split"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table + side */}
              <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                <div style={{ flex: showSplit ? "0 0 58%" : "1", overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", fontFamily: T.font }}>
                    <thead>
                      <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                        {["Name", "Category", "Change", "Before", "After"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: T.muted, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(row => {
                        const typeC = row.type === "added" ? T.add : row.type === "removed" ? T.rem : T.mod;
                        const isSelected = selectedRow?.id === row.id;
                        return (
                          <tr
                            key={row.id}
                            onClick={() => setSelectedRow(isSelected ? null : row)}
                            style={{ cursor: "pointer", borderBottom: `1px solid ${T.borderLight}`, borderLeft: `3px solid ${typeC.bar}`, background: isSelected ? "#eff6ff" : "transparent" }}
                          >
                            <td style={{ padding: "10px 16px", fontWeight: 600, color: T.text }}>{row.name}</td>
                            <td style={{ padding: "10px 16px" }}>
                              <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: T.bg, color: T.muted }}>{row.cat}</span>
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: typeC.bg, color: typeC.text }}>
                                {row.type === "added" ? "+ Added" : row.type === "removed" ? "− Removed" : "~ Modified"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 16px", fontFamily: T.mono, fontSize: "11px", color: T.dim, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {rowSummary(row.before)}
                            </td>
                            <td style={{ padding: "10px 16px", fontFamily: T.mono, fontSize: "11px", color: row.type === "added" ? "#166534" : T.dim, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {rowSummary(row.after)}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredRows.length === 0 && (
                        <tr><td colSpan={5} style={{ padding: "48px", textAlign: "center", color: T.dim, fontSize: "14px" }}>No results match your filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Split panel */}
                {showSplit && (
                  <div style={{ flex: "0 0 42%", borderLeft: `1px solid ${T.border}`, overflow: "auto", background: T.white }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: T.muted }}>Detail</span>
                      <button onClick={() => setSelectedRow(null)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "16px" }}>×</button>
                    </div>
                    <RowDetail row={selectedRow} />
                  </div>
                )}
              </div>

              {/* Bottom panel */}
              {showPanel && (
                <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "340px", background: T.white, borderTop: `2px solid ${T.border}`, boxShadow: "0 -4px 24px rgba(0,0,0,0.1)", zIndex: 200, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: T.muted }}>Detail</span>
                    <button onClick={() => setSelectedRow(null)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: "18px" }}>×</button>
                  </div>
                  <div style={{ flex: 1, overflow: "auto" }}>
                    <RowDetail row={selectedRow} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Marketing (no results) */}
      {!showResults && (
        <main style={{ flex: 1 }}>

          {/* Dark hero — headline left, mock table right */}
          <div style={{ background: T.hdr, padding: "56px 48px", overflow: "hidden", position: "relative" }}>
            <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 500px", gap: "48px", alignItems: "center" }}>
              {/* Left */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: T.primary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>
                  Free · Browser-only · Instant results
                </div>
                <h1 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 800, color: "#fff", lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: "16px" }}>
                  See exactly what changed between two <span style={{ color: T.primary }}>Tableau workbooks</span>
                </h1>
                <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.6)", lineHeight: 1.75, marginBottom: "28px", maxWidth: "420px" }}>
                  Drop a before and after .twbx. Get a clean diff of every calculated field, parameter, data source, sheet, and filter in seconds.
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["Free forever", "No account required", "Files stay in your browser", ".twb and .twbx"].map(p => (
                    <span key={p} style={{ padding: "5px 12px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "20px", fontSize: "11px", color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{p}</span>
                  ))}
                </div>
              </div>
              {/* Right — mock table */}
              <div style={{ background: T.white, borderRadius: "12px", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
                {/* mock title bar */}
                <div style={{ background: T.bg, borderBottom: `1px solid ${T.border}`, padding: "8px 12px", display: "flex", gap: "6px", alignItems: "center" }}>
                  {["#ef4444","#f59e0b","#22c55e"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
                  <div style={{ flex: 1, height: 6, background: T.border, borderRadius: 3, marginLeft: 4 }} />
                </div>
                {/* mock KPI strip */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${T.border}` }}>
                  {[["6","Total","#1e293b",T.border],["2","Added","#166534","#22c55e"],["-1","Removed","#991b1b","#ef4444"],["3","Modified","#854d0e","#f59e0b"]].map(([n,l,c,bar]) => (
                    <div key={l} style={{ padding: "10px 12px", borderRight: l !== "Modified" ? `1px solid ${T.border}` : "none", position: "relative" }}>
                      <div style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", color: T.dim, marginBottom: "2px" }}>{l}</div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: c, lineHeight: 1 }}>{n}</div>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: bar }} />
                    </div>
                  ))}
                </div>
                {/* mock toolbar */}
                <div style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: "6px" }}>
                  {[80, 80, 120].map((w,i) => <div key={i} style={{ height: 22, width: w, background: T.bg, borderRadius: 4, border: `1px solid ${T.border}` }} />)}
                </div>
                {/* mock rows */}
                {[
                  ["Profit Margin","Calc Field","~ Modified","#f59e0b"],
                  ["Customer LTV","Calc Field","+ Added","#22c55e"],
                  ["Date Granularity","Parameter","− Removed","#ef4444"],
                  ["Region Filter","Filter","~ Modified","#f59e0b"],
                ].map(([name,cat,chg,bar]) => {
                  const bgMap = {"+ Added":"#dcfce7","− Removed":"#fee2e2","~ Modified":"#fef9c3"};
                  const txtMap = {"+ Added":"#166534","− Removed":"#991b1b","~ Modified":"#854d0e"};
                  return (
                    <div key={name} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${T.borderLight}`, borderLeft: `3px solid ${bar}` }}>
                      <div style={{ padding: "8px 10px", fontSize: "11px", fontWeight: 600, color: T.text, flex: "0 0 130px" }}>{name}</div>
                      <div style={{ padding: "8px 6px", flex: "0 0 90px" }}><span style={{ fontSize: "9px", fontWeight: 600, background: T.bg, color: T.muted, padding: "2px 6px", borderRadius: 3 }}>{cat}</span></div>
                      <div style={{ padding: "8px 6px", flex: 1 }}><span style={{ fontSize: "9px", fontWeight: 700, background: bgMap[chg], color: txtMap[chg], padding: "2px 7px", borderRadius: 12 }}>{chg}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stats band */}
          <div style={{ background: T.primary, display: "flex", overflow: "hidden" }}>
            {[["5","diff categories"],["∞","workbook size"],["<1s","parse time"],["0","data uploaded"]].map(([n,l],i) => (
              <div key={l} style={{ flex: 1, textAlign: "center", padding: "18px 24px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.2)" : "none" }}>
                <div style={{ fontSize: "28px", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.75)", marginTop: "4px" }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Feature grid */}
          <div style={{ padding: "56px 48px", maxWidth: "1100px", margin: "0 auto" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: T.dim, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>What You Get</div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: T.text, letterSpacing: "-0.02em", marginBottom: "8px" }}>Everything that changed, nothing that didn't.</div>
            <p style={{ fontSize: "15px", color: T.muted, maxWidth: "520px", lineHeight: 1.65, marginBottom: "32px" }}>A clean, filterable table covering all five diff categories. Click any row for formula-level detail.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "56px" }}>
              {[
                ["🔍", "Token-level formula diffs", "Side-by-side before/after with individual tokens highlighted. Know exactly which part of a formula changed."],
                ["📋", "Parameter changes", "Spot new, removed, or reconfigured parameters. See value changes, type changes, and range modifications."],
                ["🗄️", "Data source tracking", "See which connections were added, removed, or renamed. Connection type, server, and database are all tracked."],
                ["📊", "Sheet & dashboard diffs", "Know which views changed across workbook versions. Track worksheet and dashboard additions and removals."],
                ["🎛️", "Filter changes", "Track filter additions and removals per sheet. Include/exclude values and range changes tracked."],
                ["⊠", "Panel & split view", "Click any row to see full detail. Toggle between a bottom panel or a 60/40 split layout to compare formulas."],
              ].map(([icon, title, body]) => (
                <div key={title} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "22px" }}>
                  <div style={{ fontSize: "24px", marginBottom: "12px" }}>{icon}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: T.text, marginBottom: "6px" }}>{title}</div>
                  <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.65 }}>{body}</div>
                </div>
              ))}
            </div>

            {/* Dark CTA banner */}
            <div style={{ background: T.hdr, borderRadius: "16px", padding: "48px", textAlign: "center", marginBottom: "48px", position: "relative", overflow: "hidden" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", marginBottom: "10px" }}>Ready to compare?</div>
              <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.55)", marginBottom: "28px", lineHeight: 1.65 }}>
                Drop your workbooks in the bar at the top of the page. Your files never leave your browser.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: "12px", maxWidth: "600px", margin: "0 auto 12px", alignItems: "center" }}>
                {[["Before", "↑ Drop .twbx"], ["After", "↑ Drop .twbx"]].map(([label, txt], i) => (
                  <>
                    {i === 1 && <div key="arrow" style={{ fontSize: "20px", color: "rgba(255,255,255,0.25)", fontWeight: 700 }}>→</div>}
                    <div key={label} style={{ border: "1.5px dashed rgba(255,255,255,0.2)", borderRadius: "8px", padding: "16px", textAlign: "center", cursor: "pointer" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>{label}</div>
                      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>{txt}</div>
                    </div>
                  </>
                ))}
                <button style={{ padding: "12px 20px", background: T.primary, color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "not-allowed", fontFamily: T.font, opacity: 0.5 }}>Compare →</button>
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>🔒 All processing is local. Nothing is uploaded.</div>
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
