/** Single radio option; controlled — manage the group's selected value yourself. */
export interface RadioProps {
  label?: React.ReactNode;
  checked?: boolean;
  disabled?: boolean;
  name?: string;
  /** Called when this option is picked */
  onChange?: () => void;
  style?: React.CSSProperties;
}
export declare function Radio(props: RadioProps): JSX.Element;
