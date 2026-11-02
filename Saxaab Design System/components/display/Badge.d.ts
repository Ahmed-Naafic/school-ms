/** Small pill status label. */
export interface BadgeProps {
  tone?: "neutral" | "brand" | "accent" | "highlight" | "success" | "warning" | "danger";
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Badge(props: BadgeProps): JSX.Element;
