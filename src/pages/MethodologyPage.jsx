// ================================================================
// METHODOLOGY PAGE
// ================================================================

const T = {
  bg: "#f8fafc", white: "#fff", text: "#1e293b", muted: "#64748b",
  dim: "#94a3b8", border: "#e2e8f0", borderLight: "#f1f5f9",
  primary: "#0ea5e9", hdr: "#1e293b",
  font: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
};

const NAV = [["Convert", "/"], ["Diff", "/diff"], ["Docs", "/docs"], ["Audit", "/audit"]];

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: "48px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 800, color: T.text, marginBottom: "16px", paddingBottom: "10px", borderBottom: `2px solid ${T.border}` }}>{title}</h2>
      {children}
    </section>
  );
}

function Rule({ severity, id, message, fix }) {
  const colors = {
    error:   { bg: "#fef2f2", border: "#fca5a5", badge: "#fee2e2", badgeText: "#991b1b", label: "Error" },
    warning: { bg: "#fffbeb", border: "#fcd34d", badge: "#fef3c7", badgeText: "#92400e", label: "Warning" },
    info:    { bg: "#eff6ff", border: "#bae6fd", badge: "#dbeafe", badgeText: "#1d4ed8", label: "Info" },
  };
  const c = colors[severity];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "8px", padding: "14px 16px", marginBottom: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: c.badge, color: c.badgeText }}>{c.label}</span>
        <code style={{ fontSize: "11px", fontFamily: T.mono, color: T.muted, background: T.white, padding: "1px 6px", borderRadius: "4px", border: `1px solid ${T.border}` }}>{id}</code>
      </div>
      <p style={{ fontSize: "13px", color: T.text, marginBottom: fix ? "6px" : 0, lineHeight: 1.6 }}>{message}</p>
      {fix && <p style={{ fontSize: "12px", color: T.muted, lineHeight: 1.5 }}><strong style={{ color: T.text }}>Fix:</strong> {fix}</p>}
    </div>
  );
}

function ScoreRow({ label, points, condition }) {
  return (
    <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
      <td style={{ padding: "8px 14px", fontSize: "12px", color: T.text }}>{condition}</td>
      <td style={{ padding: "8px 14px", fontSize: "12px", fontFamily: T.mono, color: T.primary, fontWeight: 600 }}>{points}</td>
      <td style={{ padding: "8px 14px", fontSize: "12px", color: T.muted }}>{label}</td>
    </tr>
  );
}

export default function MethodologyPage() {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: T.font }}>

      {/* Header */}
      <header style={{ background: T.hdr, padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#fff" }}>Tableau<span style={{ color: T.primary }}>to</span>Dbt</span>
        </a>
        <nav style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {NAV.map(([label, href]) => (
            <a key={label} href={href} style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", padding: "5px 12px", borderRadius: "6px", textDecoration: "none", fontWeight: 400 }}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* Hero */}
      <div style={{ background: T.hdr, padding: "40px 32px", borderBottom: `1px solid rgba(255,255,255,0.08)` }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: T.primary, marginBottom: "10px" }}>Documentation</div>
          <h1 style={{ fontSize: "32px", fontWeight: 800, color: "#fff", marginBottom: "12px", lineHeight: 1.2 }}>Audit Methodology</h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", lineHeight: 1.7, maxWidth: "600px" }}>
            How TableauToDbt parses workbooks, scores field complexity, detects issues, and calculates health scores. Everything runs in your browser — no data is ever uploaded.
          </p>
        </div>
      </div>

      {/* TOC + Content */}
      <div style={{ display: "flex", gap: "40px", maxWidth: "1100px", margin: "0 auto", padding: "40px 32px", alignItems: "flex-start" }}>

        {/* Sidebar TOC */}
        <aside style={{ flex: "0 0 200px", position: "sticky", top: "60px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.dim, marginBottom: "12px" }}>On this page</div>
          {[
            ["#how-it-works", "How It Works"],
            ["#privacy", "Privacy"],
            ["#audit-rules", "Audit Rules"],
            ["#complexity", "Complexity Scoring"],
            ["#health-score", "Health Score"],
            ["#unused-fields", "Unused Field Detection"],
            ["#circular", "Circular Dependencies"],
            ["#lineage", "Lineage & Dependencies"],
            ["#effort", "Migration Effort"],
            ["#copy-for-ai", "Copy for AI"],
          ].map(([href, label]) => (
            <a key={href} href={href} style={{ display: "block", fontSize: "12px", color: T.muted, textDecoration: "none", padding: "4px 0", lineHeight: 1.5, borderLeft: `2px solid ${T.border}`, paddingLeft: "10px", marginBottom: "2px" }}>
              {label}
            </a>
          ))}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0 }}>

          <Section id="how-it-works" title="How It Works">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              Tableau workbooks are stored as XML files (<code style={{ fontFamily: T.mono, fontSize: "12px" }}>.twb</code>). TableauToDbt parses this XML directly in the browser using the native <code style={{ fontFamily: T.mono, fontSize: "12px" }}>DOMParser</code> API — no server, no network request.
            </p>
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "16px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {[
                  ["1. Load", "File is read in-browser and parsed as XML."],
                  ["2. Parse", "DOMParser converts the XML string into a queryable DOM tree."],
                  ["3. Extract", "Calculated fields, data sources, sheets, parameters, and filters are extracted from datasource nodes."],
                  ["4. Analyze", "Each field is scored for complexity, checked against audit rules, and traced for dependencies."],
                ].map(([step, desc]) => (
                  <div key={step}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: T.primary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{step}</div>
                    <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section id="privacy" title="Privacy">
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "16px 20px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#166534", marginBottom: "8px" }}>Your data never leaves your machine.</div>
              <ul style={{ fontSize: "13px", color: "#166534", lineHeight: 1.8, paddingLeft: "18px" }}>
                <li>All parsing and analysis runs entirely in the browser via JavaScript.</li>
                <li>No workbook files, field names, formulas, or results are transmitted to any server.</li>
                <li>Closing or refreshing the tab clears everything — nothing is stored.</li>
                <li>Posthog is used for anonymous usage analytics only (page views, feature usage counts). No workbook content is captured.</li>
              </ul>
            </div>
          </Section>

          <Section id="audit-rules" title="Audit Rules">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "20px" }}>
              Each calculated field is evaluated against the following rules. Issues are classified as <strong>Error</strong> (breaks or severely degrades), <strong>Warning</strong> (likely problem worth reviewing), or <strong>Info</strong> (improvement opportunity).
            </p>

            <h3 style={{ fontSize: "13px", fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Structural</h3>
            <Rule
              severity="warning"
              id="unused_field"
              message="Field is defined but not referenced in any sheet filter, row/column shelf, or other formula."
              fix="Delete unused fields or prefix with '_deprecated_' to mark for removal. Unused fields bloat the workbook and confuse documentation."
            />
            <Rule
              severity="error"
              id="circular_dependency"
              message="Two or more fields reference each other in a cycle (A depends on B, B depends on A). Tableau cannot evaluate these fields."
              fix="Trace the dependency chain and break the cycle. Usually caused by copy-pasting fields and forgetting to update references."
            />

            <h3 style={{ fontSize: "13px", fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", marginTop: "20px" }}>Nesting</h3>
            <Rule
              severity="warning"
              id="deep_nesting"
              message="Formula has nesting depth of 4 or more. Deep parenthetical nesting reduces readability and makes debugging difficult."
              fix="Extract sub-expressions into intermediate calculated fields. Aim for nesting depth under 4."
            />
            <Rule
              severity="error"
              id="excessive_nesting"
              message="Formula has nesting depth of 7 or more. At this level the formula is nearly impossible to debug or maintain."
              fix="Refactor into multiple intermediate fields. A good rule of thumb: if a formula wraps more than 3 levels deep, it belongs in separate fields."
            />

            <h3 style={{ fontSize: "13px", fontWeight: 700, color: T.dim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px", marginTop: "20px" }}>Performance</h3>
            <Rule
              severity="error"
              id="nested_lod"
              message="Nested LOD expressions — a FIXED expression inside another FIXED — cause query fan-out and can generate exponentially more database queries."
              fix="Extract the inner LOD to a separate calculated field and reference it by name in the outer LOD."
            />
            <Rule
              severity="warning"
              id="window_non_additive"
              message="WINDOW_SUM or WINDOW_COUNT wrapping non-additive measures like COUNTD or AVG may produce incorrect results because these functions cannot be safely aggregated over a window."
              fix="Reconsider the aggregation logic. Use WINDOW_AVG for averages. For COUNTD, consider a different approach such as a data source level aggregate."
            />
            <Rule
              severity="warning"
              id="long_if_chain"
              message="Formula contains 4 or more ELSEIF branches. Long IF/ELSEIF chains are slow to evaluate and hard to maintain."
              fix="Replace with a CASE/WHEN statement for readability, or consider an in-database lookup table for large lists."
            />
            <Rule
              severity="warning"
              id="division_no_null_protection"
              message="Division operator found without ZN() or NULLIF() to protect against divide-by-zero. When the denominator is 0 or Null, the result will be Null, which may silently corrupt aggregations."
              fix="Wrap the denominator in ZN() or use IIF([denom] = 0, 0, [numer] / [denom])."
            />
            <Rule
              severity="warning"
              id="total_complex"
              message="TOTAL() wrapping complex expressions can produce unexpected scope behavior — the result depends on the view's partition structure in ways that are not obvious."
              fix="Verify the scope with a test view. Consider using WINDOW_SUM with explicit addressing instead."
            />
            <Rule
              severity="info"
              id="hardcoded_datetrunc"
              message="DATETRUNC uses a hardcoded string granularity (e.g. 'month'). This makes the field inflexible — changing the truncation requires editing the formula directly."
              fix="Drive the granularity with a string parameter so end users can switch between day, week, month, quarter, and year."
            />
          </Section>

          <Section id="complexity" title="Complexity Scoring">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              Each field receives a complexity score from 0 to 100 based on four factors. The score is a proxy for how difficult a field is to understand, maintain, and translate to a dbt model.
            </p>
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", overflow: "hidden", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.bg }}>
                    <th style={{ textAlign: "left", padding: "8px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.dim }}>Condition</th>
                    <th style={{ textAlign: "left", padding: "8px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.dim }}>Points</th>
                    <th style={{ textAlign: "left", padding: "8px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.dim }}>Factor</th>
                  </tr>
                </thead>
                <tbody>
                  <ScoreRow condition="Formula length > 100 chars" points="+5" label="Length" />
                  <ScoreRow condition="Formula length > 200 chars" points="+10" label="Length" />
                  <ScoreRow condition="Formula length > 500 chars" points="+20" label="Length" />
                  <ScoreRow condition="Nesting depth" points="+3 × depth (max 25)" label="Nesting" />
                  <ScoreRow condition="Dependency count" points="+2 × deps (max 20)" label="Dependencies" />
                  <ScoreRow condition="Unique function count" points="+2 × functions (max 20)" label="Functions" />
                  <ScoreRow condition="Issue count" points="+5 × issues (max 15)" label="Issues" />
                </tbody>
              </table>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              {[
                { label: "Simple", range: "0–25", color: "#22c55e", bg: "#f0fdf4", border: "#86efac", desc: "Straightforward, likely auto-convertible" },
                { label: "Moderate", range: "26–50", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d", desc: "Needs review, some manual work" },
                { label: "Complex", range: "51–75", color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", desc: "Significant translation effort" },
                { label: "Critical", range: "76–100", color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd", desc: "Requires expert Tableau knowledge" },
              ].map(({ label, range, color, bg, border, desc }) => (
                <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: "8px", padding: "12px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color, marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color, marginBottom: "4px" }}>{range}</div>
                  <div style={{ fontSize: "11px", color, opacity: 0.75, lineHeight: 1.4 }}>{desc}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="health-score" title="Health Score">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              The workbook health score starts at 100 and is reduced by issues found across all calculated fields:
            </p>
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "16px 20px", marginBottom: "16px" }}>
              <div style={{ fontFamily: T.mono, fontSize: "13px", color: T.text, lineHeight: 2 }}>
                <div>health_score = <span style={{ color: T.primary }}>100</span></div>
                <div style={{ paddingLeft: "20px" }}>− (<span style={{ color: "#ef4444" }}>error_count</span> × 10)</div>
                <div style={{ paddingLeft: "20px" }}>− (<span style={{ color: "#f59e0b" }}>warning_count</span> × 3)</div>
                <div style={{ paddingLeft: "20px" }}>− (<span style={{ color: "#3b82f6" }}>info_count</span> × 1)</div>
                <div style={{ paddingLeft: "20px" }}>clamped to <span style={{ color: T.primary }}>0–100</span></div>
              </div>
            </div>
            <p style={{ fontSize: "13px", color: T.muted, lineHeight: 1.6 }}>
              A workbook with 2 errors and 5 warnings would score: 100 − 20 − 15 = <strong style={{ color: T.text }}>65</strong>. Scores above 85 are considered healthy. Below 60 indicates significant technical debt.
            </p>
          </Section>

          <Section id="unused-fields" title="Unused Field Detection">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              A field is marked unused if it does not appear in any of the following locations within the workbook XML:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                ["Worksheet filters", "The <filter column=\"...\"> attribute on worksheet filter nodes"],
                ["Row/column shelves", "<rows> and <cols> elements — fields placed on the view"],
                ["Datasource dependencies", "<datasource-dependencies> column nodes — fields used in views"],
                ["Other formulas", "Referenced by [FieldName] inside another calculated field's formula"],
              ].map(([label, detail]) => (
                <div key={label} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "6px", padding: "10px 14px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: T.primary, marginTop: "1px", flexShrink: 0 }}>✓</div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: T.text, marginBottom: "2px" }}>{label}</div>
                    <div style={{ fontSize: "11px", fontFamily: T.mono, color: T.muted }}>{detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: T.dim, marginTop: "12px", lineHeight: 1.6 }}>
              Note: Fields used only in hidden sheets or in extracted data source calculations may appear as unused. Always verify before deleting.
            </p>
          </Section>

          <Section id="circular" title="Circular Dependency Detection">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              Circular dependencies are detected using a depth-first graph traversal. Each calculated field is a node; each <code style={{ fontFamily: T.mono, fontSize: "12px" }}>[FieldName]</code> reference in a formula is a directed edge.
            </p>
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "16px 20px" }}>
              <div style={{ fontSize: "12px", color: T.muted, lineHeight: 1.8 }}>
                <p style={{ marginBottom: "8px" }}>For each field, the algorithm walks the dependency graph keeping track of the current path. If a node is encountered that already exists in the current path, a cycle is detected.</p>
                <p>The full cycle path is captured and reported in the issue message — e.g. <code style={{ fontFamily: T.mono, background: T.bg, padding: "1px 5px", borderRadius: "3px" }}>Revenue → Gross Margin → Discount Rate → Revenue</code>.</p>
              </div>
            </div>
          </Section>

          <Section id="lineage" title="Lineage & Dependencies">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              Dependencies are extracted by scanning each formula for bracket-referenced field names matching the pattern <code style={{ fontFamily: T.mono, fontSize: "12px" }}>[FieldName]</code>. References to the built-in <code style={{ fontFamily: T.mono, fontSize: "12px" }}>Parameters</code> datasource are excluded.
            </p>
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7 }}>
              The Lineage tab in /docs builds a reverse dependency map — for each field, which other fields reference it — enabling upstream/downstream navigation. The impact count (<code style={{ fontFamily: T.mono, fontSize: "12px" }}>↑N</code>) shown in field lists reflects the number of fields and sheets that directly or indirectly depend on that field.
            </p>
          </Section>

          <Section id="effort" title="Migration Effort Estimation">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              Migration effort is estimated per calculated field based on its complexity label. These ranges reflect typical translation time to a SQL dbt model, assuming a developer familiar with both Tableau and dbt:
            </p>
            <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "8px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.bg }}>
                    {["Complexity", "Hours per field", "Typical cases"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 14px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.dim }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Simple (0–25)", "0.25h – 0.5h", "SUM, COUNT, basic IIF, simple string formatting"],
                    ["Moderate (26–50)", "1h – 2h", "Multi-condition IF/ELSE, DATEDIFF, cross-datasource references"],
                    ["Complex (51–75)", "4h – 8h", "FIXED LOD, INCLUDE/EXCLUDE, WINDOW functions, parameter-driven logic"],
                    ["Critical (76–100)", "8h – 16h", "Nested LODs, recursive dependencies, complex table calculations"],
                  ].map(([complexity, hours, cases]) => (
                    <tr key={complexity} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                      <td style={{ padding: "10px 14px", color: T.text, fontWeight: 600 }}>{complexity}</td>
                      <td style={{ padding: "10px 14px", fontFamily: T.mono, color: T.primary, fontWeight: 700 }}>{hours}</td>
                      <td style={{ padding: "10px 14px", color: T.muted }}>{cases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "12px", color: T.dim, marginTop: "12px", lineHeight: 1.6 }}>
              Estimates assume a developer familiar with both Tableau calculated fields and dbt/SQL. LOD expressions require particular care as they have no direct SQL equivalent — they must be modeled as subqueries or CTEs with specific grain adjustments.
            </p>
          </Section>

          <Section id="copy-for-ai" title="Copy for AI">
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              The "Copy for AI" button packages your entire workbook's extracted data into a single structured prompt, ready to paste into Claude, ChatGPT, or any other AI assistant.
            </p>
            <p style={{ fontSize: "14px", color: T.muted, lineHeight: 1.7, marginBottom: "16px" }}>
              Instead of copying fields one by one into a chat, one click produces a complete context block that includes:
            </p>
            <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
              {[
                "Workbook name and metadata",
                "Every calculated field with its full formula, datatype, role, and dependency list",
                "Data source names and field inventories",
                "Parameters and their current values",
                "Audit results and issue flags (on the /audit tool)",
              ].map((item, i) => (
                <li key={i} style={{ fontSize: "14px", color: T.muted, lineHeight: 1.8 }}>{item}</li>
              ))}
            </ul>
            <div style={{ background: "#f5f3ff", border: "1px solid #ede9fe", borderRadius: "8px", padding: "14px 16px" }}>
              <p style={{ fontSize: "13px", color: "#5b21b6", lineHeight: 1.7 }}>
                <strong>Recommended use:</strong> Paste the output into Claude or ChatGPT and ask it to explain your workbook logic, suggest dbt model structures, identify risky formulas, or generate SQL equivalents. The structured format ensures the AI has full context without you needing to describe the workbook manually.
              </p>
            </div>
          </Section>

        </main>
      </div>

      {/* Footer */}
      <div style={{ background: T.hdr, padding: "20px 32px", display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>TableauToDbt</span>
        {[["Convert", "/"], ["Docs", "/docs"], ["Audit", "/audit"], ["Diff", "/diff"]].map(([label, href]) => (
          <a key={label} href={href} style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>{label}</a>
        ))}
        <a href="/methodology" style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", textDecoration: "none", fontWeight: 600 }}>Methodology</a>
      </div>
    </div>
  );
}
