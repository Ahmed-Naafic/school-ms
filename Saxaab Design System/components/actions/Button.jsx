import React from "react";

const base = {
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  border: "1px solid transparent",
  borderRadius: "var(--radius-pill)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  transition: "background var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
  whiteSpace: "nowrap",
};

const sizes = {
  sm: { fontSize: "13px", padding: "7px 14px", minHeight: "32px" },
  md: { fontSize: "14px", padding: "10px 20px", minHeight: "40px" },
  lg: { fontSize: "15px", padding: "13px 26px", minHeight: "48px" },
};

const variants = {
  primary: {
    rest: { background: "var(--navy-800)", color: "#fff" },
    hover: { background: "var(--navy-900)" },
  },
  accent: {
    rest: { background: "var(--teal-500)", color: "#fff" },
    hover: { background: "var(--teal-600)" },
  },
  secondary: {
    rest: { background: "var(--teal-50)", color: "var(--teal-700)", borderColor: "var(--teal-100)" },
    hover: { background: "var(--teal-100)" },
  },
  outline: {
    rest: { background: "transparent", color: "var(--navy-800)", borderColor: "var(--gray-300)" },
    hover: { background: "var(--gray-100)" },
  },
  ghost: {
    rest: { background: "transparent", color: "var(--navy-800)" },
    hover: { background: "var(--gray-100)" },
  },
};

export function Button({ variant = "primary", size = "md", disabled = false, style, children, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const v = variants[variant] || variants.primary;
  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        ...base,
        ...sizes[size],
        ...v.rest,
        ...(hover && !disabled ? v.hover : null),
        ...(press && !disabled ? { transform: "translateY(1px)" } : null),
        ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
