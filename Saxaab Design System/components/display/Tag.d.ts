/** Removable filter/topic chip. */
export interface TagProps {
  /** Show an ✕ and call this when clicked */
  onRemove?: () => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Tag(props: TagProps): JSX.Element;
