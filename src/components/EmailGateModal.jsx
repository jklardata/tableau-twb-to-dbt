import { useState } from "react";

export default function EmailGateModal({ onSuccess, onClose }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "free_download" }),
      });
      onSuccess(email);
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3,15,10,0.88)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#0a1f15",
          border: "1px solid #0d2b1e",
          borderRadius: "12px",
          padding: "36px 32px",
          maxWidth: "440px",
          width: "100%",
        }}
      >
        <div style={{ fontSize: "24px", marginBottom: "12px" }}>📬</div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#f0f0f0", marginBottom: "8px" }}>
          Your export is ready
        </div>
        <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6, marginBottom: "24px" }}>
          Drop your email to download. We'll send you the file and occasional tips on Tableau→dbt migrations.
          No spam.
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              background: "#071a12",
              border: "1px solid #0d4a2e",
              borderRadius: "6px",
              padding: "10px 14px",
              fontSize: "13px",
              color: "#e2ede8",
              fontFamily: "inherit",
              outline: "none",
              marginBottom: "12px",
              boxSizing: "border-box",
            }}
          />
          {error && (
            <div style={{ fontSize: "12px", color: "#f87171", marginBottom: "10px" }}>{error}</div>
          )}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                background: loading ? "#0d2b1e" : "linear-gradient(135deg, #059669, #0891b2)",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "11px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: loading ? "default" : "pointer",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Sending..." : "Download Free Export"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                color: "#4b5563",
                border: "1px solid #0d2b1e",
                borderRadius: "6px",
                padding: "11px 16px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
