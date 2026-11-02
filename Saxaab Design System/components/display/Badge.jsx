import React from "react";

const badgeTones = {
  neutral: { background: "var(--gray-100)", color: "var(--gray-700)" },
  brand: { background: "var(--navy-50)", color: "var(--navy-800)" },
  accent: { background: "var(--teal-50)", color: "var(--teal-700)" },
  highlight: { background: "var(--amber-100)", color: "var(--amber-600)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
};

export function Badge({ tone = "neutral", style, children, ...rest }) {
  const t = badgeTones[tone] || badgeTones.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700,
      letterSpacing: "0.02em",
      borderRadius: "var(--radius-pill)", padding: "4px 11px",
      ...t, ...style,
    }} {...rest}>{children}</span>
  );
}
