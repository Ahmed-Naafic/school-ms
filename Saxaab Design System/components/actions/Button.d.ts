/**
 * Primary action button.
 * @startingPoint section="Actions" subtitle="Pill buttons — primary, accent, secondary, outline, ghost" viewport="700x220"
 */
export interface ButtonProps {
  /** Visual style */
  variant?: "primary" | "accent" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
