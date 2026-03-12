const BADGE_COLORS = {
  simple: { bg: "#05966918", text: "#34d399", border: "#05966940" },
  moderate: { bg: "#0891b218", text: "#67e8f9", border: "#0891b240" },
  complex: { bg: "#f59e0b18", text: "#fbbf24", border: "#f59e0b40" },
  untranslatable: { bg: "#f8717118", text: "#f87171", border: "#f8717140" },
  skip: { bg: "#ffffff0a", text: "#6b7280", border: "#ffffff18" },
};

export default function Badge({ type, label }) {
  const colors = BADGE_COLORS[type] || BADGE_COLORS.skip;
  return (
    <span
      style={{
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: "4px",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.03em",
        fontFamily: "monospace",
        whiteSpace: "nowrap",
      }}
    >
      {label || type.toUpperCase()}
    </span>
  );
}
