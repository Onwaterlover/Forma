// Tiny dependency-free SVG charts. Colours come from CSS tokens so both themes work.

export function TrendChart({
  points, label, height = 180,
}: {
  points: { x: string; raw: number; trend: number }[];
  label: string;
  height?: number;
}) {
  if (points.length === 0) return null;
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const vals = points.flatMap((p) => [p.raw, p.trend]);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 2) {
    min -= 1;
    max += 1;
  }
  const t0 = Date.parse(points[0]!.x);
  const t1 = Date.parse(points.at(-1)!.x);
  const span = Math.max(1, t1 - t0);
  const X = (d: string) => pad.l + ((Date.parse(d) - t0) / span) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.trend).toFixed(1)}`).join(" ");
  const ticks = [min, (min + max) / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeDasharray="3 4" />
          <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v.toFixed(1)}</text>
        </g>
      ))}
      {points.map((p) => <circle key={`r${p.x}`} cx={X(p.x)} cy={Y(p.raw)} r="3" fill="var(--muted)" opacity="0.55" />)}
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <text x={pad.l} y={H - 4} fontSize="11" fill="var(--muted)">{points[0]!.x.slice(5)}</text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="11" fill="var(--muted)">{points.at(-1)!.x.slice(5)}</text>
    </svg>
  );
}

export function Bars({ data, label, refLine, height = 120 }: { data: { label: string; value: number }[]; label: string; refLine?: number | null; height?: number }) {
  const W = 640;
  const H = height;
  const pad = { t: 8, b: 20 };
  const max = Math.max(1, refLine ?? 0, ...data.map((d) => d.value)) * 1.1;
  const bw = W / Math.max(1, data.length);
  const Y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      {data.map((d, i) => (
        <g key={i}>
          <rect x={i * bw + bw * 0.18} y={Y(d.value)} width={bw * 0.64} height={Math.max(0, H - pad.b - Y(d.value))} rx="4" fill="var(--accent)" opacity={d.value ? 0.85 : 0.2} />
          <text x={i * bw + bw / 2} y={H - 5} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>
        </g>
      ))}
      {refLine ? <line x1="0" x2={W} y1={Y(refLine)} y2={Y(refLine)} stroke="var(--warning)" strokeDasharray="5 4" strokeWidth="1.5" /> : null}
    </svg>
  );
}
