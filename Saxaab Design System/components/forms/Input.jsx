import React from "react";

export function Input({ label, hint, error, size = "md", disabled = false, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const pad = size === "sm" ? "7px 12px" : "10px 14px";
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "var(--font-body)", ...style }}>
      {label && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-heading)" }}>{label}</span>}
      <input
        disabled={disabled}
        onFocus={(e) => { setFocus(true); rest.onFocus && rest.onFocus(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur && rest.onBlur(e); }}
        style={{
          fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-body)",
          background: disabled ? "var(--gray-100)" : "#fff",
          border: `1px solid ${error ? "var(--danger)" : focus ? "var(--teal-500)" : "var(--gray-300)"}`,
          boxShadow: focus ? "0 0 0 3px var(--teal-100)" : "none",
          borderRadius: "var(--radius-md)", padding: pad, outline: "none",
          transition: "border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
        }}
        {...rest}
      />
      {error ? (
        <span style={{ fontSize: 12.5, color: "var(--danger)" }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{hint}</span>
      ) : null}
    </label>
  );
}
