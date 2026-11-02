/** Hover tooltip; wraps its trigger. */
export interface TooltipProps {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Tooltip(props: TooltipProps): JSX.Element;
