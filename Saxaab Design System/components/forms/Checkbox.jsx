import React from "react";

export function Checkbox({ label, checked, defaultChecked = false, disabled = false, onChange, style }) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isOn = checked !== undefined ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!isOn);
    onChange && onChange(!isOn);
  };
  return (
    <label onClick={toggle} style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontSize: 14.5, color: disabled ? "var(--text-muted)" : "var(--text-body)", opacity: disabled ? 0.6 : 1, userSelect: "none", ...style }}>
      <span style={{
        width: 19, height: 19, borderRadius: 6, flex: "none",
        border: `1.5px solid ${isOn ? "var(--teal-500)" : "var(--gray-300)"}`,
        background: isOn ? "var(--teal-500)" : "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
      }}>
        {isOn && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
      </span>
      {label}
    </label>
  );
}
