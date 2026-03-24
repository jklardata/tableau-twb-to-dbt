import { useState, useCallback, useMemo } from "react";
import { auditWorkbook } from "../lib/auditEngine.js";
import { detectDuplicates, estimateEffort, summarizePortfolio, EFFORT_CONFIG } from "../lib/multiWorkbookAnalysis.js";
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
};

const NAV = [["Convert", "/"], ["Diff", "/diff"], ["Docs", "/docs"], ["Audit", "/audit"], ["Insights", "/insights"], ["Scorecard", "https://tableautodbt.com/scorecard"]];

// ================================================================
// SHARED PILL
// ================================================================

function Pill({ color, children }) {
  const map = {
    blue: { bg: "#dbeafe", text: "#1d4ed8" },
    green: { bg: "#dcfce7", text: "#166534" },
    amber: { bg: "#fef3c7", text: "#92400e" },
    red: { bg: "#fef2f2", text: "#991b1b" },
    gray: { bg: T.bg, text: T.muted },
  };
  const c = map[color] || map.gray;
  return (
    <span style={{ display: "inline-flex", fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "9999px", background: c.bg, color: c.text, marginRight: "4px" }}>
      {children}
    </span>
  );
}

// ================================================================
// DUPLICATE FIELDS TAB
// ================================================================

function DuplicatesTab({ duplicates, workbookCount }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const diverged = duplicates.filter((d) => d.type === "diverged");
  const identical = duplicates.filter((d) => d.type === "identical");

  const visible = filter === "diverged" ? diverged : filter === "identical" ? identical : duplicates;

  if (duplicates.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "64px", color: T.dim }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: T.muted }}>No duplicate field names found across workbooks</div>
        <div style={{ fontSize: "12px", color: T.dim, marginTop: "4px" }}>Each calculated field name appears in only one workbook</div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        {[
          { key: "all", label: `All (${duplicates.length})`, color: T.text },
          { key: "diverged", label: `⚠ Diverged (${diverged.length})`, color: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
          { key: "identical", label: `✓ Identical (${identical.length})`, color: "#166534", bg: "#f0fdf4", border: "#86efac" },
        ].map(({ key, label, color, bg, border }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: "5px 12px", fontSize: "11px", fontWeight: 600,
              background: filter === key ? (bg || T.hdr) : T.white,
              color: filter === key ? (bg ? color : "#fff") : T.muted,
              border: `1px solid ${filter === key ? (border || T.hdr) : T.border}`,
              borderRadius: "6px", cursor: "pointer", fontFamily: T.font,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {diverged.length > 0 && filter !== "identical" && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "#92400e" }}>
          <strong>{diverged.length} diverged field{diverged.length !== 1 ? "s" : ""}</strong> — same name, different formulas across workbooks. These represent inconsistent business logic that should be standardized before migration.
        </div>
      )}

      {/* List */}
      {visible.map((d, i) => (
        <div key={i} style={{ background: T.white, border: `1px solid ${d.type === "diverged" ? "#fca5a5" : T.border}`, borderRadius: "8px", marginBottom: "6px", overflow: "hidden" }}>
          <div
            style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: T.text }}>{d.caption}</span>
                {d.type === "diverged" ? (
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "9999px", background: "#fef2f2", color: "#991b1b" }}>⚠ Diverged</span>
                ) : (
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "9999px", background: "#f0fdf4", color: "#166534" }}>✓ Identical</span>
                )}
              </div>
              <div style={{ fontSize: "10px", color: T.dim }}>
                {d.workbookCount} workbooks{d.type === "diverged" ? ` · ${d.formulaVariants} formula variants` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "320px" }}>
              {d.workbooks.slice(0, 4).map((wb, wi) => <Pill key={wi} color="gray">{wb}</Pill>)}
              {d.workbooks.length > 4 && <Pill color="gray">+{d.workbooks.length - 4}</Pill>}
            </div>
            <span style={{ color: T.dim, fontSize: "12px", flexShrink: 0 }}>{expanded === i ? "▲" : "▼"}</span>
          </div>

          {expanded === i && (
            <div style={{ borderTop: `1px solid ${T.border}`, padding: "14px 16px" }}>
              {d.entries.map((entry, ei) => (
                <div key={ei} style={{ marginBottom: ei < d.entries.length - 1 ? "12px" : 0 }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                    {entry.workbook} · {entry.datasource}
                  </div>
                  <pre style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "10px 12px", fontSize: "11px", fontFamily: T.mono, color: T.text, margin: 0, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {entry.formula}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ================================================================
// MIGRATION EFFORT TAB
// ================================================================

function EffortTab({ effort, workbooks }) {
  const { tiers, totalMin, totalMax, byWorkbook } = effort;
  const totalFields = Object.values(tiers).reduce((sum, arr) => sum + arr.length, 0);

  const fmtHours = (h) => h >= 40 ? `${(h / 40).toFixed(1)} wks` : `${h}h`;

  return (
    <div>
      {/* Total estimate */}
      <div style={{ background: T.hdr, borderRadius: "10px", padding: "20px 24px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Estimated Migration Effort</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff" }}>{fmtHours(totalMin)} — {fmtHours(totalMax)}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>{totalFields} calculated fields across {workbooks.length} workbook{workbooks.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          {/* Proportional bar */}
          <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", gap: "2px", marginBottom: "8px" }}>
            {["low", "medium", "high"].map((tier) => {
              const pct = totalFields > 0 ? (tiers[tier].length / totalFields) * 100 : 0;
              return pct > 0 ? (
                <div key={tier} style={{ flex: `${pct} 0 0`, background: EFFORT_CONFIG[tier].color, borderRadius: "4px" }} title={`${EFFORT_CONFIG[tier].label}: ${tiers[tier].length} fields`} />
              ) : null;
            })}
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {["low", "medium", "high"].map((tier) => (
              <div key={tier} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: EFFORT_CONFIG[tier].color, flexShrink: 0 }} />
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>{EFFORT_CONFIG[tier].label}: {tiers[tier].length}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tier cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px" }}>
        {["low", "medium", "high"].map((tier) => {
          const cfg = EFFORT_CONFIG[tier];
          const fields = tiers[tier];
          const tierMin = +(fields.length * cfg.min).toFixed(1);
          const tierMax = +(fields.length * cfg.max).toFixed(1);
          return (
            <div key={tier} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "10px", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: cfg.color, flexShrink: 0 }} />
                <div style={{ fontSize: "12px", fontWeight: 700, color: cfg.text }}>{cfg.label} Complexity</div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: cfg.text, marginBottom: "2px" }}>{fields.length}</div>
              <div style={{ fontSize: "10px", color: cfg.text, opacity: 0.8, marginBottom: "6px" }}>fields</div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: cfg.text }}>
                {tierMin > 0 ? `${fmtHours(tierMin)} — ${fmtHours(tierMax)}` : "—"}
              </div>
              <div style={{ fontSize: "10px", color: cfg.text, opacity: 0.7, marginTop: "6px", lineHeight: 1.4 }}>{cfg.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Per-workbook table */}
      <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim }}>Per-Workbook Breakdown</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {["Workbook", "Fields", "Low", "Medium", "High", "Est. Hours"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.dim, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workbooks.map((wb, i) => {
                const row = byWorkbook[wb.name] || {};
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                    <td style={{ padding: "9px 14px", color: T.text, fontWeight: 500, maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wb.name}</td>
                    <td style={{ padding: "9px 14px", color: T.muted }}>{row.total || 0}</td>
                    <td style={{ padding: "9px 14px", color: "#166534" }}>{row.low || 0}</td>
                    <td style={{ padding: "9px 14px", color: "#92400e" }}>{row.medium || 0}</td>
                    <td style={{ padding: "9px 14px", color: "#991b1b" }}>{row.high || 0}</td>
                    <td style={{ padding: "9px 14px", color: T.text, fontWeight: 600 }}>
                      {row.minHours != null ? `${row.minHours}h — ${row.maxHours}h` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* High complexity fields list */}
      {tiers.high.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "8px" }}>High Complexity Fields — Manual Translation Required</div>
          {tiers.high.map((f, i) => (
            <div key={i} style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", marginBottom: "4px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#991b1b", marginBottom: "2px" }}>{f.caption}</div>
                <div style={{ fontSize: "10px", color: "#b91c1c", opacity: 0.8 }}>{f.workbook} · {f.datasource} · nesting depth {f.nesting_depth}</div>
              </div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#991b1b", background: "#fee2e2", padding: "2px 8px", borderRadius: "4px", flexShrink: 0, whiteSpace: "nowrap" }}>4–8h</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================
// MAIN PAGE
// ================================================================

export default function InsightsPage() {
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [workbooks, setWorkbooks] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("duplicates");

  const addFiles = useCallback((newFiles) => {
    const valid = [...newFiles].filter((f) => f.name.endsWith(".twb") || f.name.endsWith(".twbx"));
    if (valid.length === 0) return;
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !existingNames.has(f.name))];
    });
    setWorkbooks(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleAnalyze = async () => {
    if (files.length < 2) return;
    setProcessing(true);
    setError(null);
    setWorkbooks(null);
    setProgress({ done: 0, total: files.length });

    const results = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const result = await auditWorkbook(files[i]);
        const name = files[i].name.replace(/\.(twb|twbx)$/i, "");
        results.push({ name, fields: result.fields, meta: result.meta });
        setProgress({ done: i + 1, total: files.length });
      } catch (err) {
        setError(`Failed to parse "${files[i].name}": ${err.message}`);
        setProcessing(false);
        return;
      }
    }

    setWorkbooks(results);
    setProcessing(false);
    posthog.capture("insights_analyzed", { workbook_count: files.length });
  };

  const duplicates = useMemo(() => workbooks ? detectDuplicates(workbooks) : [], [workbooks]);
  const effort = useMemo(() => workbooks ? estimateEffort(workbooks) : null, [workbooks]);
  const stats = useMemo(() => workbooks ? summarizePortfolio(workbooks) : null, [workbooks]);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ background: T.hdr, padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#fff" }}>Tableau<span style={{ color: T.primary }}>to</span>Dbt</span>
        </a>
        <nav style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {NAV.map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: "12px", color: label === "Insights" ? "#fff" : "rgba(255,255,255,0.55)", padding: "5px 12px", borderRadius: "6px", textDecoration: "none", fontWeight: label === "Insights" ? 600 : 400, background: label === "Insights" ? "rgba(255,255,255,0.1)" : "none" }}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* Upload zone */}
      <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "20px 24px" }}>
        <div style={{ maxWidth: "860px" }}>
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: T.text, marginBottom: "2px" }}>Portfolio Insights</div>
            <div style={{ fontSize: "12px", color: T.muted }}>Upload 2 or more Tableau workbooks to detect duplicate fields and estimate migration effort.</div>
          </div>

          {/* Drop zone */}
          <div
            style={{ border: `1.5px dashed ${drag ? T.primary : T.border}`, borderRadius: "8px", padding: "20px", textAlign: "center", cursor: "pointer", background: drag ? "#f0f9ff" : T.bg, marginBottom: files.length > 0 ? "10px" : 0, transition: "all 0.15s" }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("insights-upload").click()}
          >
            <input id="insights-upload" type="file" accept=".twb,.twbx" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
            <div style={{ fontSize: "20px", marginBottom: "6px", color: T.dim }}>↑</div>
            <div style={{ fontSize: "13px", color: T.muted }}>Drop .twb files here, or <span style={{ color: T.primary, fontWeight: 600 }}>browse</span></div>
            <div style={{ fontSize: "11px", color: T.dim, marginTop: "4px" }}>Add multiple files — processed in your browser, nothing uploaded</div>
          </div>

          {/* File chips */}
          {files.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", color: "#0369a1" }}>
                  <span style={{ fontWeight: 600 }}>{f.name.replace(/\.(twb|twbx)$/i, "")}</span>
                  <span style={{ color: "#7dd3fc", fontSize: "9px" }}>{"twb"}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, fi) => fi !== i)); setWorkbooks(null); }}
                    style={{ background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", fontSize: "14px", padding: "0", lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={handleAnalyze}
              disabled={files.length < 2 || processing}
              style={{ padding: "10px 22px", background: files.length >= 2 && !processing ? T.hdr : T.border, color: files.length >= 2 && !processing ? "#fff" : T.dim, border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: files.length >= 2 && !processing ? "pointer" : "not-allowed", fontFamily: T.font }}
            >
              {processing ? `Analyzing… (${progress.done}/${progress.total})` : `Analyze ${files.length >= 2 ? files.length + " Workbooks" : "—"} →`}
            </button>
            {files.length < 2 && files.length > 0 && (
              <div style={{ fontSize: "12px", color: T.dim }}>Add at least one more workbook to compare</div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fca5a5", fontSize: "13px", color: "#991b1b" }}>{error}</div>
      )}

      {/* Results */}
      {workbooks && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Stats strip */}
          <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap" }}>
            {[
              { label: "Workbooks", value: workbooks.length },
              { label: "Calc Fields", value: stats.totalFields },
              { label: "Duplicated Names", value: duplicates.length, color: duplicates.length > 0 ? "#92400e" : undefined },
              { label: "Diverged Formulas", value: duplicates.filter(d => d.type === "diverged").length, color: duplicates.filter(d => d.type === "diverged").length > 0 ? "#991b1b" : undefined },
              { label: "Total Issues", value: stats.totalIssues, color: stats.totalIssues > 0 ? "#991b1b" : undefined },
              { label: "Unused Fields", value: stats.totalUnused, color: stats.totalUnused > 0 ? "#92400e" : undefined },
              { label: "Est. Effort", value: `${effort.totalMin}h — ${effort.totalMax}h` },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "2px" }}>{label}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: color || T.text }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ background: T.white, borderBottom: `1px solid ${T.border}`, padding: "0 24px", display: "flex", gap: "0" }}>
            {[
              ["duplicates", `Duplicate Fields (${duplicates.length})`],
              ["effort", "Migration Effort"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{ padding: "12px 16px", fontSize: "13px", fontWeight: tab === key ? 700 : 400, color: tab === key ? T.primary : T.muted, background: "none", border: "none", borderBottom: `2px solid ${tab === key ? T.primary : "transparent"}`, cursor: "pointer", fontFamily: T.font, marginBottom: "-1px" }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, padding: "20px 24px", maxWidth: "960px", width: "100%" }}>
            {tab === "duplicates" && <DuplicatesTab duplicates={duplicates} workbookCount={workbooks.length} />}
            {tab === "effort" && <EffortTab effort={effort} workbooks={workbooks} />}
          </div>
        </div>
      )}
    </div>
  );
}
