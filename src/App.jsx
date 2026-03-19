import { useState, useCallback, useRef, useEffect } from "react";
import DiffPage from "./pages/DiffPage.jsx";
import DocsPage from "./pages/DocsPage.jsx";
import AuditPage from "./pages/AuditPage.jsx";
import posthog from "posthog-js";
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
  mergeWorkbooks,
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
    background: "#f8fafc",
    color: "#1e293b",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    background: "#1e293b",
    padding: "10px 24px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#fff",
    textDecoration: "none",
  },
  logoAccent: { color: "#0ea5e9" },
  tagline: { fontSize: "11px", color: "rgba(255,255,255,0.35)", marginLeft: "auto" },
  main: { padding: "40px 32px", maxWidth: "1200px", margin: "0 auto" },
  h2: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#94a3b8",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: "16px",
  },
  dropzone: {
    border: "1.5px dashed #e2e8f0",
    borderRadius: "10px",
    padding: "32px 16px",
    textAlign: "center",
    cursor: "pointer",
    background: "#f8fafc",
    transition: "all 0.15s",
  },
  dropTitle: { fontSize: "13px", fontWeight: 600, color: "#64748b", marginBottom: "4px" },
  dropSub: { fontSize: "11px", color: "#94a3b8" },
  btn: {
    background: "#1e293b",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "10px 22px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.04em",
    transition: "opacity 0.15s",
    fontFamily: "inherit",
  },
  btnSecondary: {
    background: "transparent",
    color: "#475569",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    padding: "8px 16px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "20px 24px",
    marginBottom: "12px",
  },
  statsRow: { display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" },
  statCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "16px 20px",
    flex: "1",
    minWidth: "120px",
  },
  statNum: { fontSize: "28px", fontWeight: 700, color: "#0ea5e9", lineHeight: 1 },
  statLabel: { fontSize: "10px", color: "#94a3b8", marginTop: "4px", letterSpacing: "0.06em", textTransform: "uppercase" },
  calcRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "12px 16px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    marginBottom: "6px",
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  calcName: { fontSize: "13px", fontWeight: 600, color: "#1e293b", flex: 1 },
  log: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "6px",
    padding: "16px",
    maxHeight: "200px",
    overflowY: "auto",
    fontSize: "11px",
    fontFamily: "'JetBrains Mono', monospace",
  },
  logLine: { marginBottom: "4px", lineHeight: 1.5 },
  tabs: { display: "flex", gap: "0", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" },
  tab: {
    padding: "10px 20px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: "pointer",
    color: "#94a3b8",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    marginBottom: "-1px",
    fontFamily: "inherit",
  },
  tabActive: { color: "#0ea5e9", borderBottom: "2px solid #0ea5e9" },
  code: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "6px",
    padding: "16px",
    fontSize: "11px",
    fontFamily: "'JetBrains Mono', monospace",
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
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
  },
  fileName: { flex: 1, fontSize: "12px", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" },
};

const logColors = { info: "#94a3b8", success: "#0ea5e9", error: "#ef4444", warning: "#f59e0b" };

// ================================================================
// SCREENSHOT CAROUSEL
// ================================================================

const SCREENSHOTS = [
  {
    src: "/tableau2dbt_1.png",
    label: "Translation Report",
    caption: "Side-by-side Tableau formula → SQL with dependency chains and LOD CTE notes",
  },
  {
    src: "/tableau2dbt_2.png",
    label: "SQL Models",
    caption: "Staging, FCT, and DIM model files — download individually or grab the full .zip",
  },
  {
    src: "/tableau2dbt_3.png",
    label: "schema.yml",
    caption: "AI-generated field descriptions and not_null tests, ready to paste into your project",
  },
  {
    src: "/tableau2dbt_4.png",
    label: "metrics.yml",
    caption: "MetricFlow semantic layer wired to your dbt models — just swap the TODO entity columns",
  },
];

function ScreenshotCarousel() {
  const [active, setActive] = useState(0);
  const s = SCREENSHOTS[active];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
      {/* Tab pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
        {SCREENSHOTS.map((sc, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              padding: "6px 14px",
              borderRadius: "9999px",
              border: "1.5px solid",
              borderColor: i === active ? "#34d399" : "#374151",
              background: i === active ? "rgba(52,211,153,0.1)" : "transparent",
              color: i === active ? "#34d399" : "#9ca3af",
              fontSize: "12px",
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {sc.label}
          </button>
        ))}
      </div>

      {/* Screenshot */}
      <div style={{
        width: "100%",
        maxWidth: "720px",
        border: "1px solid #1f2937",
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
      }}>
        <img
          src={s.src}
          alt={s.label}
          style={{ width: "100%", display: "block" }}
        />
      </div>

      {/* Caption */}
      <div style={{ fontSize: "13px", color: "#6b7280", textAlign: "center", maxWidth: "560px" }}>
        {s.caption}
      </div>
    </div>
  );
}

// ================================================================
// STATIC PAGES
// ================================================================

function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #030f0a 0%, #071a12 55%, #071e2a 100%)", color: "#e2ede8", fontFamily: "'IBM Plex Mono', 'Fira Code', monospace" }}>
      <div style={{ padding: "40px 32px", maxWidth: "720px", margin: "0 auto" }}>
        <a href="/" style={{ fontSize: "11px", color: "#34d399", textDecoration: "none", letterSpacing: "0.06em" }}>← Back</a>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f0f0", margin: "24px 0 8px" }}>Privacy Policy</h1>
        <p style={{ fontSize: "11px", color: "#4b5563", marginBottom: "32px" }}>Last updated March 2026</p>
        {[
          ["Your workbook data never leaves your browser", "Parsing, classification, and rule-based translation happen entirely in your browser. Your .twb or .twbx file is never uploaded to our servers. Server URLs, database names, connection strings, and Tableau site paths extracted from your workbook are processed locally and never transmitted."],
          ["What is sent to AI", "When you run the export, Tableau formula expressions (the logic only — no connection metadata, no server names, no data values) are sent to Anthropic's Claude API for translation. These are batched and sent over HTTPS. Anthropic's data handling policies apply to this data."],
          ["Analytics", "We use PostHog to collect anonymous product usage events — which features are used, field counts, dialect selection, and export completions. No personally identifiable information is collected unless you voluntarily provide your email address."],
          ["Email capture", "If you provide your email address for updates, it is stored in Resend. You can unsubscribe at any time. We do not sell or share your email address."],
          ["Contact", "Questions? Email justin@klardata.com"],
        ].map(([title, body]) => (
          <div key={title} style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2ede8", marginBottom: "8px" }}>{title}</div>
            <div style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.8 }}>{body}</div>
          </div>
        ))}
        <p style={{ fontSize: "10px", color: "#374151", marginTop: "40px" }}>Not affiliated with or endorsed by Salesforce or Tableau.</p>
      </div>
    </div>
  );
}

function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #030f0a 0%, #071a12 55%, #071e2a 100%)", color: "#e2ede8", fontFamily: "'IBM Plex Mono', 'Fira Code', monospace" }}>
      <div style={{ padding: "40px 32px", maxWidth: "720px", margin: "0 auto" }}>
        <a href="/" style={{ fontSize: "11px", color: "#34d399", textDecoration: "none", letterSpacing: "0.06em" }}>← Back</a>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f0f0", margin: "24px 0 8px" }}>Terms of Service</h1>
        <p style={{ fontSize: "11px", color: "#4b5563", marginBottom: "32px" }}>Last updated March 2026</p>
        {[
          ["Use of the service", "tableautodbt.com is a tool that parses Tableau workbook files and generates dbt SQL models. You may use it for personal or commercial projects. You are responsible for reviewing and validating all generated SQL before using it in production."],
          ["No warranty", "The generated SQL, YAML, and documentation files are provided as a starting point. We make no guarantees about correctness, completeness, or fitness for any particular purpose. Always review the output before deploying to production."],
          ["Intellectual property", "You retain full ownership of your Tableau workbooks and all generated output files. We claim no rights over the SQL or YAML files generated from your workbooks."],
          ["Limitations", "We are not liable for any damages arising from the use of generated SQL in production systems. You are responsible for testing and validating all output."],
          ["Changes", "We may update these terms at any time. Continued use of the service constitutes acceptance of the current terms."],
          ["Contact", "Questions? Email justin@klardata.com"],
        ].map(([title, body]) => (
          <div key={title} style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2ede8", marginBottom: "8px" }}>{title}</div>
            <div style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.8 }}>{body}</div>
          </div>
        ))}
        <p style={{ fontSize: "10px", color: "#374151", marginTop: "40px" }}>Not affiliated with or endorsed by Salesforce or Tableau.</p>
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
        body: JSON.stringify({ email, source: "convert" }),
      });
      posthog.capture("email_captured", { source: "convert" });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div style={{ marginTop: "72px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "40px 32px", textAlign: "center" }}>
      <div style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>Stay in the loop</div>
      <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "24px" }}>New dialects, features, and migration guides. No spam.</div>
      {status === "done" ? (
        <div style={{ fontSize: "14px", color: "#0ea5e9" }}>You're on the list.</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", color: "#1e293b", fontSize: "13px", fontFamily: "inherit", width: "240px", outline: "none" }}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            style={{ padding: "10px 20px", background: "#1e293b", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            {status === "loading" ? "..." : "Notify Me"}
          </button>
        </form>
      )}
      {status === "error" && <div style={{ fontSize: "12px", color: "#ef4444", marginTop: "8px" }}>Something went wrong — try again.</div>}
    </div>
  );
}

// ================================================================
// MULTI-WORKBOOK PAYWALL
// ================================================================

function MultiWorkbookPaywall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    posthog.capture("paywall_hit", { trigger: "multi_workbook" });
  }, []);

  const handleCheckout = async () => {
    posthog.capture("checkout_started", { trigger: "multi_workbook" });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldCount: 999 }),
      });
      if (!res.ok) throw new Error("Failed to start checkout");
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError("Could not start checkout. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", marginBottom: "2px" }}>Unlock multi-workbook merge — $19</div>
        <div style={{ fontSize: "11px", color: "#64748b" }}>Same price as a single workbook export. Includes deduplication, conflict report, and all SQL models.</div>
        {error && <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>{error}</div>}
      </div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        style={{ ...styles.btn, whiteSpace: "nowrap", opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "Redirecting..." : "Unlock — $19"}
      </button>
    </div>
  );
}

// ================================================================
// MAIN APP
// ================================================================

export default function App() {
  const path = window.location.pathname;
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/terms") return <TermsPage />;
  if (path === "/app/diff" || path === "/diff") return <DiffPage />;
  if (path === "/app/docs" || path === "/docs") return <DocsPage />;
  if (path === "/app/audit" || path === "/audit") return <AuditPage />;

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
  const [paidSession, setPaidSession] = useState(() => localStorage.getItem("paid") === "1");
  const [grainConfig, setGrainConfig] = useState({});
  const [dialect, setDialect] = useState(() => sessionStorage.getItem("twb_pending_dialect") || "Snowflake");
  const [previewModel, setPreviewModel] = useState(null);
  const [multiMode, setMultiMode] = useState(false);
  const [workbooks, setWorkbooks] = useState([]); // [{ name, calcs, xmlString }]
  const [conflictResult, setConflictResult] = useState(null);
  const fileRef = useRef();
  const multiFileRef = useRef();

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
            localStorage.setItem("paid", "1");
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
  // const needsPayment = translatableCalcs.length > FREE_TIER_LIMIT && !paidSession;
  const needsPayment = false; // paywalls off during feedback period

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

      const translatableCount = withRuleTranslation.filter((c) => !["skip", "untranslatable"].includes(c.complexity)).length;
      posthog.capture("workbook_uploaded", {
        dialect,
        field_count: parsed.length,
        translatable_count: translatableCount,
        claude_count: needsClaudeCount,
        has_lod: withRuleTranslation.some((c) => c.lodCte),
        untranslatable_count: withRuleTranslation.filter((c) => c.complexity === "untranslatable").length,
      });

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

  useEffect(() => {
    const raw = sessionStorage.getItem("twb_pending_convert");
    if (!raw) return;
    sessionStorage.removeItem("twb_pending_convert");
    sessionStorage.removeItem("twb_pending_dialect");
    const { name, data } = JSON.parse(raw);
    fetch(data).then(r => r.blob()).then(blob => handleFile(new File([blob], name)));
  }, [handleFile]);

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
      const conflictData = conflictResult
        ? { conflicts: conflictResult.conflicts, matches: conflictResult.matches, workbookNames: workbooks.map((w) => w.name) }
        : null;
      files = await buildZip(updatedCalcs, xmlString, selectedFile?.replace(/\.(twb|twbx)$/i, ""), grainConfig, dialect, conflictData);
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
    const claudeCount = updatedCalcs.filter((c) => c.translatedByClaude).length;
    posthog.capture("translation_completed", {
      dialect,
      field_count: updatedCalcs.length,
      translatable_count: translatedCount,
      claude_count: claudeCount,
      multi_workbook: !!conflictResult,
      conflict_count: conflictResult?.conflicts.length || 0,
      auto_merged_count: conflictResult?.matches.length || 0,
      paid: paidSession,
    });
    addLog(`Done! ${translatedCount} models ready for dbt.`, "success");
    setActiveTab("report");
    setStage("results");
  }, [calcs, xmlString, grainConfig, dialect, conflictResult, workbooks]);

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
    // if (isFreeTier && !emailCaptured) {
    //   setShowEmailModal(true);
    //   return;
    // }
    posthog.capture("download_triggered", {
      field_count: calcs.length,
      paid: paidSession,
      multi_workbook: !!conflictResult,
      trigger: "direct",
    });
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
    posthog.capture("download_triggered", {
      field_count: calcs.length,
      paid: paidSession,
      multi_workbook: !!conflictResult,
      trigger: "email_gate",
    });
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
    setWorkbooks([]);
    setConflictResult(null);
  };

  // Parse a single file into { name, calcs, xmlString } without advancing the stage
  const parseWorkbookFile = async (file) => {
    let xmlText;
    if (file.name.toLowerCase().endsWith(".twbx")) {
      const zip = await JSZip.loadAsync(file);
      const twbEntry = Object.values(zip.files).find((f) => f.name.endsWith(".twb") && !f.dir);
      if (!twbEntry) throw new Error(`No .twb found inside ${file.name}`);
      xmlText = await twbEntry.async("string");
    } else {
      xmlText = await file.text();
    }
    const { calcs: parsed, internalIdMap } = parseTWB(xmlText);
    const classified = parsed.map((c) => ({
      ...c,
      complexity: classify(c.formula, c.calcClass),
      dependsOn: findDependencies(c.formula, internalIdMap),
      _idMap: internalIdMap,
    }));
    const withRuleTranslation = classified.map((c) => {
      if (["skip", "untranslatable"].includes(c.complexity)) return c;
      const ruleSql = ruleBasedTranslate(c.formula, internalIdMap, dialect);
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
    return { name: file.name.replace(/\.(twb|twbx)$/i, ""), calcs: withRuleTranslation, xmlString: xmlText };
  };

  const addWorkbookFile = async (file) => {
    setStage("parsing");
    setLog([]);
    addLog(`Parsing ${file.name}...`);
    try {
      const wb = await parseWorkbookFile(file);
      setWorkbooks((prev) => {
        const updated = [...prev.filter((w) => w.name !== wb.name), wb];
        addLog(`${wb.name}: ${wb.calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity)).length} translatable fields`, "success");
        return updated;
      });
      setStage("upload");
    } catch (err) {
      addLog(`Error parsing ${file.name}: ${err.message}`, "error");
      setStage("upload");
    }
  };

  const analyzeWorkbooks = () => {
    if (workbooks.length < 2) return;
    const result = mergeWorkbooks(workbooks);
    posthog.capture("merge_completed", {
      workbook_count: workbooks.length,
      total_fields: workbooks.reduce((n, w) => n + w.calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity)).length, 0),
      merged_count: result.mergedCalcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity)).length,
      conflict_count: result.conflicts.length,
      auto_merged_count: result.matches.length,
    });
    setConflictResult(result);
    // Use the first workbook's xmlString for sources.yml generation
    setXmlString(workbooks[0].xmlString);
    setSelectedFile(workbooks.map((w) => w.name).join(" + "));
    setStage("conflicts");
  };

  const proceedFromConflicts = () => {
    // Set up merged calcs and run the standard scan → preview → translating flow
    const scan = scanTWB(workbooks[0].xmlString);
    setScanResults(scan);
    setCalcs(conflictResult.mergedCalcs);
    setStage("scan");
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
        <a href="/" style={styles.logo}>
          Tableau<span style={styles.logoAccent}>to</span>Dbt
        </a>
        {selectedFile && (
          <div style={{ fontSize: "11px", color: "#0ea5e9", background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.2)", borderRadius: "4px", padding: "4px 10px" }}>
            {selectedFile}
          </div>
        )}
        <nav style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {[
            { label: "Convert", href: "/" },
            { label: "Diff", href: "/diff" },
            { label: "Docs", href: "/docs" },
            { label: "Audit", href: "/audit" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{
                fontSize: "12px",
                color: label === "Convert" ? "#fff" : "rgba(255,255,255,0.55)",
                padding: "5px 12px",
                borderRadius: "6px",
                textDecoration: "none",
                background: label === "Convert" ? "rgba(255,255,255,0.1)" : "transparent",
                fontWeight: label === "Convert" ? 600 : 400,
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div style={styles.main}>
        {/* ── UPLOAD ── */}
        {stage === "upload" && (
          <div>
            {/* Split hero */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "0", margin: "-40px -32px 0", borderBottom: "1px solid #e2e8f0" }}>
              {/* Left: Copy */}
              <div style={{ padding: "64px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 12px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "20px", fontSize: "11px", fontWeight: 600, color: "#0ea5e9", marginBottom: "20px", width: "fit-content" }}>
                  ⚡ Free tier · Browser-only · Snowflake & BigQuery
                </div>
                <h1 style={{ fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 800, color: "#1e293b", lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: "8px", fontFamily: "inherit" }}>
                  You're not starting from scratch.<br />
                  <span style={{ color: "#0ea5e9" }}>You're starting from 80% done.</span>
                </h1>
                <p style={{ fontSize: "15px", color: "#64748b", maxWidth: "480px", lineHeight: 1.75, marginBottom: "28px" }}>
                  Upload a .twb or .twbx and get a complete, layered dbt package: staging models, fct_ and dim_ marts, LOD-to-CTE translation, a MetricFlow semantic layer, schema tests, and source definitions.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "36px" }}>
                  {[
                    "Staging layer per datasource, fct_ and dim_ models properly split",
                    "LOD expressions (FIXED / INCLUDE / EXCLUDE) translated to CTE patterns",
                    "MetricFlow metrics.yml generated for a queryable semantic layer",
                    "sources.yml and schema tests ready for dbt test on day one",
                    "Multi-workbook merge mode with conflict report",
                    "SETUP.md and full translation report included in every export",
                    "Formula data never leaves your browser",
                  ].map((f) => (
                    <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
                      <div style={{ width: "6px", height: "6px", background: "#0ea5e9", borderRadius: "50%", flexShrink: 0, marginTop: "6px" }} />
                      {f}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", borderTop: "1px solid #f1f5f9", paddingTop: "20px" }}>
                  Used by analytics engineers at mid-size and enterprise companies migrating complex Tableau deployments to a modern data stack.
                </div>
              </div>

              {/* Right: Widget */}
              <div style={{ background: "#f8fafc", borderLeft: "1px solid #e2e8f0", padding: "40px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                  {/* Chrome bar */}
                  <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "8px 14px", display: "flex", alignItems: "center", gap: "7px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444" }} />
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b" }} />
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginLeft: "6px" }}>Convert Workbook to dbt</span>
                  </div>

                  <div style={{ padding: "24px" }}>
                    {/* Dialect toggle */}
                    <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", marginBottom: "8px" }}>Target warehouse</div>
                    <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
                      {["Snowflake", "BigQuery"].map((d) => (
                        <button
                          key={d}
                          onClick={() => setDialect(d)}
                          style={{
                            flex: 1, padding: "8px 0", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                            fontFamily: "inherit", cursor: "pointer", border: "1px solid",
                            borderColor: dialect === d ? "#0ea5e9" : "#e2e8f0",
                            background: dialect === d ? "#f0f9ff" : "#f8fafc",
                            color: dialect === d ? "#0369a1" : "#94a3b8",
                            textAlign: "center", transition: "all 0.15s",
                          }}
                        >
                          {d}
                        </button>
                      ))}
                    </div>

                    {/* Upload zone */}
                    <div
                      style={{ border: "1.5px dashed #e2e8f0", borderRadius: "10px", padding: "28px 16px", textAlign: "center", cursor: "pointer", background: "#f8fafc", transition: "all 0.15s", marginBottom: "16px" }}
                      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) multiMode ? addWorkbookFile(f) : handleFile(f); }}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.background = "#f0f9ff"; }}
                      onDragLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.background = ""; }}
                      onClick={() => multiMode ? multiFileRef.current?.click() : fileRef.current?.click()}
                    >
                      <div style={{ fontSize: "26px", color: "#cbd5e1", marginBottom: "8px" }}>↑</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                        {multiMode ? "Drop workbooks here to add" : "Drop .twb or .twbx"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>or click to browse</div>
                    </div>

                    {/* Output preview */}
                    <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", marginBottom: "8px" }}>Output preview</div>
                    <div style={{ background: "#1e293b", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontFamily: "'JetBrains Mono', monospace" }}>
                      {[
                        { icon: "📁", name: "staging/", badge: null, indent: 0 },
                        { icon: "📄", name: "stg_sales.sql", badge: "STG", bc: { bg: "rgba(14,165,233,0.15)", color: "#0ea5e9" }, indent: 14 },
                        { icon: "📁", name: "marts/", badge: null, indent: 0 },
                        { icon: "📄", name: "fct_orders.sql", badge: "FCT", bc: { bg: "rgba(139,92,246,0.15)", color: "#a78bfa" }, indent: 14 },
                        { icon: "📄", name: "dim_customers.sql", badge: "DIM", bc: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" }, indent: 14 },
                        { icon: "📄", name: "metrics.yml", badge: "YML", bc: { bg: "rgba(251,146,60,0.15)", color: "#fb923c" }, indent: 0 },
                        { icon: "📄", name: "sources.yml", badge: "YML", bc: { bg: "rgba(251,146,60,0.15)", color: "#fb923c" }, indent: 0 },
                        { icon: "📄", name: "SETUP.md", badge: null, indent: 0 },
                      ].map((f) => (
                        <div key={f.name} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", paddingLeft: f.indent, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <span style={{ fontSize: "11px", width: "14px", textAlign: "center", flexShrink: 0 }}>{f.icon}</span>
                          <span style={{ fontSize: "10px", color: "#94a3b8", flex: 1 }}>{f.name}</span>
                          {f.badge && <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", fontWeight: 700, background: f.bc.bg, color: f.bc.color }}>{f.badge}</span>}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => multiMode ? multiFileRef.current?.click() : fileRef.current?.click()}
                      style={{ width: "100%", padding: "13px", background: "#1e293b", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Convert to dbt →
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: "center", fontSize: "11px", color: "#94a3b8", marginTop: "12px" }}>
                  🔒 All processing is local. Nothing is uploaded.
                </div>

                {/* Multi-workbook toggle */}
                <div style={{ marginTop: "12px" }}>
                  <button
                    onClick={() => { setMultiMode((m) => !m); setWorkbooks([]); setLog([]); }}
                    style={{
                      padding: "6px 14px", fontSize: "11px", fontWeight: 700, fontFamily: "inherit",
                      borderRadius: "6px", cursor: "pointer",
                      border: multiMode ? "1px solid #f59e0b" : "1px solid #e2e8f0",
                      background: multiMode ? "rgba(245,158,11,0.08)" : "transparent",
                      color: multiMode ? "#f59e0b" : "#94a3b8",
                      transition: "all 0.15s",
                    }}
                  >
                    {multiMode ? "✓ Multi-workbook mode" : "Compare multiple workbooks"}
                  </button>
                </div>

                {/* Multi-workbook file list */}
                {multiMode && (
                  <div style={{ marginTop: "12px", padding: "16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>
                      Workbooks ({workbooks.length})
                    </div>
                    {workbooks.length === 0 && (
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "10px" }}>No workbooks added yet — drop files above</div>
                    )}
                    {workbooks.map((wb) => (
                      <div key={wb.name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", marginBottom: "5px" }}>
                        <span style={{ fontSize: "12px", color: "#0ea5e9" }}>✓</span>
                        <span style={{ flex: 1, fontSize: "12px", color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{wb.name}</span>
                        <span style={{ fontSize: "10px", color: "#94a3b8" }}>{wb.calcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity)).length} fields</span>
                        <button style={{ fontSize: "10px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }} onClick={() => setWorkbooks((prev) => prev.filter((w) => w.name !== wb.name))}>✕</button>
                      </div>
                    ))}
                    {log.filter((l) => l.type === "error").map((l, i) => (
                      <div key={i} style={{ fontSize: "11px", color: "#ef4444", marginBottom: "4px" }}>{l.msg}</div>
                    ))}
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                      <button style={{ ...styles.btnSecondary, fontSize: "12px" }} onClick={() => multiFileRef.current?.click()}>+ Add workbook</button>
                      {workbooks.length >= 2 && <button style={styles.btn} onClick={analyzeWorkbooks}>Analyze & Merge →</button>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <input ref={fileRef} type="file" accept=".twb,.twbx" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            <input ref={multiFileRef} type="file" accept=".twb,.twbx" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) addWorkbookFile(e.target.files[0]); e.target.value = ""; }} />

            {/* Below fold */}
            <div style={{ padding: "64px 0", maxWidth: "960px", margin: "0 auto" }}>
              {/* See it in action */}
              <div style={{ marginBottom: "64px" }}>
                <div style={{ ...styles.h2, marginBottom: "8px", textAlign: "center" }}>See it in action</div>
                <div style={{ fontSize: "14px", color: "#94a3b8", textAlign: "center", marginBottom: "28px" }}>
                  Upload a .twb — walk away with a full dbt package
                </div>
                <ScreenshotCarousel />
              </div>

              {/* How it works */}
              <div style={{ ...styles.h2, marginBottom: "20px" }}>How it works</div>
              <div style={{ display: "flex", gap: "0", marginBottom: "56px" }}>
                {[
                  { step: "01", label: "Parse", desc: "Reads every calculated field from .twb or .twbx. Resolves Calculation_XXXX internal IDs to human-readable names. Maps each field to its datasource. .twbx files are unzipped automatically." },
                  { step: "02", label: "Classify", desc: "Categorises fields by complexity: simple expressions, date/conditional logic, LOD expressions (FIXED/INCLUDE/EXCLUDE), and table calcs flagged for window function rewrites." },
                  { step: "03", label: "Translate", desc: "Rule-based pass converts Tableau syntax to your target dialect (Snowflake or BigQuery). LOD expressions generate CTE templates. Complex calcs go through an AI pass to resolve intent. Dependency chains are resolved." },
                  { step: "04", label: "Structure", desc: "Aggregates go into fct_ models with GROUP BY. Row-level expressions go into dim_ models. LOD CTEs are injected into the WITH clause. MetricFlow metrics.yml is generated for a queryable semantic layer." },
                ].map((s, i, arr) => (
                  <div key={s.step} style={{ flex: 1, padding: "20px", background: "#fff", border: "1px solid #e2e8f0", borderRight: i < arr.length - 1 ? "none" : "1px solid #e2e8f0", borderRadius: i === 0 ? "10px 0 0 10px" : i === arr.length - 1 ? "0 10px 10px 0" : "0" }}>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "#e2e8f0", marginBottom: "8px" }}>{s.step}</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#0ea5e9", marginBottom: "4px" }}>{s.label}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                ))}
              </div>

              {/* What you get */}
              <div style={{ ...styles.h2, marginBottom: "20px" }}>What you get</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[
                  { file: "staging/stg_*.sql", icon: "🗂️", label: "Staging layer, one per datasource", desc: "A clean, typed view over your raw source table. Column names referenced in your Tableau formulas are pre-populated. All downstream models reference this." },
                  { file: "marts/fct_*.sql + dim_*.sql", icon: "📐", label: "fct_ and dim_ models, properly split", desc: "Aggregate expressions land in a fct_ model with a GROUP BY you configure. Row-level expressions land in a dim_ model. No more invalid SQL mixing both in one SELECT." },
                  { file: "metrics.yml", icon: "📡", label: "MetricFlow semantic layer (dbt 1.6+)", desc: "Simple aggregations become proper semantic_model measures. Derived expressions are generated as type: derived metrics. Fill in your primary key, run dbt sl validate." },
                  { file: "FIXED / INCLUDE / EXCLUDE to CTEs", icon: "🔗", label: "LOD expressions translated to CTE patterns", desc: "FIXED LODs are converted to SQL CTE templates and injected directly into your fct_ model's WITH clause. No manual rewrite required." },
                  { file: "sources.yml + schema.yml", icon: "🧪", label: "Source definitions and schema tests", desc: "Datasource names extracted from your workbook XML and pre-populated in sources.yml. not_null tests on every measure, unique + not_null on staging primary keys." },
                  { file: "conflict_report.md", icon: "🔀", label: "Multi-workbook merge mode", desc: "Upload 2+ workbooks. Identical fields are auto-merged into one canonical definition. Formula conflicts are flagged with both versions side by side." },
                  { file: "STG / FCT / DIM preview before you run", icon: "🗺️", label: "Models breakdown before you commit", desc: "Before the AI pass, see the full output structure: every staging model, field counts, grain status, and LOD CTE count." },
                  { file: "SETUP.md + translation_report.md", icon: "📋", label: "Step-by-step docs and full translation report", desc: "SETUP.md lists every datasource, grain instructions, and dbt commands to run. The translation report shows original formula to SQL output side by side." },
                ].map((item) => (
                  <div key={item.file} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "18px 20px", display: "flex", gap: "14px" }}>
                    <div style={{ fontSize: "20px", flexShrink: 0, marginTop: "2px" }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: "#0ea5e9", marginBottom: "4px" }}>{item.file}</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>{item.label}</div>
                      <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
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
            <div style={{ fontSize: "16px", color: "#1e293b", marginBottom: "24px" }}>Parsing workbook...</div>
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
              <div style={{ width: "60px", height: "60px", margin: "0 auto 16px", background: "#1e293b", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", boxShadow: "0 8px 28px rgba(0,0,0,0.1)" }}>🔍</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>Privacy Scan Complete</div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                <span style={{ color: "#0ea5e9" }}>{selectedFile}</span> · {scanResults.staysInBrowser.length} local items · {scanResults.translatableCount} formulas to translate
              </div>
            </div>

            {/* Stays in browser */}
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "18px 20px", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <div style={{ width: "28px", height: "28px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>🔒</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#166534" }}>Stays in your browser</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Connection metadata — never transmitted</div>
                </div>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#166534", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>BROWSER ONLY</div>
              </div>
              {scanResults.staysInBrowser.length === 0 ? (
                <div style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>No connection strings or server paths detected</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {scanResults.staysInBrowser.map((f, i) => (
                    <div key={i} style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "6px 10px" }}>
                      <div style={{ fontSize: "9px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>{f.type}</div>
                      <div style={{ fontSize: "11px", color: "#1e293b", fontFamily: "'JetBrains Mono', monospace" }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Flagged */}
            {scanResults.flagged.length > 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "18px 20px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ width: "28px", height: "28px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>⚠️</div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#92400e" }}>Possible client names detected</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>In parameter defaults — classified as skip, not sent to AI</div>
                  </div>
                  <div style={{ marginLeft: "auto", fontSize: "9px", fontWeight: 700, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>NOT SENT</div>
                </div>
                {scanResults.flagged.map((f, i) => (
                  <div key={i} style={{ fontSize: "11px", color: "#92400e", fontFamily: "'JetBrains Mono', monospace", padding: "6px 10px", background: "#fff", borderRadius: "5px", marginBottom: "4px" }}>
                    <span style={{ opacity: 0.5 }}>{f.caption}: </span>{f.value}
                  </div>
                ))}
              </div>
            )}

            {/* Sent to AI */}
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "12px", padding: "18px 20px", marginBottom: "28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "28px", height: "28px", background: "#e0f2fe", border: "1px solid #7dd3fc", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>✨</div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0369a1" }}>Sent to AI for translation</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Formula logic only — no connection data</div>
                  </div>
                </div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#0ea5e9", lineHeight: 1 }}>{scanResults.translatableCount}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                style={{ flex: 1, padding: "14px", background: "#1e293b", border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                onClick={() => setStage("preview")}
              >
                Looks good — continue to preview →
              </button>
              <button
                style={{ padding: "14px 20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", color: "#64748b", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}
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
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>Ready to translate</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Review the field breakdown, then run the full export</div>
              </div>
              {!needsPayment && (
                <button style={styles.btn} onClick={runTranslation}>
                  Run Export →
                </button>
              )}
            </div>

            <div style={styles.statsRow}>
              {[
                { num: translatable.filter((c) => c.complexity === "simple").length, label: "Simple", color: "#0ea5e9" },
                { num: translatable.filter((c) => c.complexity === "moderate").length, label: "Moderate", color: "#8b5cf6" },
                { num: translatable.filter((c) => c.complexity === "complex").length, label: "Complex", color: "#f59e0b" },
                { num: claudeCount, label: "AI layer", color: "#06b6d4" },
                { num: untranslatable.length, label: "Untranslatable", color: "#ef4444" },
                { num: skipped.length, label: "Skipped", color: "#94a3b8" },
              ].map((s) => (
                <div key={s.label} style={styles.statCard}>
                  <div style={{ ...styles.statNum, color: s.color }}>{s.num}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Models breakdown */}
            {(() => {
              // Preview uses ruleSql (finalSql not set until after translation)
              const previewCalcs = calcs.map((c) => ({ ...c, finalSql: c.ruleSql || c.formula }));
              const datasources = groupByDatasource(previewCalcs);
              if (datasources.length === 0) return null;
              const totalLods = calcs.filter((c) => c.lodCte).length;
              const totalUntranslatable = calcs.filter((c) => c.complexity === "untranslatable").length;
              return (
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
                    Models to be generated
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {datasources.map((ds) => {
                      const lodCount = [...(ds.aggregates || []), ...(ds.rowLevel || [])].filter((c) => c.lodCte).length;
                      const grain = grainConfig[ds.slug]?.cols;
                      return (
                        <div key={ds.slug} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px 18px" }}>
                          {/* Staging */}
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: ds.aggregates?.length > 0 || ds.rowLevel?.length > 0 ? "10px" : "0" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#0ea5e9", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.05em" }}>STG</span>
                            <code style={{ fontSize: "12px", color: "#1e293b", fontFamily: "'JetBrains Mono', monospace" }}>stg_{ds.slug}.sql</code>
                            <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto" }}>
                              {(ds.aggregates?.length || 0) + (ds.rowLevel?.length || 0)} fields
                            </span>
                          </div>
                          {/* Fct */}
                          {ds.aggregates?.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "20px", marginBottom: ds.rowLevel?.length > 0 ? "6px" : "0" }}>
                              <span style={{ fontSize: "10px", color: "#e2e8f0" }}>└</span>
                              <span style={{ fontSize: "10px", fontWeight: 700, color: "#8b5cf6", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.05em" }}>FCT</span>
                              <code style={{ fontSize: "12px", color: "#1e293b", fontFamily: "'JetBrains Mono', monospace" }}>fct_{ds.slug}.sql</code>
                              <span style={{ fontSize: "11px", color: "#94a3b8" }}>{ds.aggregates.length} aggregates</span>
                              {grain ? (
                                <span style={{ fontSize: "10px", color: "#0ea5e9", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "4px", padding: "2px 7px", marginLeft: "auto" }}>
                                  GROUP BY {grain}
                                </span>
                              ) : (
                                <span style={{ fontSize: "10px", color: "#f59e0b", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "4px", padding: "2px 7px", marginLeft: "auto" }}>
                                  ⚠ grain not set
                                </span>
                              )}
                            </div>
                          )}
                          {/* Dim */}
                          {ds.rowLevel?.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "20px" }}>
                              <span style={{ fontSize: "10px", color: "#e2e8f0" }}>└</span>
                              <span style={{ fontSize: "10px", fontWeight: 700, color: "#f59e0b", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.05em" }}>DIM</span>
                              <code style={{ fontSize: "12px", color: "#1e293b", fontFamily: "'JetBrains Mono', monospace" }}>dim_{ds.slug}.sql</code>
                              <span style={{ fontSize: "11px", color: "#94a3b8" }}>{ds.rowLevel.length} row-level</span>
                              {lodCount > 0 && (
                                <span style={{ fontSize: "10px", color: "#06b6d4", marginLeft: "auto" }}>{lodCount} LOD CTE{lodCount !== 1 ? "s" : ""}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Summary footer */}
                  <div style={{ display: "flex", gap: "20px", marginTop: "10px", padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "11px", color: "#94a3b8" }}>
                    <span><span style={{ color: "#0ea5e9" }}>{datasources.length}</span> datasource{datasources.length !== 1 ? "s" : ""}</span>
                    <span><span style={{ color: "#0ea5e9" }}>{datasources.filter(ds => ds.aggregates?.length > 0).length * 2 + datasources.filter(ds => !ds.aggregates?.length && ds.rowLevel?.length > 0).length + datasources.length}</span> models total</span>
                    {totalLods > 0 && <span><span style={{ color: "#06b6d4" }}>{totalLods}</span> LOD CTEs to wire up</span>}
                    {totalUntranslatable > 0 && <span><span style={{ color: "#ef4444" }}>{totalUntranslatable}</span> table calcs need manual rewrite</span>}
                  </div>
                </div>
              );
            })()}

            {/* Grain config per datasource */}
            {(() => {
              const datasources = groupByDatasource(calcs);
              const aggregateDatasources = datasources.filter((ds) => ds.aggregates?.length > 0);
              if (aggregateDatasources.length === 0) return null;
              return (
                <div style={{ marginBottom: "24px", padding: "18px 20px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", borderLeft: "3px solid #0ea5e9" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#0369a1", marginBottom: "4px" }}>Grain configuration</div>
                  <div style={{ fontSize: "11px", color: "#64748b", lineHeight: 1.6, marginBottom: "14px" }}>
                    For each datasource with aggregate metrics, specify the grain columns (comma-separated).
                    These become the GROUP BY in your <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>fct_</code> models.
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
                          <code style={{ fontSize: "12px", color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>fct_{ds.slug}</code>
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>· {ds.aggregates.length} aggregate fields</span>
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
                            background: "#fff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "6px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "#1e293b",
                            fontFamily: "'JetBrains Mono', monospace",
                            outline: "none",
                          }}
                        />
                        {hint && !grainConfig[ds.slug]?.cols && (
                          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>
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
                  style={{ ...styles.calcRow, borderColor: expandedCalc === i ? "#bae6fd" : "#e2e8f0" }}
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
                        <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "4px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Formula</div>
                        <div style={{ ...styles.code, maxHeight: "120px", fontSize: "11px" }}>
                          {c.formula}
                        </div>
                        {c.claudeReasons?.length > 0 && (
                          <div style={{ marginTop: "8px", fontSize: "11px", color: "#0ea5e9" }}>
                            AI flags: {c.claudeReasons.join(" · ")}
                          </div>
                        )}
                        {c.dependsOn?.length > 0 && (
                          <div style={{ marginTop: "4px", fontSize: "11px", color: "#f59e0b" }}>
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
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
              Translating...
            </div>
            {progress.total > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>
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

        {/* ── CONFLICTS ── */}
        {stage === "conflicts" && conflictResult && (
          <div style={{ maxWidth: "720px", margin: "0 auto" }}>
            <div style={{ marginBottom: "28px" }}>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>Merge Analysis</div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                {workbooks.map((w) => w.name).join(" · ")} — {conflictResult.mergedCalcs.filter((c) => !["skip", "untranslatable"].includes(c.complexity)).length} unique translatable fields
              </div>
            </div>

            {/* Auto-merged */}
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "18px 20px", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: conflictResult.matches.length > 0 ? "14px" : "0" }}>
                <div style={{ width: "28px", height: "28px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>✓</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#166534" }}>Auto-merged: {conflictResult.matches.length} identical field{conflictResult.matches.length !== 1 ? "s" : ""}</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>Same formula across workbooks — one canonical definition used</div>
                </div>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#166534", background: "#dcfce7", border: "1px solid #86efac", borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>AUTO-MERGED</div>
              </div>
              {conflictResult.matches.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {conflictResult.matches.map((m) => (
                    <div key={m.key} style={{ fontSize: "11px", color: "#166534", background: "#fff", border: "1px solid #bbf7d0", borderRadius: "4px", padding: "3px 8px", fontFamily: "'JetBrains Mono', monospace" }}>
                      {m.caption}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conflicts */}
            {conflictResult.conflicts.length > 0 ? (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <div style={{ width: "28px", height: "28px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>⚠️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#92400e" }}>{conflictResult.conflicts.length} field conflict{conflictResult.conflicts.length !== 1 ? "s" : ""} — different formulas</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>First version used. Full details in <code style={{ color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>conflict_report.md</code> in your zip.</div>
                  </div>
                </div>
                {conflictResult.conflicts.map((cf) => (
                  <div key={cf.key} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid #fde68a" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#92400e", marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace" }}>
                      {cf.caption} <span style={{ color: "#94a3b8", fontWeight: 400 }}>({cf.datasource})</span>
                    </div>
                    {cf.versions.map((v, vi) => (
                      <div key={vi} style={{ marginBottom: "4px" }}>
                        <div style={{ fontSize: "10px", color: "#64748b", marginBottom: "2px" }}>
                          {v.workbookName}{vi === 0 ? " · used" : ""}
                        </div>
                        <div style={{ fontSize: "11px", color: vi === 0 ? "#92400e" : "#94a3b8", fontFamily: "'JetBrains Mono', monospace", background: vi === 0 ? "#fff" : "#f8fafc", padding: "6px 10px", borderRadius: "4px", border: "1px solid #e2e8f0", opacity: vi === 0 ? 1 : 0.7 }}>
                          {v.formula.length > 160 ? v.formula.slice(0, 160) + "…" : v.formula}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "14px 18px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "20px", fontSize: "12px", color: "#166534" }}>
                No conflicts — all shared fields are identical across workbooks ✓
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                style={{ flex: 1, padding: "14px", background: "#1e293b", border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                onClick={proceedFromConflicts}
              >
                Continue to preview →
              </button>
              <button
                style={{ padding: "14px 20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", color: "#64748b", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}
                onClick={resetApp}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {stage === "results" && outputFiles && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>
                  Export ready ✓
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  {Object.keys(outputFiles).length} files generated
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  style={{ ...styles.btn, opacity: zipping ? 0.6 : 1 }}
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
              <div style={{ marginBottom: "20px", padding: "12px 16px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", fontSize: "12px", color: "#64748b" }}>
                Free export · {translatable.length} fields · Enter your email to download
              </div>
            )}

            <div style={styles.statsRow}>
              {[
                { num: [...new Set(calcs.filter((c) => c.datasourceSlug).map((c) => c.datasourceSlug))].length * 2, label: "Models generated", color: "#0ea5e9" },
                { num: calcs.filter((c) => c.finalSql).length, label: "Fields translated", color: "#0ea5e9" },
                { num: calcs.filter((c) => c.translatedByClaude).length, label: "AI-refined", color: "#06b6d4" },
                { num: calcs.filter((c) => c.complexity === "untranslatable").length, label: "Untranslatable", color: "#ef4444" },
              ].map((s) => (
                <div key={s.label} style={styles.statCard}>
                  <div style={{ ...styles.statNum, color: s.color }}>{s.num}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={styles.tabs}>
              {["report", "models", "schema", "metrics", "sources", ...(outputFiles["conflict_report.md"] ? ["conflicts"] : [])].map((t) => (
                <button
                  key={t}
                  style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab(t)}
                >
                  {t === "report" ? "Translation Report"
                    : t === "models" ? "SQL Models"
                    : t === "schema" ? "schema.yml"
                    : t === "metrics" ? "metrics.yml"
                    : t === "conflicts" ? "⚠ Conflicts"
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
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", marginTop: "4px" }}>Staging</div>
                  {Object.entries(outputFiles)
                    .filter(([k]) => k.startsWith("staging/"))
                    .map(([filename, content]) => (
                      <div key={filename}>
                        <div
                          style={{ ...styles.fileItem, cursor: "pointer", borderColor: previewModel === filename ? "#0ea5e9" : "#e2e8f0" }}
                          onClick={() => setPreviewModel(previewModel === filename ? null : filename)}
                        >
                          <span style={styles.fileName}>{filename}</span>
                          <Badge type="simple" label="STAGING" />
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>{previewModel === filename ? "▲ hide" : "▼ preview"}</span>
                          <button style={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); downloadFile(filename.split("/").pop(), content); }}>Download</button>
                        </div>
                        {previewModel === filename && (
                          <div style={{ ...styles.code, marginTop: "2px", borderTop: "none", borderRadius: "0 0 6px 6px" }}>{content}</div>
                        )}
                      </div>
                    ))}
                  {/* Mart models */}
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", marginTop: "16px" }}>Marts</div>
                  {Object.entries(outputFiles)
                    .filter(([k]) => k.startsWith("marts/"))
                    .map(([filename, content]) => (
                      <div key={filename}>
                        <div
                          style={{ ...styles.fileItem, cursor: "pointer", borderColor: previewModel === filename ? "#0ea5e9" : "#e2e8f0" }}
                          onClick={() => setPreviewModel(previewModel === filename ? null : filename)}
                        >
                          <span style={styles.fileName}>{filename}</span>
                          <Badge type="moderate" label={filename.includes("/fct_") ? "FCT" : "DIM"} />
                          <span style={{ fontSize: "10px", color: "#94a3b8" }}>{previewModel === filename ? "▲ hide" : "▼ preview"}</span>
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
                <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "6px", borderLeft: "3px solid #0ea5e9" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#0369a1", marginBottom: "4px" }}>MetricFlow semantic layer</div>
                  <div style={{ fontSize: "11px", color: "#64748b", lineHeight: 1.6 }}>
                    Compatible with dbt &gt;= 1.6. Update <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>TODO_ENTITY</code> and <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>TODO_ID_COLUMN</code> with your primary key, then run <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>dbt sl validate</code>.
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

            {activeTab === "conflicts" && outputFiles["conflict_report.md"] && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                  <button style={styles.btnSecondary} onClick={() => downloadFile("conflict_report.md", outputFiles["conflict_report.md"])}>
                    Download conflict_report.md
                  </button>
                </div>
                <div style={styles.code}>{outputFiles["conflict_report.md"]}</div>
              </div>
            )}

            {activeTab === "sources" && (
              <div>
                <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "6px", borderLeft: "3px solid #0ea5e9" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#0369a1", marginBottom: "6px" }}>How to use sources.yml</div>
                  <div style={{ fontSize: "11px", color: "#64748b", lineHeight: 1.7 }}>
                    1. Fill in <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>TODO_DATABASE</code>, <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>TODO_SCHEMA</code>, and <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>TODO_TABLE</code> with your Snowflake values<br />
                    2. Place this file in your dbt project root alongside <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>schema.yml</code><br />
                    3. Run <code style={{ color: "#0ea5e9", fontFamily: "'JetBrains Mono', monospace" }}>dbt source freshness</code> to validate the connection
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
                  <div style={{ ...styles.code, color: "#94a3b8" }}>
                    sources.yml could not be generated — datasource metadata not found in workbook.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Email capture */}
      <EmailCapture />

      {/* Footer */}
      <footer style={{ background: "#1e293b", marginTop: "80px" }}>
        <div style={{ padding: "14px 32px", display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
          <a href="/" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Convert</a>
          <a href="/diff" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Diff</a>
          <a href="/docs" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Docs</a>
          <a href="/audit" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Audit</a>
          <a href="/privacy" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Privacy</a>
          <a href="/terms" style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Terms</a>
          <span style={{ marginLeft: "auto", fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>Not affiliated with Salesforce or Tableau.</span>
        </div>
      </footer>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #f8fafc; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
        button:focus { outline: none; }
      `}</style>
    </div>
  );
}
