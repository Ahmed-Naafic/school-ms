import React from "react";

export function Select({ label, options = [], disabled = false, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "var(--font-body)", ...style }}>
      {label && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-heading)" }}>{label}</span>}
      <div style={{ position: "relative", display: "flex" }}>
        <select
          disabled={disabled}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            appearance: "none", WebkitAppearance: "none", width: "100%",
            fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-body)",
            background: disabled ? "var(--gray-100)" : "#fff",
            border: `1px solid ${focus ? "var(--teal-500)" : "var(--gray-300)"}`,
            boxShadow: focus ? "0 0 0 3px var(--teal-100)" : "none",
            borderRadius: "var(--radius-md)", padding: "10px 36px 10px 14px",
            outline: "none", cursor: disabled ? "not-allowed" : "pointer",
          }}
          {...rest}
        >
          {options.map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return <option key={opt.value} value={opt.value}>{opt.label}</option>;
          })}
        </select>
        <svg style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--gray-500)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
    </label>
  );
}
