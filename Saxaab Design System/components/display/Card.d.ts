/**
 * Surface container: white, 18px radius, hairline border, soft shadow.
 * @startingPoint section="Display" subtitle="White card — 18px radius, hairline border, soft shadow" viewport="700x240"
 */
export interface CardProps {
  /** CSS padding value; default 24px */
  padding?: string;
  /** Lift + deepen shadow on hover */
  hoverable?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;
