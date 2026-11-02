/* @ds-bundle: {"format":4,"namespace":"SaxaabDesignSystem_624abb","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"Tag","sourcePath":"components/display/Tag.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"5cd1777fb880","components/actions/IconButton.jsx":"5924bff166c6","components/display/Badge.jsx":"e4fa5c84de55","components/display/Card.jsx":"22eca4abe72e","components/display/Tag.jsx":"9020e3222d4b","components/feedback/Dialog.jsx":"2908fd951554","components/feedback/Toast.jsx":"881eaa72d494","components/feedback/Tooltip.jsx":"1699e83f067b","components/forms/Checkbox.jsx":"d9276af9c87a","components/forms/Input.jsx":"6f5d1dab2c71","components/forms/Radio.jsx":"1ff87da37519","components/forms/Select.jsx":"29b03f3df0f0","components/forms/Switch.jsx":"765bd386970c","components/navigation/Tabs.jsx":"8877ec91f69e","ui_kits/website/Header.jsx":"1812dec95c3d","ui_kits/website/Hero.jsx":"c371862956f9","ui_kits/website/Icons.jsx":"7ab76742c28a","ui_kits/website/Services.jsx":"f2f889f0bfc3","ui_kits/website/WhySaxaab.jsx":"743d478f46fc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SaxaabDesignSystem_624abb = window.SaxaabDesignSystem_624abb || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  whiteSpace: "nowrap"
};
const sizes = {
  sm: {
    fontSize: "13px",
    padding: "7px 14px",
    minHeight: "32px"
  },
  md: {
    fontSize: "14px",
    padding: "10px 20px",
    minHeight: "40px"
  },
  lg: {
    fontSize: "15px",
    padding: "13px 26px",
    minHeight: "48px"
  }
};
const variants = {
  primary: {
    rest: {
      background: "var(--navy-800)",
      color: "#fff"
    },
    hover: {
      background: "var(--navy-900)"
    }
  },
  accent: {
    rest: {
      background: "var(--teal-500)",
      color: "#fff"
    },
    hover: {
      background: "var(--teal-600)"
    }
  },
  secondary: {
    rest: {
      background: "var(--teal-50)",
      color: "var(--teal-700)",
      borderColor: "var(--teal-100)"
    },
    hover: {
      background: "var(--teal-100)"
    }
  },
  outline: {
    rest: {
      background: "transparent",
      color: "var(--navy-800)",
      borderColor: "var(--gray-300)"
    },
    hover: {
      background: "var(--gray-100)"
    }
  },
  ghost: {
    rest: {
      background: "transparent",
      color: "var(--navy-800)"
    },
    hover: {
      background: "var(--gray-100)"
    }
  }
};
function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  style,
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      ...base,
      ...sizes[size],
      ...v.rest,
      ...(hover && !disabled ? v.hover : null),
      ...(press && !disabled ? {
        transform: "translateY(1px)"
      } : null),
      ...(disabled ? {
        opacity: 0.45,
        cursor: "not-allowed"
      } : null),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ibVariants = {
  primary: {
    rest: {
      background: "var(--navy-800)",
      color: "#fff",
      border: "1px solid transparent"
    },
    hover: {
      background: "var(--navy-900)"
    }
  },
  secondary: {
    rest: {
      background: "var(--teal-50)",
      color: "var(--teal-700)",
      border: "1px solid var(--teal-100)"
    },
    hover: {
      background: "var(--teal-100)"
    }
  },
  ghost: {
    rest: {
      background: "transparent",
      color: "var(--gray-700)",
      border: "1px solid transparent"
    },
    hover: {
      background: "var(--gray-100)"
    }
  },
  outline: {
    rest: {
      background: "transparent",
      color: "var(--navy-800)",
      border: "1px solid var(--gray-300)"
    },
    hover: {
      background: "var(--gray-100)"
    }
  }
};
const ibSizes = {
  sm: 32,
  md: 40,
  lg: 48
};
function IconButton({
  variant = "ghost",
  size = "md",
  disabled = false,
  label,
  style,
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const v = ibVariants[variant] || ibVariants.ghost;
  const s = ibSizes[size] || 40;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    title: label,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: s,
      height: s,
      borderRadius: "var(--radius-pill)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background var(--duration-fast) var(--ease-out)",
      ...v.rest,
      ...(hover && !disabled ? v.hover : null),
      ...(disabled ? {
        opacity: 0.45
      } : null),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const badgeTones = {
  neutral: {
    background: "var(--gray-100)",
    color: "var(--gray-700)"
  },
  brand: {
    background: "var(--navy-50)",
    color: "var(--navy-800)"
  },
  accent: {
    background: "var(--teal-50)",
    color: "var(--teal-700)"
  },
  highlight: {
    background: "var(--amber-100)",
    color: "var(--amber-600)"
  },
  success: {
    background: "var(--success-bg)",
    color: "var(--success)"
  },
  warning: {
    background: "var(--warning-bg)",
    color: "var(--warning)"
  },
  danger: {
    background: "var(--danger-bg)",
    color: "var(--danger)"
  }
};
function Badge({
  tone = "neutral",
  style,
  children,
  ...rest
}) {
  const t = badgeTones[tone] || badgeTones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontFamily: "var(--font-body)",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.02em",
      borderRadius: "var(--radius-pill)",
      padding: "4px 11px",
      ...t,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  padding = "24px",
  hoverable = false,
  style,
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
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
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/display/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tag({
  onRemove,
  style,
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontFamily: "var(--font-body)",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--gray-700)",
      background: "#fff",
      border: "1px solid var(--gray-300)",
      borderRadius: "var(--radius-pill)",
      padding: "4px 12px",
      ...style
    }
  }, rest), children, onRemove && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Remove",
    onClick: onRemove,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      border: "none",
      background: hover ? "var(--gray-100)" : "transparent",
      borderRadius: "50%",
      width: 16,
      height: 16,
      padding: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      color: "var(--gray-500)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function Dialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
  children,
  style
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      if (e.target === e.currentTarget && onClose) onClose();
    },
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(13,31,48,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    style: {
      background: "#fff",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-lg)",
      padding: "28px",
      width: "min(440px, calc(100vw - 48px))",
      boxSizing: "border-box",
      fontFamily: "var(--font-body)",
      ...style
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 20,
      color: "var(--text-heading)",
      marginBottom: 8
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      lineHeight: 1.55,
      color: "var(--text-body)",
      marginBottom: 8
    }
  }, description), children, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 20
    }
  }, onClose && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    onClick: onClose
  }, cancelLabel), onConfirm && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    onClick: onConfirm
  }, confirmLabel))));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const toastTones = {
  neutral: {
    bar: "var(--navy-800)"
  },
  success: {
    bar: "var(--success)"
  },
  warning: {
    bar: "var(--warning)"
  },
  danger: {
    bar: "var(--danger)"
  }
};
function Toast({
  tone = "neutral",
  title,
  description,
  onClose,
  style
}) {
  const t = toastTones[tone] || toastTones.neutral;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      background: "#fff",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      boxShadow: "var(--shadow-md)",
      padding: "13px 16px",
      maxWidth: 380,
      fontFamily: "var(--font-body)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 4,
      alignSelf: "stretch",
      borderRadius: 2,
      background: t.bar,
      flex: "none"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 700,
      color: "var(--text-heading)"
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--text-muted)",
      marginTop: 2,
      lineHeight: 1.45
    }
  }, description)), onClose && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Dismiss",
    onClick: onClose,
    style: {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      color: "var(--gray-500)",
      padding: 2
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function Tooltip({
  label,
  side = "top",
  style,
  children
}) {
  const [show, setShow] = React.useState(false);
  const pos = side === "bottom" ? {
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)"
  } : side === "left" ? {
    right: "calc(100% + 8px)",
    top: "50%",
    transform: "translateY(-50%)"
  } : side === "right" ? {
    left: "calc(100% + 8px)",
    top: "50%",
    transform: "translateY(-50%)"
  } : {
    bottom: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)"
  };
  return /*#__PURE__*/React.createElement("span", {
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false),
    style: {
      position: "relative",
      display: "inline-flex",
      ...style
    }
  }, children, show && /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      position: "absolute",
      ...pos,
      zIndex: 100,
      background: "var(--navy-900)",
      color: "#fff",
      fontFamily: "var(--font-body)",
      fontSize: 12.5,
      fontWeight: 600,
      padding: "6px 10px",
      borderRadius: "var(--radius-sm)",
      whiteSpace: "nowrap",
      boxShadow: "var(--shadow-md)",
      pointerEvents: "none"
    }
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  label,
  checked,
  defaultChecked = false,
  disabled = false,
  onChange,
  style
}) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isOn = checked !== undefined ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!isOn);
    onChange && onChange(!isOn);
  };
  return /*#__PURE__*/React.createElement("label", {
    onClick: toggle,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "var(--font-body)",
      fontSize: 14.5,
      color: disabled ? "var(--text-muted)" : "var(--text-body)",
      opacity: disabled ? 0.6 : 1,
      userSelect: "none",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 19,
      height: 19,
      borderRadius: 6,
      flex: "none",
      border: `1.5px solid ${isOn ? "var(--teal-500)" : "var(--gray-300)"}`,
      background: isOn ? "var(--teal-500)" : "#fff",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)"
    }
  }, isOn && /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }))), label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  error,
  size = "md",
  disabled = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const pad = size === "sm" ? "7px 12px" : "10px 14px";
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      fontFamily: "var(--font-body)",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--text-heading)"
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: e => {
      setFocus(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 15,
      color: "var(--text-body)",
      background: disabled ? "var(--gray-100)" : "#fff",
      border: `1px solid ${error ? "var(--danger)" : focus ? "var(--teal-500)" : "var(--gray-300)"}`,
      boxShadow: focus ? "0 0 0 3px var(--teal-100)" : "none",
      borderRadius: "var(--radius-md)",
      padding: pad,
      outline: "none",
      transition: "border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)"
    }
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--danger)"
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--text-muted)"
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function Radio({
  label,
  checked = false,
  disabled = false,
  onChange,
  name,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    onClick: () => !disabled && onChange && onChange(),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 9,
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "var(--font-body)",
      fontSize: 14.5,
      color: disabled ? "var(--text-muted)" : "var(--text-body)",
      opacity: disabled ? 0.6 : 1,
      userSelect: "none",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 19,
      height: 19,
      borderRadius: "50%",
      flex: "none",
      border: `1.5px solid ${checked ? "var(--teal-500)" : "var(--gray-300)"}`,
      background: "#fff",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "border-color var(--duration-fast) var(--ease-out)"
    }
  }, checked && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: "var(--teal-500)"
    }
  })), label);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  options = [],
  disabled = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      fontFamily: "var(--font-body)",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--text-heading)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      appearance: "none",
      WebkitAppearance: "none",
      width: "100%",
      fontFamily: "var(--font-body)",
      fontSize: 15,
      color: "var(--text-body)",
      background: disabled ? "var(--gray-100)" : "#fff",
      border: `1px solid ${focus ? "var(--teal-500)" : "var(--gray-300)"}`,
      boxShadow: focus ? "0 0 0 3px var(--teal-100)" : "none",
      borderRadius: "var(--radius-md)",
      padding: "10px 36px 10px 14px",
      outline: "none",
      cursor: disabled ? "not-allowed" : "pointer"
    }
  }, rest), options.map(o => {
    const opt = typeof o === "string" ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value
    }, opt.label);
  })), /*#__PURE__*/React.createElement("svg", {
    style: {
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)",
      pointerEvents: "none",
      color: "var(--gray-500)"
    },
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  label,
  checked,
  defaultChecked = false,
  disabled = false,
  onChange,
  style
}) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isOn = checked !== undefined ? checked : internal;
  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!isOn);
    onChange && onChange(!isOn);
  };
  return /*#__PURE__*/React.createElement("label", {
    onClick: toggle,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "var(--font-body)",
      fontSize: 14.5,
      color: disabled ? "var(--text-muted)" : "var(--text-body)",
      opacity: disabled ? 0.6 : 1,
      userSelect: "none",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 22,
      borderRadius: "var(--radius-pill)",
      flex: "none",
      background: isOn ? "var(--teal-500)" : "var(--gray-300)",
      position: "relative",
      transition: "background var(--duration-base) var(--ease-out)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 2,
      left: isOn ? 18 : 2,
      width: 18,
      height: 18,
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "var(--shadow-sm)",
      transition: "left var(--duration-base) var(--ease-out)"
    }
  })), label);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  style
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? (tabs[0] && (tabs[0].value ?? tabs[0])));
  const active = value !== undefined ? value : internal;
  const pick = v => {
    if (value === undefined) setInternal(v);
    onChange && onChange(v);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      gap: 4,
      background: "var(--gray-100)",
      borderRadius: "var(--radius-pill)",
      padding: 4,
      fontFamily: "var(--font-body)",
      ...style
    }
  }, tabs.map(t => {
    const tab = typeof t === "string" ? {
      value: t,
      label: t
    } : t;
    const on = tab.value === active;
    return /*#__PURE__*/React.createElement("button", {
      key: tab.value,
      onClick: () => pick(tab.value),
      style: {
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontSize: 14,
        fontWeight: 700,
        padding: "8px 18px",
        borderRadius: "var(--radius-pill)",
        background: on ? "#fff" : "transparent",
        color: on ? "var(--navy-800)" : "var(--gray-500)",
        boxShadow: on ? "var(--shadow-sm)" : "none",
        transition: "color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)"
      }
    }, tab.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Header.jsx
try { (() => {
const {
  Button
} = window.SaxaabDesignSystem_624abb;
function Wordmark({
  inverse = false
}) {
  return /*#__PURE__*/React.createElement("a", {
    href: "#top",
    onClick: e => {
      e.preventDefault();
      document.getElementById("top").scrollTo ? null : null;
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    },
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 8,
      textDecoration: "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: 24,
      letterSpacing: "-0.01em",
      color: inverse ? "#fff" : "var(--navy-800)"
    }
  }, "saxaab"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 11.5,
      fontWeight: 600,
      color: inverse ? "rgba(255,255,255,0.65)" : "var(--gray-500)"
    }
  }, "trusted ICT solution"));
}
function NavLink({
  href,
  children
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onClick: e => {
      e.preventDefault();
      const el = document.querySelector(href);
      if (el) window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 72,
        behavior: "smooth"
      });
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14.5,
      fontWeight: 700,
      textDecoration: "none",
      color: hover ? "var(--teal-600)" : "var(--gray-700)",
      transition: "color var(--duration-fast) var(--ease-out)"
    }
  }, children);
}
function Header({
  onContact
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 50,
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "blur(8px)",
      borderBottom: "1px solid var(--border-default)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "0 var(--gutter)",
      height: 68,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement(Wordmark, null), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 28
    }
  }, /*#__PURE__*/React.createElement(NavLink, {
    href: "#services"
  }, "Services"), /*#__PURE__*/React.createElement(NavLink, {
    href: "#why"
  }, "Why Saxaab"), /*#__PURE__*/React.createElement(NavLink, {
    href: "#contact"
  }, "Contact"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    onClick: onContact
  }, "Talk to us"))));
}
Object.assign(window, {
  Header,
  Wordmark
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Hero.jsx
try { (() => {
const {
  Button,
  Badge
} = window.SaxaabDesignSystem_624abb;
function Hero({
  onContact
}) {
  return /*#__PURE__*/React.createElement("section", {
    id: "top",
    style: {
      background: "var(--surface-card)",
      borderBottom: "1px solid var(--border-default)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "80px var(--gutter) 72px",
      display: "grid",
      gridTemplateColumns: "1.15fr 0.85fr",
      gap: 48,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: "var(--tracking-caps)",
      textTransform: "uppercase",
      color: "var(--teal-600)",
      marginBottom: 14
    }
  }, "Trusted ICT solution"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-4xl)",
      lineHeight: "var(--leading-tight)",
      letterSpacing: "var(--tracking-display)",
      color: "var(--text-heading)"
    }
  }, "IT that just works, so your team can."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "18px 0 0",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)",
      lineHeight: "var(--leading-body)",
      color: "var(--gray-700)",
      maxWidth: "48ch"
    }
  }, "Saxaab manages your networks, devices, cloud, and support \u2014 one partner for your whole stack, with honest advice and answers when you call."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginTop: 28
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    onClick: onContact
  }, "Talk to us"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    onClick: () => {
      const el = document.querySelector("#services");
      if (el) window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 72,
        behavior: "smooth"
      });
    }
  }, "See services")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 24,
      marginTop: 36,
      fontFamily: "var(--font-body)",
      fontSize: 13.5,
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--amber-600)",
      fontSize: 17
    }
  }, "24/7"), " support desk"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--amber-600)",
      fontSize: 17
    }
  }, "99.9%"), " uptime target"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--amber-600)",
      fontSize: 17
    }
  }, "15 min"), " avg response"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--gray-50)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-lg)",
      padding: 32
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/saxaab-logo.png",
    alt: "Saxaab \u2014 Trusted ICT solution",
    style: {
      width: "100%",
      maxWidth: 340
    }
  }))));
}
Object.assign(window, {
  Hero
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Icons.jsx
try { (() => {
// Lucide icon paths (ISC license) copied inline for React use.
const Icon = ({
  children,
  size = 24,
  style
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: style
}, children);
const ServerIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("rect", {
  width: "20",
  height: "8",
  x: "2",
  y: "2",
  rx: "2",
  ry: "2"
}), /*#__PURE__*/React.createElement("rect", {
  width: "20",
  height: "8",
  x: "2",
  y: "14",
  rx: "2",
  ry: "2"
}), /*#__PURE__*/React.createElement("line", {
  x1: "6",
  x2: "6.01",
  y1: "6",
  y2: "6"
}), /*#__PURE__*/React.createElement("line", {
  x1: "6",
  x2: "6.01",
  y1: "18",
  y2: "18"
}));
const ShieldIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
}), /*#__PURE__*/React.createElement("path", {
  d: "m9 12 2 2 4-4"
}));
const CloudIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("path", {
  d: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
}));
const HeadphonesIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("path", {
  d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm18 0h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3 14v-3a9 9 0 0 1 18 0v3"
}));
const NetworkIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("rect", {
  x: "16",
  y: "16",
  width: "6",
  height: "6",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "16",
  width: "6",
  height: "6",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "9",
  y: "2",
  width: "6",
  height: "6",
  rx: "1"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 12V8"
}));
const PhoneIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("path", {
  d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
}));
const MailIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("rect", {
  width: "20",
  height: "16",
  x: "2",
  y: "4",
  rx: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
}));
const PinIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "10",
  r: "3"
}));
const CheckIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("path", {
  d: "M20 6 9 17l-5-5"
}));
const ArrowIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("path", {
  d: "M5 12h14"
}), /*#__PURE__*/React.createElement("path", {
  d: "m12 5 7 7-7 7"
}));
const MonitorIcon = p => /*#__PURE__*/React.createElement(Icon, p, /*#__PURE__*/React.createElement("rect", {
  width: "20",
  height: "14",
  x: "2",
  y: "3",
  rx: "2"
}), /*#__PURE__*/React.createElement("line", {
  x1: "8",
  x2: "16",
  y1: "21",
  y2: "21"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  x2: "12",
  y1: "17",
  y2: "21"
}));
Object.assign(window, {
  ServerIcon,
  ShieldIcon,
  CloudIcon,
  HeadphonesIcon,
  NetworkIcon,
  PhoneIcon,
  MailIcon,
  PinIcon,
  CheckIcon,
  ArrowIcon,
  MonitorIcon
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Services.jsx
try { (() => {
const {
  Card,
  Badge
} = window.SaxaabDesignSystem_624abb;
const services = [{
  icon: "HeadphonesIcon",
  title: "Managed IT support",
  desc: "Helpdesk, patching, and device management for your whole team — remote and on-site."
}, {
  icon: "NetworkIcon",
  title: "Network & infrastructure",
  desc: "Design, cabling, Wi-Fi, and monitoring for offices, warehouses, and branches."
}, {
  icon: "CloudIcon",
  title: "Cloud & hosting",
  desc: "Migration, backup, and day-to-day management of Microsoft 365 and cloud servers."
}, {
  icon: "ShieldIcon",
  title: "Security & compliance",
  desc: "Firewalls, endpoint protection, audits, and staff awareness training."
}, {
  icon: "MonitorIcon",
  title: "Hardware & procurement",
  desc: "Laptops, servers, and peripherals — sourced, configured, and delivered ready to use."
}, {
  icon: "ServerIcon",
  title: "Business systems",
  desc: "VoIP telephony, CCTV, access control, and the systems that keep operations moving."
}];
function SectionHead({
  eyebrow,
  title,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 560,
      marginBottom: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: "var(--tracking-caps)",
      textTransform: "uppercase",
      color: "var(--teal-600)",
      marginBottom: 10
    }
  }, eyebrow), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-2xl)",
      lineHeight: "var(--leading-snug)",
      color: "var(--text-heading)"
    }
  }, title), sub && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "10px 0 0",
      fontFamily: "var(--font-body)",
      fontSize: 15,
      lineHeight: "var(--leading-body)",
      color: "var(--text-muted)"
    }
  }, sub));
}
function Services() {
  return /*#__PURE__*/React.createElement("section", {
    id: "services",
    style: {
      background: "var(--surface-page)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "72px var(--gutter)"
    }
  }, /*#__PURE__*/React.createElement(SectionHead, {
    eyebrow: "Services",
    title: "One partner for your whole stack",
    sub: "From the cable in the wall to the cloud, we design, run, and support it."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 20
    }
  }, services.map(s => {
    const I = window[s.icon];
    return /*#__PURE__*/React.createElement(Card, {
      key: s.title,
      hoverable: true
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 46,
        height: 46,
        borderRadius: "var(--radius-md)",
        background: "var(--teal-50)",
        color: "var(--teal-600)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement(I, {
      size: 22
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 17,
        color: "var(--text-heading)",
        marginBottom: 6
      }
    }, s.title), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-body)",
        fontSize: 14,
        lineHeight: "var(--leading-body)",
        color: "var(--text-muted)"
      }
    }, s.desc));
  }))));
}
Object.assign(window, {
  Services,
  SectionHead
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Services.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/WhySaxaab.jsx
try { (() => {
function WhySaxaab({
  onContact
}) {
  const {
    Button
  } = window.SaxaabDesignSystem_624abb;
  const points = ["One contract, one number to call — no vendor ping-pong", "Proactive monitoring: we usually see problems before you do", "Plain-language advice, honest quotes, no jargon walls", "Local engineers with 24/7 remote support behind them"];
  return /*#__PURE__*/React.createElement("section", {
    id: "why",
    style: {
      background: "var(--navy-900)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--container-max)",
      margin: "0 auto",
      padding: "72px var(--gutter)",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 48,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: "var(--tracking-caps)",
      textTransform: "uppercase",
      color: "var(--teal-500)",
      marginBottom: 10
    }
  }, "Why Saxaab"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: "var(--text-2xl)",
      lineHeight: "var(--leading-snug)",
      color: "#fff"
    }
  }, "Trusted means we answer for it."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "12px 0 24px",
      fontFamily: "var(--font-body)",
      fontSize: 15,
      lineHeight: "var(--leading-body)",
      color: "rgba(255,255,255,0.75)",
      maxWidth: "46ch"
    }
  }, "We take end-to-end responsibility for your ICT \u2014 and we're measured on it."), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    onClick: onContact
  }, "Get a quote")), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, points.map(p => /*#__PURE__*/React.createElement("li", {
    key: p,
    style: {
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "var(--radius-md)",
      padding: "14px 16px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--amber-500)",
      flex: "none",
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(window.CheckIcon, {
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-body)",
      fontSize: 14.5,
      lineHeight: 1.5,
      color: "rgba(255,255,255,0.92)"
    }
  }, p))))));
}
Object.assign(window, {
  WhySaxaab
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/WhySaxaab.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
