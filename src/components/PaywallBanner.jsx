import { useState, useEffect } from "react";
import posthog from "posthog-js";

export default function PaywallBanner({ fieldCount }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    posthog.capture("paywall_hit", { trigger: "field_limit", field_count: fieldCount });
  }, []);

  const handleCheckout = async () => {
    posthog.capture("checkout_started", { trigger: "field_limit", field_count: fieldCount });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldCount }),
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
    <div
      style={{
        background: "linear-gradient(135deg, rgba(5,150,105,0.08), rgba(8,145,178,0.08))",
        border: "1px solid rgba(8,145,178,0.3)",
        borderRadius: "12px",
        padding: "24px 28px",
        marginBottom: "24px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "#f0f0f0", marginBottom: "6px" }}>
          {fieldCount} calculated fields detected
        </div>
        <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.6 }}>
          Free exports cover up to 10 fields. This workbook has{" "}
          <span style={{ color: "#fbbf24" }}>{fieldCount}</span> — unlock the full export for{" "}
          <span style={{ color: "#34d399", fontWeight: 700 }}>$19</span> (one-time per workbook).
          Includes all SQL models, schema.yml, sources.yml, and the AI-refined translation report.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{
            background: loading ? "#0d2b1e" : "linear-gradient(135deg, #059669, #0891b2)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "12px 24px",
            fontSize: "13px",
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px #05966933",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Redirecting..." : "Unlock Full Export — $19"}
        </button>
        {error && (
          <div style={{ fontSize: "11px", color: "#f87171" }}>{error}</div>
        )}
        <div style={{ fontSize: "10px", color: "#4b5563" }}>Secure checkout via Stripe</div>
      </div>
    </div>
  );
}
