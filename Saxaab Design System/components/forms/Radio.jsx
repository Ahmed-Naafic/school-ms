import React from "react";

export function Radio({ label, checked = false, disabled = false, onChange, name, style }) {
  return (
    <label onClick={() => !disabled && onChange && onChange()} style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontSize: 14.5, color: disabled ? "var(--text-muted)" : "var(--text-body)", opacity: disabled ? 0.6 : 1, userSelect: "none", ...style }}>
      <span style={{
        width: 19, height: 19, borderRadius: "50%", flex: "none",
        border: `1.5px solid ${checked ? "var(--teal-500)" : "var(--gray-300)"}`,
        background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "border-color var(--duration-fast) var(--ease-out)",
      }}>
        {checked && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--teal-500)" }}></span>}
      </span>
      {label}
    </label>
  );
}
