export default function ProgressBar({ value, max, color = "#0891b2" }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: "#0d2b1e", borderRadius: 4, height: 6, overflow: "hidden" }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}
