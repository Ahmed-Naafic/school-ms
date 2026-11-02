/** Inline notification card with tone bar; position it yourself (usually fixed bottom-right). */
export interface ToastProps {
  tone?: "neutral" | "success" | "warning" | "danger";
  title?: string;
  description?: React.ReactNode;
  onClose?: () => void;
  style?: React.CSSProperties;
}
export declare function Toast(props: ToastProps): JSX.Element;
