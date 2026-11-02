import React from "react";

export function Switch({ label, checked, defaultChecked = false, disabled = false, onChange, style }) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isOn = checked !== undefined ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!isOn);
    onChange && onChange(!isOn);
  };
  return (
    <label onClick={toggle} style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", fontSize: 14.5, color: disabled ? "var(--text-muted)" : "var(--text-body)", opacity: disabled ? 0.6 : 1, userSelect: "none", ...style }}>
      <span style={{
        width: 38, height: 22, borderRadius: "var(--radius-pill)", flex: "none",
        background: isOn ? "var(--teal-500)" : "var(--gray-300)",
        position: "relative",
        transition: "background var(--duration-base) var(--ease-out)",
      }}>
        <span style={{
          position: "absolute", top: 2, left: isOn ? 18 : 2,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          boxShadow: "var(--shadow-sm)",
          transition: "left var(--duration-base) var(--ease-out)",
        }}></span>
      </span>
      {label}
    </label>
  );
}
