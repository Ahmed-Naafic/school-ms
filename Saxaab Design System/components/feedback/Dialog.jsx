import React from "react";
import { Button } from "../actions/Button.jsx";

export function Dialog({ open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onClose, children, style }) {
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(13,31,48,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div role="dialog" aria-modal="true" style={{
        background: "#fff", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
        padding: "28px", width: "min(440px, calc(100vw - 48px))", boxSizing: "border-box",
        fontFamily: "var(--font-body)", ...style,
      }}>
        {title && <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text-heading)", marginBottom: 8 }}>{title}</div>}
        {description && <div style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--text-body)", marginBottom: 8 }}>{description}</div>}
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          {onClose && <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>}
          {onConfirm && <Button variant="primary" onClick={onConfirm}>{confirmLabel}</Button>}
        </div>
      </div>
    </div>
  );
}
