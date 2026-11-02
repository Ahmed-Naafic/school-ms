/** Pill segmented tabs; controlled or uncontrolled. */
export interface TabsProps {
  /** Strings or {value,label} pairs */
  tabs: Array<string | { value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
export declare function Tabs(props: TabsProps): JSX.Element;
