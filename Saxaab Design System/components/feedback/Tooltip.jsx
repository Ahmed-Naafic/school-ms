import React from "react";

export function Tooltip({ label, side = "top", style, children }) {
  const [show, setShow] = React.useState(false);
  const pos =
    side === "bottom" ? { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }
    : side === "left" ? { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" }
    : side === "right" ? { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" }
    : { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" };
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: "relative", display: "inline-flex", ...style }}
    >
      {children}
      {show && (
        <span role="tooltip" style={{
          position: "absolute", ...pos, zIndex: 100,
          background: "var(--navy-900)", color: "#fff",
          fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 600,
          padding: "6px 10px", borderRadius: "var(--radius-sm)",
          whiteSpace: "nowrap", boxShadow: "var(--shadow-md)",
          pointerEvents: "none",
        }}>{label}</span>
      )}
    </span>
  );
}
