import React from "react";

export function Card({ padding = "24px", hoverable = false, style, children, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: hoverable && hover ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hoverable && hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--duration-base) var(--ease-out), transform var(--duration-base) var(--ease-out)",
        padding,
        fontFamily: "var(--font-body)",
        color: "var(--text-body)",
        boxSizing: "border-box",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
