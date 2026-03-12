import { useState, useCallback, useRef, useEffect } from "react";
import JSZip from "jszip";
import {
  parseTWB,
  scanTWB,
  classify,
  ruleBasedTranslate,
  findDependencies,
  needsClaude,
  claudeTranslate,
  isAggregate,
  groupByDatasource,
  translateLOD,
} from "./lib/engine.js";
import { buildZip, downloadAllAsZip } from "./lib/zip.js";
import Badge from "./components/Badge.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import EmailGateModal from "./components/EmailGateModal.jsx";
import PaywallBanner from "./components/PaywallBanner.jsx";

const FREE_TIER_LIMIT = 10;

// ================================================================
// STYLES
// ================================================================

const styles = {
  app: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #030f0a 0%, #071a12 55%, #071e2a 100%)",
    color: "#e2ede8",
    fontFamily: "'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace",
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
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
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
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [paidSession, setPaidSession] = useState(false);
  const [grainConfig, setGrainConfig] = useState({});
  const [dialect, setDialect] = useState("Snowflake");
  const [previewModel, setPreviewModel] = useState(null);
  const fileRef = useRef();

  // Check for Stripe success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId) {
      // Verify with backend and mark as paid
      fetch(`/api/verify-session?session_id=${sessionId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.paid) {
            setPaidSession(true);
            // Clean up URL
            window.history.replaceState({}, "", window.location.pathname);
          }
        })
        .catch(() => {});
    }
  }, []);

  const addLog = (msg, type = "info") => setLog((l) => [...l, { msg, type, ts: Date.now() }]);

  const translatableCalcs = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity));
  const isFreeTier = translatableCalcs.length <= FREE_TIER_LIMIT;
  const needsPayment = translatableCalcs.length > FREE_TIER_LIMIT && !paidSession;

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setSelectedFile(file.name);
    setStage("parsing");
    setLog([]);
    addLog(`Parsing ${file.name}...`);

    try {
      let xmlText;
      if (file.name.toLowerCase().endsWith(".twbx")) {
        addLog("Detected .twbx — extracting inner workbook...", "info");
        const zip = await JSZip.loadAsync(file);
        const twbEntry = Object.values(zip.files).find((f) => f.name.endsWith(".twb") && !f.dir);
        if (!twbEntry) throw new Error("No .twb found inside .twbx archive");
        xmlText = await twbEntry.async("string");
        addLog("Extracted .twb from .twbx ✓", "success");
      } else {
        xmlText = await file.text();
      }
      const { calcs: parsed, internalIdMap } = parseTWB(xmlText);
      setXmlString(xmlText);
      addLog(`Found ${parsed.length} unique calculated fields`, "success");

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

      const withRuleTranslation = classified.map((c) => {
        if (["skip", "untranslatable"].includes(c.complexity)) return c;
        const ruleSql = ruleBasedTranslate(c.formula, internalIdMap, dialect);
        // For LOD expressions, generate a CTE template rule-based
        const lodResult = c.complexity === "complex" ? translateLOD(c.formula, internalIdMap, dialect) : null;
        const calcWithLod = {
          ...c,
          ruleSql: lodResult ? lodResult.sql : ruleSql,
          lodCte: lodResult?.cteTemplate || null,
          lodNote: lodResult?.note || null,
        };
        const { needs, reasons } = needsClaude(calcWithLod, calcWithLod.ruleSql);
        return { ...calcWithLod, needsClaude: needs, claudeReasons: reasons };
      });

      const needsClaudeCount = withRuleTranslation.filter((c) => c.needsClaude).length;
      addLog(`Rule-based translation complete. ${needsClaudeCount} calcs flagged for AI refinement.`, "info");

      const scan = scanTWB(xmlText);
      setScanResults(scan);
      setCalcs(withRuleTranslation);
      setStage("scan");
    } catch (err) {
      addLog(`Error: ${err.message}`, "error");
      setStage("upload");
    }
  }, [dialect]);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, dialect]
  );

  const runTranslation = useCallback(async () => {
    setStage("translating");
    addLog("Starting full translation...");

    const toTranslate = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity));
    const forClaude = toTranslate.filter((c) => c.needsClaude);

    addLog(`Rule-based: ${toTranslate.length - forClaude.length} calcs`, "info");
    addLog(`AI layer: ${forClaude.length} calcs`, "info");

    let updatedCalcs = calcs.map((c) => ({
      ...c,
      finalSql: c.ruleSql || null,
      translatedByClaude: false,
      dbtDescription: null,
      aeRecommendations: [],
    }));

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
          const results = await claudeTranslate(batch, dialect);
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
                    calcType: r.calc_type || null,
                    suggestedGrain: r.suggested_grain || null,
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
    addLog("Generating output files...", "info");
    let files;
    try {
      files = await buildZip(updatedCalcs, xmlString, selectedFile?.replace(/\.(twb|twbx)$/i, ""), grainConfig, dialect);
    } catch (err) {
      addLog(`Output generation failed: ${err.message}`, "error");
      setStage("preview");
      return;
    }
    if (files["sources.yml"]) addLog("sources.yml generated ✓", "success");
    setOutputFiles(files);

    const translatedCount = updatedCalcs.filter(
      (c) => c.finalSql && !["skip", "untranslatable"].includes(c.complexity)
    ).length;
    addLog(`Done! ${translatedCount} models ready for dbt.`, "success");
    setActiveTab("report");
    setStage("results");
  }, [calcs, xmlString, grainConfig, dialect]);

  const downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    if (isFreeTier && !emailCaptured) {
      setShowEmailModal(true);
      return;
    }
    setZipping(true);
    const ok = await downloadAllAsZip(outputFiles, selectedFile?.replace(/\.(twb|twbx)$/i, ""));
    if (!ok) alert("Zip failed — use individual file downloads below.");
    setZipping(false);
  };

  const handleEmailSuccess = (email) => {
    setEmailCaptured(true);
    setShowEmailModal(false);
    // Trigger download
    handleDownloadAllDirect();
  };

  const handleDownloadAllDirect = async () => {
    setZipping(true);
    const ok = await downloadAllAsZip(outputFiles, selectedFile?.replace(/\.(twb|twbx)$/i, ""));
    if (!ok) alert("Zip failed — use individual file downloads below.");
    setZipping(false);
  };

  const resetApp = () => {
    setStage("upload");
    setCalcs([]);
    setOutputFiles(null);
    setSelectedFile(null);
    setXmlString(null);
    setScanResults(null);
    setLog([]);
    setExpandedCalc(null);
    setGrainConfig({});
    setPreviewModel(null);
    setPaidSession(false);
  };

  const translatable = calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity));
  const untranslatable = calcs.filter((c) => c.complexity === "untranslatable");
  const skipped = calcs.filter((c) => c.complexity === "skip");
  const claudeCount = calcs.filter((c) => c.needsClaude).length;

  return (
    <div style={styles.app}>
      {/* Email Gate Modal */}
      {showEmailModal && (
        <EmailGateModal
          onSuccess={handleEmailSuccess}
          onClose={() => setShowEmailModal(false)}
        />
      )}

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
            {/* Hero */}
            <div style={{ marginBottom: "36px" }}>
              <div style={{ fontSize: "28px", fontWeight: 700, color: "#f0f0f0", marginBottom: "12px", lineHeight: 1.2 }}>
                Migrate Tableau to a<br />
                <span style={{ color: "#34d399" }}>reusable dbt semantic layer</span>
              </div>
              <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.8, maxWidth: "680px" }}>
                Analytics engineers spend days manually rewriting Tableau business logic into SQL.
                Upload a <span style={{ color: "#9ca3af" }}>.twb</span> or <span style={{ color: "#9ca3af" }}>.twbx</span> file
                and get a complete, layered dbt package — staging models, fct_ and dim_ marts, LOD-to-CTE translation,
                a MetricFlow semantic layer, schema tests, and source definitions — in Snowflake or BigQuery SQL,
                structured for reuse across any report.
              </div>
            </div>

            {/* Dialect selector */}
            <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "11px", color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>Target warehouse</span>
              {["Snowflake", "BigQuery"].map((d) => (
                <button
                  key={d}
                  onClick={() => setDialect(d)}
                  style={{
                    padding: "6px 14px",
                    fontSize: "11px",
                    fontWeight: 700,
                    fontFamily: "inherit",
                    borderRadius: "6px",
                    cursor: "pointer",
                    letterSpacing: "0.04em",
                    border: dialect === d ? "1px solid #34d399" : "1px solid #0d2b1e",
                    background: dialect === d ? "#05966918" : "transparent",
                    color: dialect === d ? "#34d399" : "#4b5563",
                    transition: "all 0.15s",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Dropzone */}
            <div
              style={styles.dropzone}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>⬆</div>
              <div style={styles.dropTitle}>Drop .twb or .twbx here</div>
              <div style={styles.dropSub}>or click to browse — workbook data never leaves your browser</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".twb,.twbx"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {/* Pricing note */}
            <div style={{ marginTop: "16px", padding: "12px 18px", background: "#071a12", border: "1px solid #0d2b1e", borderRadius: "8px", fontSize: "12px", color: "#6b7280", display: "flex", gap: "24px", alignItems: "center" }}>
              <div><span style={{ color: "#34d399", fontWeight: 700 }}>Free</span> — up to {FREE_TIER_LIMIT} calculated fields</div>
              <div><span style={{ color: "#fbbf24", fontWeight: 700 }}>$19</span> — unlimited fields, full export</div>
              <div style={{ marginLeft: "auto" }}>No account required</div>
            </div>

            {/* What you get */}
            <div style={{ marginTop: "48px" }}>
              <div style={{ ...styles.h2, marginBottom: "20px" }}>What you get</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "32px" }}>
                {[
                  {
                    file: "staging/stg_*.sql",
                    icon: "🗂️",
                    label: "Staging layer — one per datasource",
                    desc: "A clean, typed view over your raw source table. Column names referenced in your Tableau formulas are pre-populated. All downstream models reference this — change it once, everything updates.",
                  },
                  {
                    file: "marts/fct_*.sql + dim_*.sql",
                    icon: "📐",
                    label: "fct_ and dim_ models — properly split",
                    desc: "Aggregate expressions (SUM/COUNT/AVG) land in a fct_ model with a GROUP BY you configure. Row-level expressions land in a dim_ model with no aggregation. No more invalid SQL mixing both in one SELECT.",
                  },
                  {
                    file: "metrics.yml",
                    icon: "📡",
                    label: "MetricFlow semantic layer (dbt ≥ 1.6)",
                    desc: "Simple aggregations become proper semantic_model measures with correct agg: types. Derived expressions (SUM(a)/COUNT(b)) are generated as type: derived metrics. Fill in your primary key, run dbt sl validate.",
                  },
                  {
                    file: "FIXED/INCLUDE/EXCLUDE → CTEs",
                    icon: "🔗",
                    label: "LOD expressions translated to CTE patterns",
                    desc: "Tableau LOD expressions are the hardest part of any migration. FIXED LODs are converted to SQL CTE templates and injected directly into your fct_ model's WITH clause — no manual rewrite required.",
                  },
                  {
                    file: "sources.yml + schema.yml",
                    icon: "🧪",
                    label: "Source definitions and schema tests",
                    desc: "Datasource names extracted from your workbook XML, pre-populated in sources.yml. not_null tests on every measure, unique + not_null on staging primary keys. dbt test ready on day one.",
                  },
                  {
                    file: "SETUP.md + translation_report.md",
                    icon: "📋",
                    label: "Step-by-step docs and full translation report",
                    desc: "SETUP.md lists every datasource, grain instructions, and dbt commands to run. The translation report shows original formula → SQL output side by side, LOD CTE templates, and window function rewrites for untranslatable fields.",
                  },
                ].map((item) => (
                  <div key={item.file} style={{ background: "#0a1f15", border: "1px solid #0d2b1e", borderRadius: "8px", padding: "18px 20px", display: "flex", gap: "14px" }}>
                    <div style={{ fontSize: "22px", flexShrink: 0, marginTop: "2px" }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#d1d5db", marginBottom: "4px" }}>{item.label}</div>
                      <div style={{ fontSize: "10px", fontFamily: "monospace", color: "#34d399", marginBottom: "6px" }}>{item.file}</div>
                      <div style={{ fontSize: "11px", color: "#4b5563", lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* How it works */}
              <div style={{ ...styles.h2, marginBottom: "20px" }}>How it works</div>
              <div style={{ display: "flex", gap: "0", marginBottom: "16px" }}>
                {[
                  { step: "01", label: "Parse", desc: "Reads every calculated field from .twb or .twbx. Resolves Calculation_XXXX internal IDs to human-readable names. Maps each field to its datasource. .twbx files are unzipped automatically." },
                  { step: "02", label: "Classify", desc: "Categorises fields by complexity: simple expressions, date/conditional logic, LOD expressions (FIXED/INCLUDE/EXCLUDE), and table calcs flagged for window function rewrites." },
                  { step: "03", label: "Translate", desc: "Rule-based pass converts Tableau syntax to your target dialect (Snowflake or BigQuery). LOD expressions generate CTE templates. Complex calcs go through an AI pass to resolve intent. Dependency chains are resolved." },
                  { step: "04", label: "Structure", desc: "Aggregates go into fct_ models with GROUP BY. Row-level expressions go into dim_ models. LOD CTEs are injected into the WITH clause. MetricFlow metrics.yml is generated for a queryable semantic layer." },
                ].map((s, i, arr) => (
                  <div key={s.step} style={{ flex: 1, padding: "18px 20px", background: "#0a1f15", border: "1px solid #0d2b1e", borderRight: i < arr.length - 1 ? "none" : "1px solid #0d2b1e", borderRadius: i === 0 ? "8px 0 0 8px" : i === arr.length - 1 ? "0 8px 8px 0" : "0" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#34d399", letterSpacing: "0.1em", marginBottom: "6px" }}>{s.step}</div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#d1d5db", marginBottom: "6px" }}>{s.label}</div>
                    <div style={{ fontSize: "11px", color: "#4b5563", lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
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
          <div style={{ position: "relative", maxWidth: "600px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div style={{ width: "60px", height: "60px", margin: "0 auto 16px", background: "linear-gradient(135deg, #059669, #0891b2)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", boxShadow: "0 8px 28px #05966944" }}>🔍</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#f0fdf4", marginBottom: "6px" }}>Privacy Scan Complete</div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                <span style={{ color: "#34d399" }}>{selectedFile}</span> · {scanResults.staysInBrowser.length} local items · {scanResults.translatableCount} formulas to translate
              </div>
            </div>

            {/* Stays in browser */}
            <div style={{ background: "rgba(5,150,105,0.07)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: "12px", padding: "18px 20px", marginBottom: "12px" }}>
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

            {/* Flagged */}
            {scanResults.flagged.length > 0 && (
              <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: "12px", padding: "18px 20px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ width: "28px", height: "28px", background: "#d9770622", border: "1px solid #d9770655", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>⚠️</div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#fcd34d" }}>Possible client names detected</div>
                    <div style={{ fontSize: "11px", color: "#6b7280" }}>In parameter defaults — classified as skip, not sent to AI</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: "9px", fontWeight: 700, color: "#fbbf24", background: "rgba(245,158,11,0.09)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>NOT SENT</div>
                </div>
                {scanResults.flagged.map((f, i) => (
                  <div key={i} style={{ fontSize: "11px", color: "#fcd34d", fontFamily: "monospace", padding: "6px 10px", background: "rgba(245,158,11,0.06)", borderRadius: "5px", marginBottom: "4px", opacity: 0.9 }}>
                    <span style={{ opacity: 0.5 }}>{f.caption}: </span>{f.value}
                  </div>
                ))}
              </div>
            )}

            {/* Sent to AI */}
            <div style={{ background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.22)", borderRadius: "12px", padding: "18px 20px", marginBottom: "28px" }}>
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
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                style={{ flex: 1, padding: "14px", background: "linear-gradient(135deg, #059669, #0891b2)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 4px 20px #05966944" }}
                onClick={() => setStage("preview")}
              >
                Looks good — continue to preview →
              </button>
              <button
                style={{ padding: "14px 20px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "#6b7280", fontSize: "13px", cursor: "pointer" }}
                onClick={resetApp}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {stage === "preview" && (
          <div>
            {/* Paywall banner for large workbooks */}
            {needsPayment && (
              <PaywallBanner fieldCount={translatable.length} />
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f0" }}>Ready to translate</div>
                <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "4px" }}>Review the field breakdown, then run the full export</div>
              </div>
              {!needsPayment && (
                <button style={styles.btn} onClick={runTranslation}>
                  Run Export →
                </button>
              )}
            </div>

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

            {/* Grain config per datasource */}
            {(() => {
              const datasources = groupByDatasource(calcs);
              const aggregateDatasources = datasources.filter((ds) => ds.aggregates?.length > 0);
              if (aggregateDatasources.length === 0) return null;
              return (
                <div style={{ marginBottom: "24px", padding: "18px 20px", background: "#071e2a", border: "1px solid #0891b230", borderRadius: "8px", borderLeft: "3px solid #0891b2" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#67e8f9", marginBottom: "4px" }}>Grain configuration</div>
                  <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: 1.6, marginBottom: "14px" }}>
                    For each datasource with aggregate metrics, specify the grain columns (comma-separated).
                    These become the GROUP BY in your <code style={{ color: "#2dd4bf" }}>fct_</code> models.
                    Leave blank to use a TODO placeholder.
                  </div>
                  {aggregateDatasources.map((ds) => {
                    const suggestedGrains = ds.aggregates
                      .filter((c) => c.suggestedGrain)
                      .map((c) => c.suggestedGrain)
                      .filter(Boolean);
                    const hint = suggestedGrains.length > 0 ? suggestedGrains[0] : null;
                    return (
                      <div key={ds.slug} style={{ marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <code style={{ fontSize: "12px", color: "#34d399" }}>fct_{ds.slug}</code>
                          <span style={{ fontSize: "10px", color: "#4b5563" }}>· {ds.aggregates.length} aggregate fields</span>
                        </div>
                        <input
                          type="text"
                          placeholder={hint ? `e.g. ${hint}` : "e.g. date_day, customer_id"}
                          value={grainConfig[ds.slug]?.cols || ""}
                          onChange={(e) =>
                            setGrainConfig((prev) => ({
                              ...prev,
                              [ds.slug]: { ...prev[ds.slug], cols: e.target.value },
                            }))
                          }
                          style={{
                            width: "100%",
                            background: "#040d08",
                            border: "1px solid #0d4a2e",
                            borderRadius: "6px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "#e2ede8",
                            fontFamily: "monospace",
                            outline: "none",
                          }}
                        />
                        {hint && !grainConfig[ds.slug]?.cols && (
                          <div style={{ fontSize: "10px", color: "#34d39966", marginTop: "4px" }}>
                            AI suggested: {hint}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={styles.h2}>Calculated Fields</div>
            {calcs
              .filter((c) => c.complexity !== "skip")
              .map((c, i) => (
                <div
                  key={i}
                  style={{ ...styles.calcRow, borderColor: expandedCalc === i ? "#2d3a5c" : "#0d2b1e" }}
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
                  onClick={handleDownloadAll}
                >
                  {zipping ? "Zipping..." : "⬇ Download All (.zip)"}
                </button>
                <button style={styles.btnSecondary} onClick={resetApp}>
                  New Workbook
                </button>
              </div>
            </div>

            {isFreeTier && !emailCaptured && (
              <div style={{ marginBottom: "20px", padding: "12px 16px", background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: "8px", fontSize: "12px", color: "#6b7280" }}>
                Free export · {translatable.length} fields · Enter your email to download
              </div>
            )}

            <div style={styles.statsRow}>
              {[
                { num: [...new Set(calcs.filter((c) => c.datasourceSlug).map((c) => c.datasourceSlug))].length * 2, label: "Models generated", color: "#34d399" },
                { num: calcs.filter((c) => c.finalSql).length, label: "Fields translated", color: "#34d399" },
                { num: calcs.filter((c) => c.translatedByClaude).length, label: "AI-refined", color: "#2dd4bf" },
                { num: calcs.filter((c) => c.complexity === "untranslatable").length, label: "Untranslatable", color: "#f87171" },
              ].map((s) => (
                <div key={s.label} style={styles.statCard}>
                  <div style={{ ...styles.statNum, color: s.color }}>{s.num}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={styles.tabs}>
              {["report", "models", "schema", "metrics", "sources"].map((t) => (
                <button
                  key={t}
                  style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab(t)}
                >
                  {t === "report" ? "Translation Report"
                    : t === "models" ? "SQL Models"
                    : t === "schema" ? "schema.yml"
                    : t === "metrics" ? "metrics.yml"
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
                  {/* Staging models */}
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", marginTop: "4px" }}>Staging</div>
                  {Object.entries(outputFiles)
                    .filter(([k]) => k.startsWith("staging/"))
                    .map(([filename, content]) => (
                      <div key={filename}>
                        <div
                          style={{ ...styles.fileItem, cursor: "pointer", borderColor: previewModel === filename ? "#34d399" : "#0d2b1e" }}
                          onClick={() => setPreviewModel(previewModel === filename ? null : filename)}
                        >
                          <span style={styles.fileName}>{filename}</span>
                          <Badge type="simple" label="STAGING" />
                          <span style={{ fontSize: "10px", color: "#4b5563" }}>{previewModel === filename ? "▲ hide" : "▼ preview"}</span>
                          <button style={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); downloadFile(filename.split("/").pop(), content); }}>Download</button>
                        </div>
                        {previewModel === filename && (
                          <div style={{ ...styles.code, marginTop: "2px", borderTop: "none", borderRadius: "0 0 6px 6px" }}>{content}</div>
                        )}
                      </div>
                    ))}
                  {/* Mart models */}
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", marginTop: "16px" }}>Marts</div>
                  {Object.entries(outputFiles)
                    .filter(([k]) => k.startsWith("marts/"))
                    .map(([filename, content]) => (
                      <div key={filename}>
                        <div
                          style={{ ...styles.fileItem, cursor: "pointer", borderColor: previewModel === filename ? "#34d399" : "#0d2b1e" }}
                          onClick={() => setPreviewModel(previewModel === filename ? null : filename)}
                        >
                          <span style={styles.fileName}>{filename}</span>
                          <Badge type="moderate" label={filename.includes("/fct_") ? "FCT" : "DIM"} />
                          <span style={{ fontSize: "10px", color: "#4b5563" }}>{previewModel === filename ? "▲ hide" : "▼ preview"}</span>
                          <button style={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); downloadFile(filename.split("/").pop(), content); }}>Download</button>
                        </div>
                        {previewModel === filename && (
                          <div style={{ ...styles.code, marginTop: "2px", borderTop: "none", borderRadius: "0 0 6px 6px" }}>{content}</div>
                        )}
                      </div>
                    ))}
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

            {activeTab === "metrics" && (
              <div>
                <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#071e2a", border: "1px solid #0891b230", borderRadius: "6px", borderLeft: "3px solid #0891b2" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#67e8f9", marginBottom: "4px" }}>MetricFlow semantic layer</div>
                  <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: 1.6 }}>
                    Compatible with dbt &gt;= 1.6. Update <code style={{ color: "#2dd4bf" }}>TODO_ENTITY</code> and <code style={{ color: "#2dd4bf" }}>TODO_ID_COLUMN</code> with your primary key, then run <code style={{ color: "#2dd4bf" }}>dbt sl validate</code>.
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                  <button style={styles.btnSecondary} onClick={() => downloadFile("metrics.yml", outputFiles["metrics.yml"])}>
                    Download metrics.yml
                  </button>
                </div>
                <div style={styles.code}>{outputFiles["metrics.yml"]}</div>
              </div>
            )}

            {activeTab === "sources" && (
              <div>
                <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#071e2a", border: "1px solid #0891b230", borderRadius: "6px", borderLeft: "3px solid #0891b2" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#67e8f9", marginBottom: "6px" }}>How to use sources.yml</div>
                  <div style={{ fontSize: "11px", color: "#6b7280", lineHeight: 1.7 }}>
                    1. Fill in <code style={{ color: "#2dd4bf" }}>TODO_DATABASE</code>, <code style={{ color: "#2dd4bf" }}>TODO_SCHEMA</code>, and <code style={{ color: "#2dd4bf" }}>TODO_TABLE</code> with your Snowflake values<br />
                    2. Place this file in your dbt project root alongside <code style={{ color: "#2dd4bf" }}>schema.yml</code><br />
                    3. Run <code style={{ color: "#2dd4bf" }}>dbt source freshness</code> to validate the connection
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
        button:focus { outline: none; }
      `}</style>
    </div>
  );
}
