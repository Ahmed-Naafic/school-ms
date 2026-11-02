import React from "react";

export function Tabs({ tabs = [], value, defaultValue, onChange, style }) {
  const [internal, setInternal] = React.useState(defaultValue ?? (tabs[0] && (tabs[0].value ?? tabs[0])));
  const active = value !== undefined ? value : internal;
  const pick = (v) => {
    if (value === undefined) setInternal(v);
    onChange && onChange(v);
  };
  return (
    <div style={{ display: "inline-flex", gap: 4, background: "var(--gray-100)", borderRadius: "var(--radius-pill)", padding: 4, fontFamily: "var(--font-body)", ...style }}>
      {tabs.map((t) => {
        const tab = typeof t === "string" ? { value: t, label: t } : t;
        const on = tab.value === active;
        return (
          <button
            key={tab.value}
            onClick={() => pick(tab.value)}
            style={{
              border: "none", cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700,
              padding: "8px 18px", borderRadius: "var(--radius-pill)",
              background: on ? "#fff" : "transparent",
              color: on ? "var(--navy-800)" : "var(--gray-500)",
              boxShadow: on ? "var(--shadow-sm)" : "none",
              transition: "color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
