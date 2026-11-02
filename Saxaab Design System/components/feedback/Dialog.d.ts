/** Modal dialog on a navy scrim; closes on backdrop click. */
export interface DialogProps {
  open: boolean;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose?: () => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
