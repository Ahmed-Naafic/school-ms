import React from "react";

export function Tag({ onRemove, style, children, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
      color: "var(--gray-700)", background: "#fff",
      border: "1px solid var(--gray-300)",
      borderRadius: "var(--radius-pill)", padding: "4px 12px",
      ...style,
    }} {...rest}>
      {children}
      {onRemove && (
        <button
          aria-label="Remove"
          onClick={onRemove}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            border: "none", background: hover ? "var(--gray-100)" : "transparent",
            borderRadius: "50%", width: 16, height: 16, padding: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--gray-500)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      )}
    </span>
  );
}
