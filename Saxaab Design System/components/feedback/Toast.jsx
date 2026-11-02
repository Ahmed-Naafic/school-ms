import React from "react";

const toastTones = {
  neutral: { bar: "var(--navy-800)" },
  success: { bar: "var(--success)" },
  warning: { bar: "var(--warning)" },
  danger: { bar: "var(--danger)" },
};

export function Toast({ tone = "neutral", title, description, onClose, style }) {
  const t = toastTones[tone] || toastTones.neutral;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      background: "#fff", border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)",
      padding: "13px 16px", maxWidth: 380, fontFamily: "var(--font-body)",
      ...style,
    }}>
      <span style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: t.bar, flex: "none" }}></span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-heading)" }}>{title}</div>}
        {description && <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.45 }}>{description}</div>}
      </div>
      {onClose && (
        <button aria-label="Dismiss" onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--gray-500)", padding: 2 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  );
}
