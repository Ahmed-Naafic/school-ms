import React from "react";

const ibVariants = {
  primary: { rest: { background: "var(--navy-800)", color: "#fff", border: "1px solid transparent" }, hover: { background: "var(--navy-900)" } },
  secondary: { rest: { background: "var(--teal-50)", color: "var(--teal-700)", border: "1px solid var(--teal-100)" }, hover: { background: "var(--teal-100)" } },
  ghost: { rest: { background: "transparent", color: "var(--gray-700)", border: "1px solid transparent" }, hover: { background: "var(--gray-100)" } },
  outline: { rest: { background: "transparent", color: "var(--navy-800)", border: "1px solid var(--gray-300)" }, hover: { background: "var(--gray-100)" } },
};

const ibSizes = { sm: 32, md: 40, lg: 48 };

export function IconButton({ variant = "ghost", size = "md", disabled = false, label, style, children, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const v = ibVariants[variant] || ibVariants.ghost;
  const s = ibSizes[size] || 40;
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: s, height: s, borderRadius: "var(--radius-pill)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background var(--duration-fast) var(--ease-out)",
        ...v.rest,
        ...(hover && !disabled ? v.hover : null),
        ...(disabled ? { opacity: 0.45 } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
