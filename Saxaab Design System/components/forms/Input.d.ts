/** Single-line text input with label, hint, and error states. */
export interface InputProps {
  label?: string;
  hint?: string;
  /** Error message; also colors the border */
  error?: string;
  size?: "sm" | "md";
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  type?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;
