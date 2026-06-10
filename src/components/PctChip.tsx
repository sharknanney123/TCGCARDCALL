export default function PctChip({ value }: { value: number | string | null | undefined }) {
  const v = Number(value ?? 0);
  const cls = v > 0 ? "chip-up" : v < 0 ? "chip-down" : "chip-flat";
  return <span className={cls}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</span>;
}
