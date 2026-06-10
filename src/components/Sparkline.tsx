type Props = { points: number[]; width?: number; height?: number };

/** Dependency-free SVG price chart. */
export default function Sparkline({ points, width = 560, height = 160 }: Props) {
  if (points.length < 2) {
    return <p className="text-sm text-faded">Price history will appear after a few daily updates.</p>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 8;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const color = up ? "#3FB68B" : "#E0584F";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img"
         aria-label={`Price chart from $${points[0].toFixed(2)} to $${points[points.length - 1].toFixed(2)}`}>
      <path d={`${d} L${x(points.length - 1)},${height - pad} L${x(0)},${height - pad} Z`}
            fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="3.5" fill={color} />
    </svg>
  );
}
