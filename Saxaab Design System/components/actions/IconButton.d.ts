/** Circular icon-only button; requires an accessible label. */
export interface IconButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Accessible name (aria-label + title) */
  label: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  /** The icon element (e.g. a Lucide SVG) */
  children?: React.ReactNode;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
